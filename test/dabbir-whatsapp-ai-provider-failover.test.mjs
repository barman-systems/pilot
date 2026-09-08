import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isWhatsAppAiProviderFailure, providerContinuityMessage } from '../api/_dabbir-whatsapp-ai-provider-failover.js';

const helper=fs.readFileSync(new URL('../api/_dabbir-whatsapp-ai-provider-failover.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-worker.js',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../api/dabbir-whatsapp-ai-cron.js',import.meta.url),'utf8');
const original=fs.readFileSync(new URL('../supabase/migrations/20260907081000_dabbir_whatsapp_ai_provider_failover_v1.sql',import.meta.url),'utf8');
const repair=fs.readFileSync(new URL('../supabase/migrations/20260908083500_dabbir_whatsapp_ai_provider_continuity_truth_v1.sql',import.meta.url),'utf8');
const safety=fs.readFileSync(new URL('../supabase/migrations/20260908084600_dabbir_whatsapp_ai_provider_continuity_safety_v2.sql',import.meta.url),'utf8');

test('all supported AI provider and planner failures remain classified for bounded continuity handling',()=>{
  for(const code of ['gateway_http_404','gateway_timeout','gemini_http_429','groq_network_error','cloudflare_timeout','AI_PLANNER_UNAVAILABLE','AI_PLANNER_CONTRACT_INVALID','empty_ai_response']){
    assert.equal(isWhatsAppAiProviderFailure(code),true,code);
  }
  assert.equal(isWhatsAppAiProviderFailure('ACTION_SLOT_UNAVAILABLE'),false);
  assert.equal(isWhatsAppAiProviderFailure('META_WHATSAPP_SEND_FAILED'),false);
});

test('provider outage message is truthful, language-only and does not claim a human handoff',()=>{
  const ar=providerContinuityMessage('ar');
  const en=providerContinuityMessage('en');
  assert.match(ar,/خلل مؤقت/);
  assert.match(en,/temporary processing issue/i);
  assert.doesNotMatch(ar,/حوّلت|الفريق|موظف|المدير/);
  assert.doesNotMatch(en,/team|human|agent|manager/i);
  assert.match(helper,/result\.customer_language/);
  assert.doesNotMatch(helper,/result\.customer_body/);
  assert.match(helper,/dabbir_whatsapp_ai_provider_degraded_complete/);
  assert.match(helper,/dabbir_whatsapp_ai_provider_degraded_handoff/);
});

test('nonterminal reservation replay is never reported as delivered',()=>{
  assert.match(helper,/TERMINAL_SUCCESS=new Set\(\['PROVIDER_ACCEPTED','SENT','DELIVERED','READ'\]\)/);
  assert.match(helper,/state==='AMBIGUOUS'/);
  assert.match(helper,/state==='FAILED'/);
  assert.match(helper,/AI_PROVIDER_CONTINUITY_RESERVATION_/);
  assert.doesNotMatch(helper,/should_send!==true\)\{\s*return \{delivered:true,deduplicated:true/);
});

test('fast dispatch preserves retry continuity and never reclaims HUMAN_REQUIRED',()=>{
  const processPos=worker.indexOf('processWhatsAppDispatchWithServiceMenu');
  const failoverPos=worker.indexOf('failoverWhatsAppAiProvider(token,result.error)');
  assert.ok(processPos>=0&&failoverPos>processPos);
  assert.match(worker,/result\?\.state==='RETRY'/);
  assert.doesNotMatch(worker,/\['RETRY','HUMAN_REQUIRED'\]\.includes/);
  assert.match(worker,/state:clean\(failover\.state,40\)\|\|result\.state/);
  assert.doesNotMatch(worker,/state:'HUMAN_REQUIRED',provider_failover:true/);
});

test('recovery cron still drains provider failures but provider-only degradation no longer creates a handoff',()=>{
  assert.match(cron,/recoverWhatsAppAiProviderFailovers/);
  assert.match(cron,/provider_failovers/);
  assert.match(helper,/dabbir_whatsapp_ai_provider_failover_candidates/);
  assert.match(original,/b\.state='RETRY'/);
  const providerFn=repair.match(/create or replace function public\.dabbir_whatsapp_ai_provider_failover[\s\S]*?revoke all on function public\.dabbir_whatsapp_ai_provider_failover/)?.[0]||'';
  assert.doesNotMatch(providerFn,/dabbir_whatsapp_ai_handoff\(/);
  assert.doesNotMatch(providerFn,/action_required/);
});

test('database continuity is service-role-only, stale-turn safe, and closes only after verified Meta acceptance',()=>{
  assert.match(repair,/security definer/i);
  assert.match(repair,/SERVICE_ROLE_REQUIRED/);
  assert.match(repair,/SUPERSEDED_BY_NEW_CUSTOMER_MESSAGE/);
  assert.match(repair,/PROVIDER_CONTINUITY_DELIVERY_UNVERIFIED/);
  assert.match(repair,/r\.state in \('PROVIDER_ACCEPTED','SENT','DELIVERED','READ'\)/);
  assert.match(repair,/AI_PROVIDER_DEGRADED_CONTINUITY/);
  assert.match(repair,/customer_handoff',false/);
  assert.match(repair,/revoke all on function public\.dabbir_whatsapp_ai_provider_failover\(uuid,text\) from public,anon,authenticated/i);
  assert.match(repair,/revoke all on function public\.dabbir_whatsapp_ai_provider_degraded_complete\(uuid,text\) from public,anon,authenticated/i);
  assert.match(repair,/revoke all on function public\.dabbir_whatsapp_ai_provider_degraded_handoff\(uuid,text\) from public,anon,authenticated/i);
});

test('provider continuity cannot emit after ownership moves to a human and candidates are RETRY-only',()=>{
  assert.match(safety,/v_conversation\.state in \('human_active','action_required','closed'\)/);
  assert.match(safety,/h\.state in \('QUEUED','ASSIGNED','HUMAN_ACTIVE'\)/);
  assert.match(safety,/and b\.state='RETRY'/);
  assert.doesNotMatch(safety,/b\.state='HUMAN_REQUIRED'/);
  assert.match(safety,/return jsonb_build_object\('ok',true,'handled',false,'state','HUMAN_REQUIRED'\)/);
});

test('provider continuity RPC returns only language classification, not raw customer text',()=>{
  const responseSection=safety.match(/Return only the language needed[\s\S]*?end;\n\$function\$/)?.[0]||'';
  assert.match(responseSection,/'customer_language',v_customer_language/);
  assert.doesNotMatch(responseSection,/'customer_body'/);
});

test('generic handoff metadata distinguishes an actual customer request from system escalation and repairs history',()=>{
  assert.match(repair,/v_customer_requested/);
  assert.match(repair,/CUSTOMER_REQUESTED_HUMAN/);
  assert.match(repair,/'customer_requested_human',v_customer_requested/);
  assert.doesNotMatch(repair,/'customer_requested_human',true/);
  assert.match(safety,/update public\.dabbir_handoffs h/);
  assert.match(safety,/'customer_requested_human'/);
  assert.match(safety,/where coalesce\(h\.metadata->>'source',''\)='dabbir_whatsapp_ai'/);
});
