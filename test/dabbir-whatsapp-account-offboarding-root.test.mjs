import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const migration=fs.readFileSync('supabase/migrations/20260908075500_dabbir_whatsapp_account_offboarding_root_v1.sql','utf8');
const accountDelete=fs.readFileSync('api/mobile/account-delete.js','utf8');
const liveCore=fs.readFileSync('api/_whatsapp-live-core.js','utf8');
const catalog=fs.readFileSync('api/_dabbir-whatsapp-catalog.js','utf8');
const branchDisconnect=fs.readFileSync('api/dabbir-whatsapp-disconnect.js','utf8');

function before(text,a,b,message){
  const left=text.indexOf(a),right=text.indexOf(b);
  assert.notEqual(left,-1,`${message}: missing ${a}`);
  assert.notEqual(right,-1,`${message}: missing ${b}`);
  assert.ok(left<right,`${message}: ${a} must occur before ${b}`);
}

test('database blocks cascade deletion until WhatsApp credentials are explicitly offboarded',()=>{
  assert.match(migration,/guard_business_delete_whatsapp_offboarding/);
  assert.match(migration,/DABBIR_WHATSAPP_OFFBOARDING_REQUIRED_BEFORE_BUSINESS_DELETE/);
  assert.match(migration,/before delete on public\.dabbir_businesses/i);
  assert.doesNotMatch(migration,/delete\s+from\s+public\.dabbir_whatsapp_connections[\s\S]*guard_business_delete_whatsapp_offboarding/i);
});

test('a Meta WABA cannot cross DABBIR business tenant boundaries',()=>{
  assert.match(migration,/count\(distinct business_id\) > 1/);
  assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\('dabbir:waba:'/);
  assert.match(migration,/DABBIR_WHATSAPP_WABA_CROSS_BUSINESS_FORBIDDEN/);
  assert.match(migration,/before insert or update of waba_id, business_id/);
});

test('account deletion preflights blockers before making Meta changes',()=>{
  assert.match(migration,/dabbir_account_delete_preflight/);
  assert.match(migration,/ACCOUNT_DELETE_BLOCKED_BY_LEGAL_HOLD/);
  assert.match(migration,/PLATFORM_ADMIN_ACCOUNT_REQUIRES_HANDOFF/);
  before(accountDelete,"supabaseRpc('dabbir_account_delete_preflight'","offboardWhatsApp(token,businessIds)",'preflight order');
  before(accountDelete,'offboardWhatsApp(token,businessIds)',"supabaseRpc('dabbir_delete_current_user_account'",'offboarding order');
});

test('account deletion freezes outbound before remote Meta unsubscribe',()=>{
  assert.match(accountDelete,/status:'disconnected',last_error:'ACCOUNT_DELETE_OFFBOARDING'/);
  assert.match(accountDelete,/\/subscribed_apps/);
  assert.match(accountDelete,/method:'DELETE'/);
  assert.match(accountDelete,/META_WHATSAPP_OFFBOARDING_STILL_SUBSCRIBED/);
  before(accountDelete,'await freezeConnections(token,connections);','await resolveEmbeddedPlatformConfig();','freeze before provider work');
  before(accountDelete,'await unsubscribeWabaVerified(platform,access,wabaId);','await deleteConnections(token,connections);','remote proof before credential deletion');
  assert.doesNotMatch(accountDelete,/\/deregister|deregisterPhone|deregister_number/i,'account deletion must not deregister a coexistence phone');
});

test('provider sends re-check live connection status after an offboarding freeze',()=>{
  assert.match(migration,/dabbir_whatsapp_assert_connection_sendable/);
  assert.match(migration,/c\.status='connected'/);
  assert.match(liveCore,/export async function assertWhatsAppConnectionSendable/);
  assert.match(liveCore,/sendMetaText[\s\S]*await assertWhatsAppConnectionSendable/);
  assert.match(liveCore,/sendMetaTemplate[\s\S]*await assertWhatsAppConnectionSendable/);
  assert.match(catalog,/sendMetaCatalogProducts[\s\S]*await assertWhatsAppConnectionSendable/);
});

test('ordinary branch disconnect remains local and cannot unsubscribe a shared WABA',()=>{
  assert.match(branchDisconnect,/remote_unsubscribed:\s*false/);
  assert.match(branchDisconnect,/BRANCH_SAFE_LOCAL_DISCONNECT/);
  assert.doesNotMatch(branchDisconnect,/subscribed_apps|unsubscribeWaba/);
});

test('modified JavaScript parses',()=>{
  for(const path of ['api/mobile/account-delete.js','api/_whatsapp-live-core.js','api/_dabbir-whatsapp-catalog.js']){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
