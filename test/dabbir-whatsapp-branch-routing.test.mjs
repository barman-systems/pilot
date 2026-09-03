import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const branchMigration=read('supabase/migrations/20260903155503_dabbir_whatsapp_branch_routing_v1.sql');
const inboundFix=read('supabase/migrations/20260903155620_dabbir_whatsapp_inbound_variable_conflict_fix_v1.sql');
const outboundMigration=read('supabase/migrations/20260903155919_dabbir_whatsapp_outbound_branch_routing_v1.sql');
const evidenceMigration=read('supabase/migrations/20260903160359_dabbir_whatsapp_branch_operational_evidence_v1.sql');
const intentMigration=read('supabase/migrations/20260903160747_dabbir_whatsapp_branch_intent_v1.sql');
const exactConnection=read('api/_whatsapp-branch-connection.js');
const reply=read('api/dabbir-whatsapp-reply.js');
const status=read('api/dabbir-whatsapp-status.js');
const disconnect=read('api/dabbir-whatsapp-disconnect.js');
const branchUi=read('api/branch-context-ui.js');
const intentApi=read('api/whatsapp-branch-intent.js');

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

test('exact connection authority scopes reads rotation and deletion to one connection id',()=>{
  assert.match(exactConnection,/id=eq\.\$\{encodeURIComponent\(connection\)\}&business_id=eq/);
  assert.match(exactConnection,/id=eq\.\$\{encodeURIComponent\(row\.id\)\}&business_id=eq/);
  assert.match(exactConnection,/deleteExactBusinessConnection/);
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

test('branch status uses branch-specific connection and branch-specific operational evidence',()=>{
  assert.match(evidenceMigration,/dabbir_whatsapp_branch_operational_evidence/);
  assert.match(evidenceMigration,/c\.branch_id=p_branch_id/);
  assert.match(status,/loadBusinessBranchConnection/);
  assert.match(status,/loadPrimaryBusinessConnection/);
  assert.match(status,/dabbir_whatsapp_branch_operational_evidence/);
  assert.match(status,/p_branch_id: branchId/);
  assert.match(status,/branch_id: row\.branch_id/);
  assert.doesNotMatch(status,/loadBusinessConnection/);
});

test('disconnect deletes one exact branch connection and never unsubscribes a shared WABA',()=>{
  assert.match(disconnect,/loadBusinessBranchConnection/);
  assert.match(disconnect,/loadPrimaryBusinessConnection/);
  assert.match(disconnect,/deleteExactBusinessConnection/);
  assert.match(disconnect,/BRANCH_SAFE_LOCAL_DISCONNECT/);
  assert.doesNotMatch(disconnect,/removeBusinessConnection/);
  assert.doesNotMatch(disconnect,/unsubscribeWaba/);
});

test('Embedded Signup keeps Meta flow unchanged while a one-time server branch intent controls storage',()=>{
  assert.match(intentMigration,/create table if not exists public\.dabbir_whatsapp_branch_intents/);
  assert.match(intentMigration,/force row level security/);
  assert.match(intentMigration,/dabbir_private\.branch_access_allowed/);
  assert.match(intentMigration,/select i\.branch_id into v_branch_id/);
  assert.match(intentMigration,/delete from public\.dabbir_whatsapp_branch_intents/);
  assert.match(intentApi,/ownerContext/);
  assert.match(intentApi,/resolution=merge-duplicates,return=representation/);
  assert.match(branchUi,/\/api\/dabbir-whatsapp-embedded-complete/);
  assert.match(branchUi,/\/api\/whatsapp-branch-intent/);
  assert.match(branchUi,/persistWhatsAppIntent/);
  assert.match(branchUi,/\/api\/dabbir-whatsapp-status/);
  assert.match(branchUi,/\/api\/dabbir-whatsapp-disconnect/);
});
