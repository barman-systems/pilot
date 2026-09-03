import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const branchMigration=read('supabase/migrations/20260903155503_dabbir_whatsapp_branch_routing_v1.sql');
const inboundFix=read('supabase/migrations/20260903155620_dabbir_whatsapp_inbound_variable_conflict_fix_v1.sql');
const outboundMigration=read('supabase/migrations/20260903155919_dabbir_whatsapp_outbound_branch_routing_v1.sql');
const exactConnection=read('api/_whatsapp-branch-connection.js');
const reply=read('api/dabbir-whatsapp-reply.js');

test('WhatsApp connections are branch-owned with business/branch integrity',()=>{
  assert.match(branchMigration,/add column if not exists branch_id uuid/);
  assert.match(branchMigration,/alter column branch_id set not null/);
  assert.match(branchMigration,/foreign key \(branch_id,business_id\)/);
  assert.match(branchMigration,/unique \(business_id,branch_id\)/);
  assert.match(branchMigration,/dabbir_whatsapp_connection_branch_guard/);
  assert.match(branchMigration,/dabbir_whatsapp_upsert_branch_connection/);
});

test('inbound routing derives conversation branch from the receiving connection',()=>{
  assert.match(inboundFix,/c\.branch_id=v_connection\.branch_id/);
  assert.match(inboundFix,/insert into public\.dabbir_conversations\(business_id,branch_id/);
  assert.match(inboundFix,/v_connection\.business_id,v_connection\.branch_id,v_customer_id/);
  assert.match(inboundFix,/#variable_conflict use_column/);
  assert.match(inboundFix,/grant execute on function public\.dabbir_whatsapp_persist_inbound[\s\S]*to service_role/);
});

test('outbound reservation resolves conversation before selecting its branch connection',()=>{
  const conversationIndex=outboundMigration.indexOf('select * into v_conversation');
  const connectionIndex=outboundMigration.indexOf('c.branch_id=v_conversation.branch_id');
  assert.ok(conversationIndex>=0&&connectionIndex>conversationIndex);
  assert.match(outboundMigration,/WHATSAPP_BRANCH_CONNECTION_NOT_FOUND/);
  assert.doesNotMatch(outboundMigration,/where c\.business_id=p_business_id and c\.status='connected' limit 1;[\s\S]*select \* into v_conversation/);
});

test('exact connection authority scopes reads and token rotation to one connection id',()=>{
  assert.match(exactConnection,/id=eq\.\$\{encodeURIComponent\(connection\)\}&business_id=eq/);
  assert.match(exactConnection,/id=eq\.\$\{encodeURIComponent\(row\.id\)\}&business_id=eq/);
  assert.match(exactConnection,/WHATSAPP_EXACT_CONNECTION_SCOPE_MISMATCH/);
  assert.doesNotMatch(exactConnection,/dabbir_whatsapp_connections\?business_id=eq\.\$\{encodeURIComponent\(String\(row\.business_id\)\)\}/);
});

test('reply reserves the branch connection before loading and sending through that exact connection',()=>{
  assert.match(reply,/loadExactBusinessConnection/);
  const reserveIndex=reply.indexOf('reservation = await reserveOutboundReply');
  const loadIndex=reply.indexOf('const connection = await loadExactBusinessConnection');
  const sendIndex=reply.indexOf('sent = await sendMetaText');
  assert.ok(reserveIndex>=0&&loadIndex>reserveIndex&&sendIndex>loadIndex);
  assert.match(reply,/reservation\.connectionId/);
  assert.match(reply,/WHATSAPP_BRANCH_CONNECTION_UNAVAILABLE_AFTER_RESERVATION/);
  assert.doesNotMatch(reply,/loadBusinessConnection\(/);
});
