\set ON_ERROR_STOP on

-- Apply only AFTER the source/target migration gate has verified an exact DABBIR restore.

-- Replace the one Supabase-Vault-only QA helper with a fail-closed managed-runtime stub.
-- Protected QA shares will live in AWS Secrets Manager, not in the application database.
CREATE OR REPLACE FUNCTION public.dabbir_qa_consume_protected_share()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'DABBIR_PROTECTED_QA_SHARE_MOVED_TO_AWS';
END;
$$;

CREATE OR REPLACE FUNCTION dabbir_private.ensure_auth_mirror()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_user_id uuid := auth.uid();
  v_role text := auth.role();
  v_iat bigint;
  v_seen_at timestamptz;
BEGIN
  IF v_role IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    v_iat := nullif(v_claims ->> 'iat','')::bigint;
  EXCEPTION WHEN others THEN
    v_iat := NULL;
  END;
  v_seen_at := CASE WHEN v_iat IS NULL THEN now() ELSE to_timestamp(v_iat) END;

  INSERT INTO auth.users(
    id,aud,role,email,phone,raw_app_meta_data,raw_user_meta_data,
    created_at,updated_at,last_sign_in_at
  ) VALUES (
    v_user_id,
    'authenticated',
    'authenticated',
    nullif(v_claims ->> 'email',''),
    nullif(v_claims ->> 'phone',''),
    coalesce(v_claims -> 'app_metadata','{}'::jsonb),
    coalesce(v_claims -> 'user_metadata','{}'::jsonb),
    v_seen_at,
    now(),
    v_seen_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = coalesce(EXCLUDED.email, auth.users.email),
    phone = coalesce(EXCLUDED.phone, auth.users.phone),
    raw_app_meta_data = CASE WHEN EXCLUDED.raw_app_meta_data='{}'::jsonb THEN auth.users.raw_app_meta_data ELSE EXCLUDED.raw_app_meta_data END,
    raw_user_meta_data = CASE WHEN EXCLUDED.raw_user_meta_data='{}'::jsonb THEN auth.users.raw_user_meta_data ELSE EXCLUDED.raw_user_meta_data END,
    last_sign_in_at = greatest(coalesce(auth.users.last_sign_in_at, EXCLUDED.last_sign_in_at), EXCLUDED.last_sign_in_at),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION dabbir_private.ensure_auth_mirror() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dabbir_private.ensure_auth_mirror() TO anon, authenticated, service_role;

-- RDS does not grant PostgreSQL SUPERUSER/BYPASSRLS to customer roles. Instead,
-- the internal service JWT receives explicit full access only to DABBIR relations.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname,tablename
    FROM pg_tables
    WHERE schemaname='dabbir_private'
       OR (schemaname='public' AND (tablename LIKE 'dabbir%' OR tablename='account_access_state'))
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO service_role',r.schemaname,r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS dabbir_service_role_all ON %I.%I',r.schemaname,r.tablename);
    EXECUTE format(
      'CREATE POLICY dabbir_service_role_all ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      r.schemaname,r.tablename
    );
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA dabbir_private TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prokind IN ('f','p')
      AND (n.nspname='dabbir_private' OR (n.nspname='public' AND p.proname LIKE 'dabbir%'))
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',r.nspname,r.proname,r.args);
  END LOOP;
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname,c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='S'
      AND (n.nspname='dabbir_private' OR (n.nspname='public' AND c.relname LIKE 'dabbir%'))
  LOOP
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %I.%I TO service_role',r.nspname,r.relname);
  END LOOP;
END
$$;

GRANT SELECT ON auth.users TO service_role;
