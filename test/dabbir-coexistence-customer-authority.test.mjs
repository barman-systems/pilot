import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260910075409_dabbir_coexistence_customer_authority_v1.sql');
const old = read('supabase/migrations/20260908080500_dabbir_whatsapp_coexistence_sync_v1.sql');
function definition(source, name) {
  const start = source.indexOf('create or replace function ' + name);
  assert.ok(start >= 0, `missing function ${name}`);
  const body = source.indexOf('as $function$', start);
  const end = source.indexOf('$function$;', body + 13);
  assert.ok(body > start && end > body);
  return source.slice(start, end + 11);
}
const B = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333', OTHER_BRANCH = '44444444-4444-4444-8444-444444444444';
let db;
test.before(async () => {
  db = new PGlite();
  await db.exec(read('test/fixtures/architecture/coexistence-customer.sql'));
  await db.exec(definition(read('supabase/migrations/20260909014000_dabbir_customer_persistence_root_fix_v1.sql'), 'dabbir_private.resolve_whatsapp_customer_v1'));
  await db.exec(definition(read('supabase/migrations/20260909022100_dabbir_customer_name_provider_refresh_guard_v3.sql'), 'dabbir_private.guard_customer_whatsapp_display_name'));
  await db.exec('create trigger customer_name_guard before insert or update on public.dabbir_customers for each row execute function dabbir_private.guard_customer_whatsapp_display_name()');
  await db.exec(migration);
});
test.after(async () => { await db?.close(); });
test.beforeEach(async () => {
  await db.exec("set request.jwt.claim.role='service_role'; truncate public.dabbir_customers,public.dabbir_whatsapp_connections,public.dabbir_conversations,public.dabbir_messages,public.dabbir_whatsapp_event_ledger,public.dabbir_message_batches,public.dabbir_handoffs,public.dabbir_whatsapp_coexistence_mutations;");
  await db.query("insert into public.dabbir_whatsapp_connections(business_id,branch_id,phone_number_id,status) values($1,$2,'123456789','connected'),($3,$4,'987654321','connected')", [B, BRANCH, OTHER, OTHER_BRANCH]);
});
const add = (phone = '123456789', name = 'Provider') => db.query("select public.dabbir_whatsapp_apply_coexistence_contact_sync($1,'971500000001',$2,'add') result", [phone, name]);
const message = (providerId = 'wamid.fixture', phone = '123456789', direction = 'inbound', source = 'history') => db.query("select * from public.dabbir_whatsapp_persist_coexistence_message($1,$2,'971500000001','Provider','Hello',$3,$4)", [phone, providerId, direction, source]);
const customer = async (business = B, extra = '') => (await db.query(`insert into public.dabbir_customers(business_id,display_name,phone_e164${extra ? ',display_name_source,metadata' : ''}) values($1,'Owner label','+971500000001'${extra ? ", 'owner', '{\"display_name_owner_override\":true}'" : ''}) returning id`, [business])).rows[0].id;
test('baseline handle-only contact writer fails for an existing phone-only customer; the migration fixes the same call', async () => {
  const expected = await customer();
  await db.exec(definition(old, 'public.dabbir_whatsapp_apply_coexistence_contact_sync'));
  try { await assert.rejects(add(), e => e.code === '23505'); }
  finally { await db.exec(migration); }
  assert.equal((await add()).rows[0].result.customer_id, expected);
  assert.equal((await db.query('select count(*)::int n from public.dabbir_customers')).rows[0].n, 1);
});
test('contact, historical message and canonical text/voice resolver reuse the same customer', async () => {
  const expected = await customer();
  assert.equal((await add()).rows[0].result.customer_id, expected);
  assert.equal((await message()).rows[0].customer_id, expected);
  const resolved = await db.query("select dabbir_private.resolve_whatsapp_customer_v1($1,'971500000001','Voice name') id", [B]);
  assert.equal(resolved.rows[0].id, expected);
  const row = (await db.query('select * from public.dabbir_customers')).rows[0];
  assert.equal(row.display_name, 'Voice name');
  assert.equal(row.channel_handle, '971500000001');
});
test('provider refresh preserves explicit owner name and updates only the WhatsApp name', async () => {
  const expected = await customer(B, 'owner');
  await add(); await message();
  const row = (await db.query('select * from public.dabbir_customers where id=$1', [expected])).rows[0];
  assert.equal(row.display_name, 'Owner label'); assert.equal(row.display_name_source, 'owner');
  assert.equal(row.whatsapp_display_name, 'Provider');
  assert.equal('_dabbir_provider_display_name' in row.metadata, false);
  assert.equal(row.metadata.coexistence, true); assert.equal(row.metadata.coexistence_contact, true);
});
test('same phone in two tenants stays two identities and two branch-scoped conversations', async () => {
  const one = (await message()).rows[0], two = (await message('wamid.other', '987654321')).rows[0];
  assert.notEqual(one.customer_id, two.customer_id); assert.notEqual(one.conversation_id, two.conversation_id);
  assert.equal(one.business_id, B); assert.equal(two.business_id, OTHER);
  const branches = (await db.query('select branch_id from public.dabbir_conversations order by branch_id')).rows.map(r => r.branch_id);
  assert.deepEqual(branches, [BRANCH, OTHER_BRANCH]);
});
test('provider-message replay never creates a second message or customer', async () => {
  const one = (await message()).rows[0], two = (await message()).rows[0];
  assert.equal(one.duplicate, false); assert.equal(two.duplicate, true);
  assert.equal(one.message_id, two.message_id); assert.equal(one.customer_id, two.customer_id);
  assert.equal((await db.query('select count(*)::int n from public.dabbir_messages')).rows[0].n, 1);
});
test('conflicting phone/handle identities fail closed without producing a message', async () => {
  await customer();
  await db.query("insert into public.dabbir_customers(business_id,display_name,channel_handle,phone_e164) values($1,'Conflicting identity','971500000001','+971500000002')", [B]);
  await assert.rejects(add(), e => e.message.includes('WHATSAPP_CUSTOMER_IDENTITY_CONFLICT'));
  await assert.rejects(message(), e => e.message.includes('WHATSAPP_CUSTOMER_IDENTITY_CONFLICT'));
  assert.equal((await db.query('select count(*)::int n from public.dabbir_messages')).rows[0].n, 0);
});
test('contact removal retains customer/history and a later add clears only the removal marker', async () => {
  const initial = (await message()).rows[0];
  await db.query("select public.dabbir_whatsapp_apply_coexistence_contact_sync('123456789','971500000001',null,'remove')");
  assert.equal((await db.query('select metadata from public.dabbir_customers')).rows[0].metadata.whatsapp_app_contact_removed, true);
  assert.equal((await add()).rows[0].result.customer_id, initial.customer_id);
  const metadata = (await db.query('select metadata from public.dabbir_customers')).rows[0].metadata;
  assert.equal(metadata.whatsapp_app_contact_removed, false); assert.equal('whatsapp_app_contact_removed_at' in metadata, false);
  assert.equal((await db.query('select count(*)::int n from public.dabbir_messages')).rows[0].n, 1);
});
test('business-app echo still cancels queued AI work and retains an active human handoff', async () => {
  const initial = (await message()).rows[0];
  await db.query("insert into public.dabbir_message_batches(business_id,conversation_id,state,lock_token) values($1,$2,'READY',gen_random_uuid())", [B, initial.conversation_id]);
  await db.query("insert into public.dabbir_handoffs(business_id,conversation_id,state) values($1,$2,'HUMAN_ACTIVE')", [B, initial.conversation_id]);
  await db.query("update public.dabbir_conversations set state='human_active'");
  await message('wamid.echo', '123456789', 'outbound', 'smb_message_echoes');
  const batch = (await db.query('select * from public.dabbir_message_batches')).rows[0];
  assert.equal(batch.state, 'CANCELLED'); assert.equal(batch.lock_token, null);
  assert.equal((await db.query('select state from public.dabbir_conversations')).rows[0].state, 'human_active');
});
test('unknown connection and authenticated role cannot create a customer', async () => {
  await assert.rejects(add('unknown'), e => e.message.includes('WHATSAPP_TENANT_CONNECTION_NOT_FOUND'));
  await db.exec("set request.jwt.claim.role='authenticated'");
  await assert.rejects(add(), e => e.message.includes('SERVICE_ROLE_REQUIRED'));
  await assert.rejects(message(), e => e.message.includes('SERVICE_ROLE_REQUIRED'));
  assert.equal((await db.query('select count(*)::int n from public.dabbir_customers')).rows[0].n, 0);
});
test('public RPC privileges remain service-role-only and customer RLS is retained', async () => {
  for (const fn of ['public.dabbir_whatsapp_apply_coexistence_contact_sync(text,text,text,text,timestamptz)', 'public.dabbir_whatsapp_persist_coexistence_message(text,text,text,text,text,text,text,timestamptz)']) {
    const row = (await db.query("select has_function_privilege('anon',$1,'EXECUTE') a,has_function_privilege('authenticated',$1,'EXECUTE') u,has_function_privilege('service_role',$1,'EXECUTE') s", [fn])).rows[0];
    assert.deepEqual(row, { a: false, u: false, s: true });
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.dabbir_customers'::regclass")).rows[0].relrowsecurity, true);
});

test('baseline app-echo writer has an ambiguous tenant column; qualified columns preserve tenant scope', async () => {
  await add();
  await db.exec(definition(old, 'public.dabbir_whatsapp_persist_coexistence_message'));
  try { await assert.rejects(message('wamid.baseline.echo', '123456789', 'outbound', 'smb_message_echoes'), e => e.code === '42702'); }
  finally { await db.exec(migration); }
  assert.equal((await message('wamid.baseline.echo', '123456789', 'outbound', 'smb_message_echoes')).rows[0].business_id, B);
});
test('pending edit/revoke applies only within the resolved tenant when the message arrives', async () => {
  await db.query("insert into public.dabbir_whatsapp_coexistence_mutations(business_id,original_provider_message_id,mutation_type,new_body,occurred_at) values($1,'wamid.pending','edit','Edited',now()),($2,'wamid.pending','revoke',null,now())", [B, OTHER]);
  const result = (await message('wamid.pending')).rows[0];
  assert.equal((await db.query('select body from public.dabbir_messages where id=$1', [result.message_id])).rows[0].body, 'Edited');
  const mutations = (await db.query('select business_id,applied_at is not null applied from public.dabbir_whatsapp_coexistence_mutations order by business_id')).rows;
  assert.deepEqual(mutations, [{ business_id: B, applied: true }, { business_id: OTHER, applied: false }]);
});
