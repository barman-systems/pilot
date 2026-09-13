import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const migration = 'supabase/migrations/20260908033034_dabbir_order_write_permission_gate_v1.sql';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = uuid(1), viewer = uuid(2), worker = uuid(3), restricted = uuid(4), outsider = uuid(5);
const business = uuid(11), otherBusiness = uuid(12), branch = uuid(21), otherBranch = uuid(22), foreignBranch = uuid(23);
const order = uuid(31), otherOrder = uuid(32), foreignOrder = uuid(33), newOrder = uuid(34);
let reproducedBeforeFix = false;

// Extract the actual current authorization helpers; only table shape and auth
// identity are fixtures. The tests execute real PostgreSQL RLS as a client role.
async function installFunction(path, name) {
  const source = await read(path);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`create or replace function ${escaped}\\([\\s\\S]*?\\n(?:\\$\\$|\\$function\\$);`, 'i'));
  assert.ok(match, `missing real helper ${name}`);
  await db.exec(match[0]);
}
async function asUser(user, sql, params = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}
const insertOrder = (user, id = newOrder, businessId = business, branchId = branch) => asUser(user,
  'insert into public.dabbir_orders(id,business_id,branch_id,status) values($1,$2,$3,\'draft\') returning id',
  [id, businessId, branchId]);

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema dabbir_private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table public.account_access_state(user_id uuid primary key,status text);
    create table public.dabbir_memberships(
      business_id uuid,user_id uuid,role text,status text default 'active',
      permissions text[] default '{}',suspended_at timestamptz,removed_at timestamptz,
      primary key(business_id,user_id)
    );
    create table public.dabbir_membership_branches(business_id uuid,user_id uuid,branch_id uuid);
    create table public.dabbir_orders(id uuid primary key,business_id uuid,branch_id uuid,status text);
    alter table public.dabbir_orders enable row level security;
    grant usage on schema public,auth,dabbir_private to authenticated;
    grant select,insert,update,delete on public.dabbir_orders to authenticated;
  `);
  await installFunction('supabase/migrations/20260828092000_dabbir_product_scoped_account_deletion_v1.sql', 'dabbir_private.account_active');
  await installFunction('supabase/migrations/20260828043000_dabbir_active_membership_rls_root_fix_v1.sql', 'dabbir_private.is_active_member');
  await installFunction('supabase/migrations/20260903203000_dabbir_owner_workspace_sovereignty_v1.sql', 'dabbir_private.user_has_permission');
  await installFunction('supabase/migrations/20260903203000_dabbir_owner_workspace_sovereignty_v1.sql', 'dabbir_private.has_permission');
  await installFunction('supabase/migrations/20260903210000_dabbir_branch_scope_source_reconciliation_v1.sql', 'dabbir_private.branch_access_allowed');
  await db.exec(`
    create policy dabbir_orders_member_all on public.dabbir_orders for all to authenticated
      using(dabbir_private.is_active_member(business_id)) with check(dabbir_private.is_active_member(business_id));
    create policy dabbir_orders_branch_restrict on public.dabbir_orders as restrictive for all to authenticated
      using(dabbir_private.branch_access_allowed(business_id,branch_id))
      with check(dabbir_private.branch_access_allowed(business_id,branch_id));
    insert into public.dabbir_memberships(business_id,user_id,role,permissions) values
      ('${business}','${owner}','owner','{}'),('${business}','${viewer}','viewer','{}'),
      ('${business}','${worker}','employee','{}'),('${business}','${restricted}','employee','{view_business}'),
      ('${otherBusiness}','${outsider}','owner','{}');
    insert into public.dabbir_membership_branches(business_id,user_id,branch_id) values
      ('${business}','${viewer}','${branch}'),('${business}','${worker}','${branch}'),('${business}','${restricted}','${branch}');
    insert into public.dabbir_orders values('${order}','${business}','${branch}','draft');
  `);
  const before = await asUser(viewer, 'update public.dabbir_orders set status=\'completed\' where id=$1 returning id', [order]);
  reproducedBeforeFix = before.rows.length === 1;
  await db.exec(await read(migration));
});

beforeEach(async () => {
  await db.exec(`reset role;
    truncate public.dabbir_orders,public.account_access_state;
    update public.dabbir_memberships set status='active',suspended_at=null,removed_at=null;
    insert into public.dabbir_orders values
      ('${order}','${business}','${branch}','draft'),
      ('${otherOrder}','${business}','${otherBranch}','draft'),
      ('${foreignOrder}','${otherBusiness}','${foreignBranch}','draft');
  `);
});
after(() => db.close());

test('reproduces the live policy gap before installing the write gate', () => {
  assert.equal(reproducedBeforeFix, true, 'old policy permits viewer to complete an order');
});

test('viewer keeps branch-scoped reads but cannot insert, update or delete orders', async () => {
  assert.deepEqual((await asUser(viewer, 'select id from public.dabbir_orders')).rows, [{ id: order }]);
  await assert.rejects(insertOrder(viewer), /row-level security/);
  assert.equal((await asUser(viewer, 'update public.dabbir_orders set status=\'completed\' where id=$1 returning id', [order])).rows.length, 0);
  assert.equal((await asUser(viewer, 'delete from public.dabbir_orders where id=$1 returning id', [order])).rows.length, 0);
  assert.equal((await db.query('select status from public.dabbir_orders where id=$1', [order])).rows[0].status, 'draft');
});

test('explicitly narrowed employee cannot bypass their permission override', async () => {
  await assert.rejects(insertOrder(restricted), /row-level security/);
  assert.equal((await asUser(restricted, 'update public.dabbir_orders set status=\'completed\' where id=$1 returning id', [order])).rows.length, 0);
  assert.equal((await asUser(restricted, 'delete from public.dabbir_orders where id=$1 returning id', [order])).rows.length, 0);
});

test('owner and operational employee can still complete supported order mutations', async () => {
  assert.equal((await insertOrder(worker)).rows.length, 1);
  assert.equal((await asUser(worker, 'update public.dabbir_orders set status=\'completed\' where id=$1 returning id', [newOrder])).rows.length, 1);
  assert.equal((await asUser(worker, 'delete from public.dabbir_orders where id=$1 returning id', [newOrder])).rows.length, 1);
  assert.equal((await insertOrder(owner)).rows.length, 1);
});

test('write permission never bypasses branch or tenant isolation', async () => {
  await assert.rejects(insertOrder(worker, newOrder, business, otherBranch), /row-level security/);
  await assert.rejects(insertOrder(worker, newOrder, otherBusiness, foreignBranch), /row-level security/);
  assert.equal((await asUser(worker, 'update public.dabbir_orders set status=\'completed\' where id=$1 returning id', [foreignOrder])).rows.length, 0);
  await assert.rejects(asUser(worker, 'update public.dabbir_orders set branch_id=$1 where id=$2', [otherBranch, order]), /row-level security/);
  await assert.rejects(asUser(owner, 'update public.dabbir_orders set business_id=$1,branch_id=$2 where id=$3', [otherBusiness, foreignBranch, order]), /row-level security/);
});

test('suspended, removed and account-deleted actors remain denied', async () => {
  for (const update of ["status='suspended'", 'suspended_at=now()', 'removed_at=now()']) {
    await db.query(`update public.dabbir_memberships set ${update} where user_id=$1`, [worker]);
    await assert.rejects(insertOrder(worker), /row-level security/);
    assert.equal((await asUser(worker, 'select id from public.dabbir_orders')).rows.length, 0);
    await db.query("update public.dabbir_memberships set status='active',suspended_at=null,removed_at=null where user_id=$1", [worker]);
  }
  await db.query("insert into public.account_access_state values($1,'deleted')", [worker]);
  await assert.rejects(insertOrder(worker), /row-level security/);
});

test('anonymous access stays unavailable and migration rerun preserves order rows', async () => {
  await db.exec('set role anon');
  try { await assert.rejects(db.query('select id from public.dabbir_orders'), /permission denied/); }
  finally { await db.exec('reset role'); }
  await db.exec(await read(migration));
  assert.equal((await db.query('select count(*) n from public.dabbir_orders')).rows[0].n, 3);
  const policies = (await db.query("select policyname,permissive from pg_policies where tablename='dabbir_orders' and policyname like '%permission_gate' order by policyname")).rows;
  assert.equal(policies.length, 3);
  assert.ok(policies.every(policy => policy.permissive === 'RESTRICTIVE'));
});
