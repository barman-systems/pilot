import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extractWhatsAppEvents } from '../api/dabbir-whatsapp-webhook.js';

const migration=fs.readFileSync('supabase/migrations/20260908075500_dabbir_whatsapp_account_offboarding_root_v1.sql','utf8');
const compatibility=fs.readFileSync('supabase/migrations/20260908075600_dabbir_whatsapp_legacy_offboarding_freeze_v1.sql','utf8');
const accountDelete=fs.readFileSync('api/mobile/account-delete.js','utf8');
const mobileApi=fs.readFileSync('mobile/src/api.ts','utf8');
const webhook=fs.readFileSync('api/dabbir-whatsapp-webhook.js','utf8');
const liveCore=fs.readFileSync('api/_whatsapp-live-core.js','utf8');
const catalog=fs.readFileSync('api/_dabbir-whatsapp-catalog.js','utf8');
const branchDisconnect=fs.readFileSync('api/dabbir-whatsapp-disconnect.js','utf8');

function before(text,a,b,message){
  const left=text.indexOf(a),right=text.indexOf(b);
  assert.notEqual(left,-1,`${message}: missing ${a}`);
  assert.notEqual(right,-1,`${message}: missing ${b}`);
  assert.ok(left<right,`${message}: ${a} must occur before ${b}`);
}

test('database blocks cascade deletion until provider-confirmed WhatsApp offboarding',()=>{
  assert.match(migration,/guard_business_delete_whatsapp_offboarding/);
  assert.match(migration,/DABBIR_WHATSAPP_OFFBOARDING_REQUIRED_BEFORE_BUSINESS_DELETE/);
  assert.match(migration,/before delete on public\.dabbir_businesses/i);
  assert.match(migration,/offboarding_pending/);
});

test('a Meta WABA cannot cross DABBIR business tenant boundaries',()=>{
  assert.match(migration,/count\(distinct business_id\) > 1/);
  assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\('dabbir:waba:'/);
  assert.match(migration,/DABBIR_WHATSAPP_WABA_CROSS_BUSINESS_FORBIDDEN/);
  assert.match(migration,/before insert or update of waba_id, business_id/);
});

test('legacy account-deletion binary freezes and stops before its obsolete Meta unsubscribe',()=>{
  assert.match(accountDelete,/status:'disconnected',last_error:'ACCOUNT_DELETE_OFFBOARDING'/);
  assert.match(accountDelete,/await freezeConnections\(token,connections\)/);
  assert.match(accountDelete,/\/subscribed_apps/);
  assert.match(compatibility,/new\.status := 'offboarding_pending'/);
  assert.match(compatibility,/ACCOUNT_DELETE_WAITING_FOR_META_PARTNER_REMOVED/);
  before(accountDelete,'await freezeConnections(token,connections);','await resolveEmbeddedPlatformConfig();','legacy binary must verify freeze before any Meta request');
  assert.doesNotMatch(accountDelete,/\/deregister|deregisterPhone|deregister_number/i,'Coexistence account deletion must never deregister the customer phone');
});

test('Meta PARTNER_REMOVED is the terminal evidence that erases local WhatsApp credentials',()=>{
  assert.match(migration,/dabbir_whatsapp_apply_account_update/);
  assert.match(migration,/v_event <> 'PARTNER_REMOVED'/);
  assert.match(migration,/whatsapp_offboarding_receipts/);
  before(migration,'insert into dabbir_private.whatsapp_offboarding_receipts','delete from public.dabbir_whatsapp_connections','receipt before credential deletion');
  assert.match(migration,/grant execute on function public\.dabbir_whatsapp_apply_account_update[\s\S]*to service_role/);
});

test('signed webhook extracts and applies account_update without logging customer identifiers',()=>{
  const events=extractWhatsAppEvents({
    object:'whatsapp_business_account',
    entry:[{
      id:'123456789012345',
      time:1788840000,
      changes:[{
        field:'account_update',
        value:{
          event:'PARTNER_REMOVED',
          phone_number:'971501234567',
          waba_info:{waba_id:'123456789012345'},
          disconnection_info:{reason:'BUSINESS_DOWNGRADE',initiated_by:'USER'},
        },
      }],
    }],
  });
  assert.equal(events.length,1);
  assert.deepEqual(events[0],{
    type:'account_update',
    sourceField:'account_update',
    wabaId:'123456789012345',
    accountEvent:'PARTNER_REMOVED',
    phoneNumber:'971501234567',
    reason:'BUSINESS_DOWNGRADE',
    initiatedBy:'USER',
    timestamp:1788840000,
  });
  assert.match(webhook,/dabbir_whatsapp_apply_account_update/);
  assert.match(webhook,/account_updates_matched/);
  assert.doesNotMatch(webhook,/logEvent\([^]*phoneNumber|logEvent\([^]*wabaId/);
});

test('mobile account deletion explains the official WhatsApp Business disconnect path',()=>{
  assert.match(mobileApi,/WHATSAPP_ACCOUNT_OFFBOARDING_FAILED/);
  assert.match(mobileApi,/WhatsApp Business/);
  assert.match(mobileApi,/منصة الأعمال/);
  assert.match(mobileApi,/Disconnect Account/);
  assert.match(mobileApi,/اضغط حذف الحساب مرة أخرى/);
});

test('provider sends re-check live connection status after an offboarding freeze',()=>{
  assert.match(migration,/dabbir_whatsapp_assert_connection_sendable/);
  assert.match(migration,/c\.status='connected'/);
  assert.match(liveCore,/export async function assertWhatsAppConnectionSendable/);
  assert.match(liveCore,/sendMetaText[\s\S]*await assertWhatsAppConnectionSendable/);
  assert.match(liveCore,/sendMetaTemplate[\s\S]*await assertWhatsAppConnectionSendable/);
  assert.match(catalog,/sendMetaCatalogProducts[\s\S]*await assertWhatsAppConnectionSendable/);
});

test('ordinary branch disconnect never performs WABA-wide partner operations',()=>{
  assert.match(branchDisconnect,/remote_unsubscribed:\s*false/);
  assert.match(branchDisconnect,/BRANCH_SAFE_LOCAL_DISCONNECT/);
  assert.doesNotMatch(branchDisconnect,/subscribed_apps|deregister|PARTNER_REMOVED/);
});

test('modified JavaScript parses',()=>{
  for(const path of ['api/mobile/account-delete.js','api/dabbir-whatsapp-webhook.js','api/_whatsapp-live-core.js','api/_dabbir-whatsapp-catalog.js']){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
