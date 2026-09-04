import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { classifyDABBIREvent, extractWhatsAppEvents } from '../api/dabbir-whatsapp-webhook.js';

const core = fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-core.js', import.meta.url), 'utf8');
const webhook = fs.readFileSync(new URL('../api/dabbir-whatsapp-webhook.js', import.meta.url), 'utf8');
const reminder = fs.readFileSync(new URL('../api/dabbir-car-wash-reminder-cron.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('car-wash traffic uses the existing WhatsApp operator before the generic LLM planner', () => {
  const route = core.indexOf("business_type==='car_wash'");
  const planner = core.indexOf('const recent=await recentBookings');
  assert.ok(route > 0 && planner > route);
  assert.match(core, /parseCarWashInquiry\(carWashInquiryText\(context,text\)\)/);
  assert.match(core, /dabbir_car_wash_whatsapp_availability/);
  assert.match(core, /dabbir_car_wash_whatsapp_confirm/);
});

test('outbound idempotency survives retries and failed reservations do not look successful', () => {
  assert.match(core, /key=`wa-ai:\$\{claim\.batch_id\}:\$\{clean\(purpose,24\)\}`/);
  assert.doesNotMatch(core, /wa-ai:\$\{claim\.batch_id\}:attempt/);
  assert.match(core, /\['PROVIDER_ACCEPTED','SENT','DELIVERED','READ'\]\.includes\(state\)/);
  assert.match(core, /error\.ambiguous=true/);
});

test('shadow mode and unavailable voice transcription never send to a customer', () => {
  assert.match(core, /action:'SHADOW_OBSERVATION',external_send:false/);
  assert.match(core, /VOICE_NOTE_TRANSCRIPTION_UNAVAILABLE/);
  assert.match(core, /return \{state:'HUMAN_REQUIRED',handoff:h,external_send:false\}/);
});

test('audio webhook events are persisted truthfully and routed to a human without invented text', () => {
  const [event] = extractWhatsAppEvents({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'test-phone'},messages:[{id:'wamid.audio',from:'971500000000',timestamp:'1788500000',type:'audio',audio:{id:'media-1',mime_type:'audio/ogg; codecs=opus',voice:true}}]}}]}]});
  assert.equal(event.messageType, 'audio');
  assert.equal(event.mediaId, 'media-1');
  assert.equal(event.transcriptionAvailable, false);
  assert.equal(event.text, '[VOICE_NOTE_TRANSCRIPTION_UNAVAILABLE]');
  assert.equal(classifyDABBIREvent(event, 'dabbir_businesses').classification, 'VOICE_NOTE_REQUIRES_TRANSCRIPTION');
});

test('signed provider statuses reconcile delivery evidence without breaking generic status persistence', () => {
  assert.match(webhook, /await applySignedStatus\(event\)/);
  assert.match(webhook, /dabbir_reconcile_car_wash_message_status/);
  assert.match(webhook, /must not make Meta redeliver an already persisted event/);
});

test('reminder cron has bounded retries, no blind ambiguous retry, audit reservation and human escalation', () => {
  for (const marker of ['dabbir_claim_car_wash_reminders','dabbir_whatsapp_ai_reserve_outbound','sendMetaTemplate','finalizeOutboundReply','dabbir_car_wash_record_external_message','dabbir_finish_car_wash_reminder']) assert.match(reminder, new RegExp(marker));
  assert.match(reminder, /providerStatus\)===429&&error\?\.ambiguous!==true/);
  assert.match(reminder, /status=retryable\?'retry':\(error\?\.ambiguous===true\?'ambiguous':'failed'\)/);
  assert.match(reminder, /car-wash-reminder:\$\{item\.job_id\}/);
  assert.ok(vercel.crons.some(item => item.path === '/api/dabbir-car-wash-reminder-cron' && item.schedule === '*/5 * * * *'));
  assert.equal(vercel.functions['api/dabbir-car-wash-reminder-cron.js'].maxDuration, 60);
});
