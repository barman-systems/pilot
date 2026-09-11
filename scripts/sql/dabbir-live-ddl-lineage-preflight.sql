BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH migration_rows AS (
  SELECT
    m.version::text AS version,
    COALESCE(m.name::text, '') AS name,
    md5(COALESCE(array_to_string(m.statements, E'\n'), '')) AS statements_md5
  FROM supabase_migrations.schema_migrations AS m
  ORDER BY m.version
),
function_rows AS (
  SELECT
    n.nspname::text AS schema_name,
    p.proname::text AS function_name,
    pg_get_function_identity_arguments(p.oid)::text AS identity_arguments,
    md5(pg_get_functiondef(p.oid)) AS definition_md5,
    md5(COALESCE(p.proacl::text, '')) AS acl_md5,
    COALESCE(p.proacl::text, '') AS acl,
    COALESCE(
      (
        SELECT setting
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting LIKE 'search_path=%'
        ORDER BY setting
        LIMIT 1
      ),
      ''
    ) AS search_path,
    md5(
      COALESCE(
        (
          SELECT setting
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
          WHERE setting LIKE 'search_path=%'
          ORDER BY setting
          LIMIT 1
        ),
        ''
      )
    ) AS search_path_md5,
    p.prosecdef AS security_definer
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'dabbir_private')
    AND p.prokind = 'f'
  ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
),
payload AS (
  SELECT jsonb_build_object(
    'database', current_database(),
    'role', current_user,
    'snapshot', txid_current_snapshot()::text,
    'migration_history', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'version', version,
            'name', name,
            'statements_md5', statements_md5
          )
          ORDER BY version
        )
        FROM migration_rows
      ),
      '[]'::jsonb
    ),
    'migration_fingerprint', md5(COALESCE(
      (
        SELECT string_agg(version || ':' || name || ':' || statements_md5, E'\n' ORDER BY version)
        FROM migration_rows
      ),
      ''
    )),
    'functions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'schema_name', schema_name,
            'function_name', function_name,
            'identity_arguments', identity_arguments,
            'definition_md5', definition_md5,
            'acl_md5', acl_md5,
            'acl', acl,
            'search_path', search_path,
            'search_path_md5', search_path_md5,
            'security_definer', security_definer
          )
          ORDER BY schema_name, function_name, identity_arguments
        )
        FROM function_rows
      ),
      '[]'::jsonb
    ),
    'function_fingerprint', md5(COALESCE(
      (
        SELECT string_agg(
          schema_name || ':' || function_name || ':' || identity_arguments || ':' || definition_md5 || ':' || acl_md5 || ':' || search_path_md5 || ':' || security_definer::text,
          E'\n'
          ORDER BY schema_name, function_name, identity_arguments
        )
        FROM function_rows
      ),
      ''
    ))
  ) AS preflight
)
SELECT preflight FROM payload;

COMMIT;
