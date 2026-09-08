import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeterministicServiceDiscovery, canonicalizeServiceDiscoveryMessage } from '../api/_dabbir-gcc-understanding-fastpath.js';

const orchestrator=fs.readFileSync(new URL('../api/_dabbir-understanding-orchestrator.js',import.meta.url),'utf8');
const semantic=fs.readFileSync(new URL('../api/_dabbir-semantic-engine.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260908081500_dabbir_whatsapp_ai_continuity_root_v1.sql',import.meta.url),'utf8');

const serviceDiscovery=[
  'شو الخدمات اللي عندكم؟',
  'شو الخدمات اللي عندكك',
  'وش الخدمات اللي عندكم',
  'شنو الخدمات',
  'ايش الخدمات',
  'وش تقدمون',
  'شو تقدمون',
  'شو عندكم',
  'وش عندكم',
  'شوعندكم',
  'خدماتكم',
  'what services do you have?',
  'what do you offer?',
];

test('production wording for service discovery never requires the AI planner',()=>{
  for(const text of serviceDiscovery)assert.equal(isDeterministicServiceDiscovery(text),true,text);
  assert.equal(canonicalizeServiceDiscoveryMessage({body:'شو الخدمات اللي عندكم؟'}).body,'شو عندكم');
  assert.match(orchestrator,/canonicalizeServiceDiscoveryMessage\(message\)/);
});

test('fastpath is narrow and cannot swallow booking pricing cancellation or human requests',()=>{
  for(const text of ['ابي احجز غسيل','كم سعر الغسيل؟','الغ الموعد','ابي اكلم المدير','لا تحجز','وينك']){
    assert.equal(isDeterministicServiceDiscovery(text),false,text);
  }
});

test('explicit human request remains a real blocking semantic action',()=>{
  assert.match(semantic,/CUSTOMER_REQUESTED_HUMAN/);
  assert.match(semantic,/return route\('HANDOFF','CUSTOMER_REQUESTED_HUMAN'\)/);
  assert.match(migration,/customer_requested_human',v_customer_requested/);
});

test('provider degradation cannot set action_required unless continuity delivery itself becomes unsafe',()=>{
  const provider= migration.match(/create or replace function public\.dabbir_whatsapp_ai_provider_failover[\s\S]*?revoke all on function public\.dabbir_whatsapp_ai_provider_failover/)?.[0]||'';
  const hard= migration.match(/create or replace function public\.dabbir_whatsapp_ai_provider_degraded_handoff[\s\S]*?revoke all on function public\.dabbir_whatsapp_ai_provider_degraded_handoff/)?.[0]||'';
  assert.doesNotMatch(provider,/action_required/);
  assert.doesNotMatch(provider,/dabbir_whatsapp_ai_handoff\(/);
  assert.match(hard,/dabbir_whatsapp_ai_handoff\(/);
  assert.match(hard,/HUMAN_REQUIRED/);
});
