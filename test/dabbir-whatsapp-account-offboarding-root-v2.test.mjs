import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extractWhatsAppEvents } from '../api/dabbir-whatsapp-webhook.js';

const root=fs.readFileSync('supabase/migrations/20260908075500_dabbir_whatsapp_account_offboarding_root_v1.sql','utf8');
const safety=fs.readFileSync('supabase/migrations/20260908075400_dabbir_whatsapp_offboarding_fail_closed_v0.sql','utf8');
const preflight=fs.readFileSync('api/mobile/account-delete-preflight.js','utf8');
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

function logBodies(text){
  return [...text.matchAll(/logEvent\((?:'[^']+'|"[^"]+"),\s*\{([\s\S]*?)\}\);/g)].map(match=>match[1]);
}

test('safety migration blocks cascade deletion and provides non-sendable pending state',()=>{
  assert.match(safety,/DABBIR_WHATSAPP_OFFBOARDING_REQUIRED_BEFORE_BUSINESS_DELETE/);
  assert.match(safety,/offboarding_pending/);
  assert.match(safety,/before delete on public\.dabbir_businesses/i);
});

test('account deletion preflight freezes WhatsApp but never mutates Meta',()=>{
  assert.match(preflight,/dabbir_account_delete_preflight/);
  assert.match(preflight,/dabbir_begin_whatsapp_account_offboarding/);
  before(preflight,"supabaseRpc('dabbir_account_delete_preflight'","supabaseRpc('dabbir_begin_whatsapp_account_offboarding'",'blockers before freeze');
  assert.match(preflight,/WHATSAPP_BUSINESS_DISCONNECT_REQUIRED/);
  assert.doesNotMatch(preflight,/graph\.facebook\.com|subscribed_apps|deregister/i);
});

test('mobile calls preflight before the existing irreversible delete endpoint',()=>{
  before(mobileApi,"post('/api/mobile/account-delete-preflight'","post('/api/mobile/account-delete'",'mobile delete ordering');
  assert.match(mobileApi,/WHATSAPP_BUSINESS_DISCONNECT_REQUIRED/);
  assert.match(mobileApi,/WhatsApp Business/);
  assert.match(mobileApi,/منصة الأعمال/);
  assert.match(mobileApi,/Disconnect Account/);
  assert.match(accountDelete,/dabbir_delete_current_user_account/);
  assert.doesNotMatch(accountDelete,/graph\.facebook\.com|subscribed_apps|deregister/i);
});

test('one Meta WABA cannot cross DABBIR business tenant boundaries',()=>{
  assert.match(root,/count\(distinct business_id\) > 1/);
  assert.match(root,/pg_advisory_xact_lock\(hashtextextended\('dabbir:waba:'/);
  assert.match(root,/DABBIR_WHATSAPP_WABA_CROSS_BUSINESS_FORBIDDEN/);
  assert.match(root,/before insert or update of waba_id, business_id/);
});

test('begin-offboarding RPC freezes all owner connections without deregistering a phone',()=>{
  assert.match(root,/dabbir_begin_whatsapp_account_offboarding/);
  assert.match(root,/status='offboarding_pending'/);
  assert.match(root,/ACCOUNT_DELETE_WAITING_FOR_META_PARTNER_REMOVED/);
  assert.doesNotMatch(root,/subscribed_apps|deregister/i);
});

test('Meta PARTNER_REMOVED is terminal evidence and receipt precedes credential deletion',()=>{
  assert.match(root,/dabbir_whatsapp_apply_account_update/);
  assert.match(root,/v_event <> 'PARTNER_REMOVED'/);
  assert.match(root,/whatsapp_offboarding_receipts/);
  before(root,'insert into dabbir_private.whatsapp_offboarding_receipts','delete from public.dabbir_whatsapp_connections','receipt before credential deletion');
  assert.match(root,/grant execute on function public\.dabbir_whatsapp_apply_account_update[\s\S]*to service_role/);
});

test('signed webhook extracts provider account_update lifecycle evidence',()=>{
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
  const bodies=logBodies(webhook);
  assert.ok(bodies.length>0,'expected structured logEvent calls');
  for(const body of bodies)assert.doesNotMatch(body,/\bwabaId\b|\bphoneNumber\b/);
});

test('provider sends re-check exact live connection status immediately before Meta',()=>{
  assert.match(root,/dabbir_whatsapp_assert_connection_sendable/);
  assert.match(root,/c\.status='connected'/);
  assert.match(liveCore,/export async function assertWhatsAppConnectionSendable/);
  assert.match(liveCore,/sendMetaText[\s\S]*await assertWhatsAppConnectionSendable/);
  assert.match(liveCore,/sendMetaTemplate[\s\S]*await assertWhatsAppConnectionSendable/);
  assert.match(catalog,/sendMetaCatalogProducts[\s\S]*await assertWhatsAppConnectionSendable/);
});

test('ordinary branch disconnect stays local and cannot perform WABA-wide offboarding',()=>{
  assert.match(branchDisconnect,/remote_unsubscribed:\s*false/);
  assert.match(branchDisconnect,/BRANCH_SAFE_LOCAL_DISCONNECT/);
  assert.doesNotMatch(branchDisconnect,/subscribed_apps|deregister|PARTNER_REMOVED/);
});

test('changed JavaScript parses',()=>{
  for(const path of ['api/mobile/account-delete-preflight.js','api/dabbir-whatsapp-webhook.js','api/_whatsapp-live-core.js','api/_dabbir-whatsapp-catalog.js']){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
