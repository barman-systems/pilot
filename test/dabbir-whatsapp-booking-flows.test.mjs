import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOOKING_FLOW_JSON, BOOKING_FLOW_SCHEMA_HASH, parseBookingFlowReply } from '../api/_dabbir-whatsapp-flows.js';

const sql=fs.readFileSync('supabase/migrations/20260908093000_dabbir_whatsapp_booking_flows_v1.sql','utf8');
const aiCore=fs.readFileSync('api/_dabbir-whatsapp-ai-core.js','utf8');
const cron=fs.readFileSync('api/dabbir-whatsapp-ai-cron.js','utf8');
const webhook=fs.readFileSync('api/dabbir-whatsapp-webhook-coexistence.js','utf8');
const flowSource=fs.readFileSync('api/_dabbir-whatsapp-flows.js','utf8');

test('booking Flow is terminal, booking-only and contains no financial fields',()=>{
  assert.match(BOOKING_FLOW_SCHEMA_HASH,/^[0-9a-f]{64}$/);
  const flow=JSON.parse(BOOKING_FLOW_JSON);
  assert.equal(flow.version,'5.0');
  assert.equal(flow.screens.length,1);
  assert.equal(flow.screens[0].id,'BOOKING');
  assert.equal(flow.screens[0].terminal,true);
  const serialized=JSON.stringify(flow);
  assert.match(serialized,/service_id/);
  assert.match(serialized,/location/);
  assert.match(serialized,/preferred_date/);
  assert.match(serialized,/preferred_time/);
  assert.doesNotMatch(serialized,/payment|invoice|card|bank|tax|payroll|accounting/i);
  const form=flow.screens[0].layout.children[0];
  assert.equal(form.type,'Form');
  const dropdown=form.children.find(item=>item.type==='Dropdown');
  assert.equal(dropdown?.name,'service_id');
  assert.equal(dropdown?.['data-source'],'${data.services}');
  const footer=form.children.find(item=>item.type==='Footer');
  assert.equal(footer?.['on-click-action']?.name,'complete');
  assert.equal(footer?.['on-click-action']?.payload?.dabbir_kind,'booking_v1');
});

test('nfm_reply parser accepts only the allowlisted booking completion shape',()=>{
  const message={interactive:{type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({
    flow_token:'0123456789abcdef0123456789abcdef',
    dabbir_kind:'booking_v1',
    service_id:'11111111-1111-4111-8111-111111111111',
    location:'Abu Dhabi',preferred_date:'2026-09-09',preferred_time:'10:00',
    arbitrary_secret:'must-not-be-returned'
  })}}};
  const reply=parseBookingFlowReply(message);
  assert.deepEqual(reply,{
    valid:true,kind:'booking_v1',flowToken:'0123456789abcdef0123456789abcdef',
    serviceId:'11111111-1111-4111-8111-111111111111',location:'Abu Dhabi',preferredDate:'2026-09-09',preferredTime:'10:00'
  });
  assert.equal(parseBookingFlowReply({interactive:{type:'nfm_reply',nfm_reply:{response_json:'not-json'}}})?.valid,false);
  assert.equal(parseBookingFlowReply({interactive:{type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({dabbir_kind:'booking_v1'})}}})?.valid,false);
  assert.equal(parseBookingFlowReply({interactive:{type:'button_reply'}}),null);
});

test('Flow session persistence is tenant scoped, one-use and cannot directly create a booking',()=>{
  assert.match(sql,/alter table public\.dabbir_whatsapp_flows enable row level security/i);
  assert.match(sql,/alter table public\.dabbir_whatsapp_flow_sessions force row level security/i);
  assert.match(sql,/revoke all on public\.dabbir_whatsapp_flow_sessions from public,anon,authenticated/i);
  assert.match(sql,/p_token_hash text/);
  assert.match(sql,/token_hash text not null/);
  assert.match(sql,/WHATSAPP_FLOW_TOKEN_ALREADY_USED/);
  assert.match(sql,/WHATSAPP_FLOW_SENDER_SCOPE_INVALID/);
  assert.match(sql,/WHATSAPP_FLOW_SERVICE_SCOPE_INVALID/);
  assert.match(sql,/dabbir_whatsapp_persist_inbound/);
  assert.doesNotMatch(sql,/dabbir_whatsapp_ai_create_booking\s*\(/i);
  assert.doesNotMatch(sql,/flow_token\s+text/i);
});

test('Flow provisioning validates JSON before irreversible publish and versions by schema hash',()=>{
  assert.match(flowSource,/validation_errors/);
  assert.match(flowSource,/META_FLOW_JSON_VALIDATION_FAILED/);
  assert.match(flowSource,/if\(!upload\.ok\)/);
  assert.match(flowSource,/publishMetaFlow/);
  assert.match(flowSource,/BOOKING_FLOW_SCHEMA_HASH\.slice\(0,10\)/);
  assert.match(flowSource,/APPOINTMENT_BOOKING/);
  assert.match(flowSource,/asset_type/);
  assert.match(flowSource,/FLOW_JSON/);
  assert.match(flowSource,/flow_message_version:'3'/);
  assert.match(flowSource,/flow_action:'navigate'/);
});

test('V2 menu delivery prefers published Flow and falls back only after definitive safe failure',()=>{
  const flowLookup=aiCore.indexOf('getPublishedBookingFlow');
  const flowSend=aiCore.indexOf('sendMetaBookingFlow');
  const catalogSend=aiCore.indexOf('sendMetaCatalogProducts',{fromIndex:0});
  assert.ok(flowLookup>=0);
  assert.ok(flowSend>=0);
  assert.ok(catalogSend>=0);
  const runtime=aiCore.slice(aiCore.indexOf('deliverMenu:async'));
  assert.ok(runtime.indexOf('getPublishedBookingFlow')<runtime.indexOf('catalogMenuForContext'));
  assert.ok(runtime.indexOf('sendMetaBookingFlow')<runtime.indexOf('sendMetaCatalogProducts'));
  assert.match(runtime,/flowFallbackSafe/);
  assert.match(runtime,/error\?\.ambiguous===true\|\|Number\(error\?\.providerStatus\)===429/);
});

test('cron provisions Flows without making WhatsApp recovery depend on provisioning success',()=>{
  assert.match(cron,/processWhatsAppFlowProvisioning/);
  assert.match(cron,/flowProvisionError/);
  assert.match(cron,/dabbir_whatsapp_flow_provisioning_failed/);
  assert.match(cron,/flow_provision_ok/);
  assert.ok(cron.indexOf('processWhatsAppFlowProvisioning')<cron.indexOf('processWhatsAppRecoveryWithServiceMenu({limit:12})'));
});

test('signed webhook consumes nfm replies first and removes them from the internal canonical copy',()=>{
  assert.match(webhook,/verifyMetaSignature\(raw,req\.headers\|\|\{\},secret\)/);
  assert.match(webhook,/parseBookingFlowReply/);
  assert.match(webhook,/persistBookingFlowReply/);
  assert.match(webhook,/filter\(message=>message\?\.interactive\?\.type!=='nfm_reply'\)/);
  assert.match(webhook,/createHmac\('sha256',secret\)/);
  assert.doesNotMatch(webhook,/DABBIR_BOOKING_FLOW_RECEIVED/);
});
