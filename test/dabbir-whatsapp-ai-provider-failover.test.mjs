import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isWhatsAppAiProviderFailure } from '../api/_dabbir-whatsapp-ai-provider-failover.js';

const helper=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-provider-failover.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-worker.js',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-cron.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260907081000_dabbir_whatsapp_ai_provider_failover_v1.sql',import.meta.url),'utf8');

test('all supported AI provider and planner failures are classified for immediate continuity failover',()=>{
  for(const code of ['gateway_http_404','gateway_timeout','gemini_http_429','groq_network_error','cloudflare_timeout','AI_PLANNER_UNAVAILABLE','AI_PLANNER_CONTRACT_INVALID','empty_ai_response']){
    assert.equal(isWhatsAppAiProviderFailure(code),true,code);
  }
  assert.equal(isWhatsAppAiProviderFailure('ACTION_SLOT_UNAVAILABLE'),false);
  assert.equal(isWhatsAppAiProviderFailure('META_WHATSAPP_SEND_FAILED'),false);
});

test('provider failover creates one durable handoff and never leaks the provider error to the customer',()=>{
  assert.match(helper,/dabbir_whatsapp_ai_provider_failover/);
  assert.match(helper,/wa-ai-provider-failover:\$\{result\.batch_id\}/);
  assert.doesNotMatch(helper,/attempt_count/);
  assert.match(helper,/حوّلت طلبك للفريق مباشرة/);
  assert.doesNotMatch(helper,/continuityMessage[\s\S]*errorCode/);
  assert.match(helper,/finalizeOutboundReply/);
  assert.match(helper,/markOutboundResult/);
});

test('fast WhatsApp dispatch converts provider RETRY or terminal planner failure into continuity handoff',()=>{
  const processPos=worker.indexOf('processWhatsAppDispatchWithServiceMenu');
  const failoverPos=worker.indexOf('failoverWhatsAppAiProvider(token,result.error)');
  assert.ok(processPos>=0&&failoverPos>processPos);
  assert.match(worker,/\['RETRY','HUMAN_REQUIRED'\]\.includes\(result\?\.state\)/);
  assert.match(worker,/state:'HUMAN_REQUIRED'/);
});

test('recovery cron drains AI failure retries so an interrupted fast dispatch cannot stay silent',()=>{
  assert.match(cron,/recoverWhatsAppAiProviderFailovers/);
  assert.match(cron,/provider_failovers/);
  assert.match(helper,/dabbir_whatsapp_ai_provider_failover_candidates/);
  assert.match(migration,/b\.state='RETRY'/);
  assert.match(migration,/b\.state='HUMAN_REQUIRED'/);
  assert.match(migration,/now\(\)-interval '10 minutes'/);
});

test('database failover is service-role only, stale-turn safe, atomic, terminal, and preserves the real failure',()=>{
  assert.match(migration,/security definer/i);
  assert.match(migration,/set search_path = ''/i);
  assert.match(migration,/SERVICE_ROLE_REQUIRED/);
  assert.match(migration,/SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE/);
  assert.match(migration,/ai_planner_contract_invalid/i);
  assert.match(migration,/v_effective_error/);
  assert.match(migration,/dabbir_whatsapp_ai_handoff/);
  assert.match(migration,/state='HUMAN_REQUIRED'/);
  assert.match(migration,/revoke all on function public\.dabbir_whatsapp_ai_provider_failover\(uuid,text\) from public,anon,authenticated/i);
  assert.match(migration,/grant execute on function public\.dabbir_whatsapp_ai_provider_failover\(uuid,text\) to service_role/i);
});
