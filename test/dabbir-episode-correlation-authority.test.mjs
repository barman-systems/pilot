import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const schema=fs.readFileSync(path.join(root,'supabase/migrations/20260915125000_dabbir_episode_correlation_schema_v1.sql'),'utf8');
const retro=fs.readFileSync(path.join(root,'supabase/migrations/20260915125050_dabbir_episode_funnel_retrobind_v1.sql'),'utf8');
const projection=fs.readFileSync(path.join(root,'supabase/migrations/20260915125100_dabbir_episode_outcome_projection_v1.sql'),'utf8');
const architecture=fs.readFileSync(path.join(root,'docs/architecture/DABBIR_EPISODE_CORRELATION_AUTHORITY_V1.md'),'utf8');

const must=(text,pattern,message)=>assert.match(text,pattern,message);

test('episode correlation crosses every durable booking evidence boundary',()=>{
  for(const table of ['dabbir_ai_understanding_events','dabbir_ai_operator_events','dabbir_ai_action_ledger','dabbir_ai_booking_funnel_events','dabbir_handoffs']){
    must(schema,new RegExp(`alter table public\\.${table} add column if not exists episode_id text`),`missing episode_id on ${table}`);
  }
  must(schema,/dabbir_ai_understanding_episode_idx/);
  must(schema,/dabbir_ai_operator_episode_idx/);
  must(schema,/dabbir_ai_action_episode_idx/);
  must(schema,/dabbir_ai_booking_funnel_episode_idx/);
  must(schema,/dabbir_handoffs_episode_idx/);
});

test('historical V3 correlation uses durable NEW_EPISODE event ids, not timestamp string matching',()=>{
  must(schema,/'legacy-v3:'\|\|\(/);
  must(schema,/a\.metrics->>'episode'='NEW_EPISODE'/);
  must(schema,/order by a\.created_at desc,a\.id desc/);
  assert.doesNotMatch(schema,/legacy-v3:'\|\|[^\n]*created_at/);
});

test('historical action backfill parses only canonical batch keys without unsafe unconditional uuid casts',()=>{
  must(schema,/case\s+when l\.operation_key ~ '\^understanding-v2:/s);
  must(schema,/then split_part\(l\.operation_key,':',2\)::uuid/);
  must(schema,/else null::uuid/);
});

test('V3 understanding and mutation tail fail closed when episode authority is missing',()=>{
  must(schema,/dabbir_ai_understanding_v3_episode_required/);
  must(schema,/V3_EPISODE_ID_REQUIRED/);
  must(schema,/V3_ACTION_EPISODE_ID_REQUIRED/);
  must(schema,/V3_ACTION_EPISODE_ID_MISMATCH/);
});

test('non-conversation knowledge lifecycle events are never attached to the active episode',()=>{
  const start=schema.indexOf('create or replace function dabbir_private.bind_understanding_episode_v1');
  const end=schema.indexOf('create or replace function dabbir_private.bind_operator_episode_v1');
  const binding=schema.slice(start,end);
  must(binding,/new\.event_type not in \('UNDERSTOOD','COGNITIVE_PRESENTED','VERIFIED_ACTION'\)/);
});

test('emergency handoff correlation requires causal proof but never blocks the handoff',()=>{
  const start=schema.indexOf('create or replace function dabbir_private.bind_handoff_episode_v1');
  const end=schema.indexOf('create or replace function dabbir_private.bind_booking_funnel_episode_v1');
  const handoff=schema.slice(start,end);
  must(handoff,/semantic_batch_id/);
  must(handoff,/u\.batch_id=v_batch/);
  must(handoff,/u\.metrics->>'engine'='V3'/);
  must(handoff,/u\.episode_id=v_episode/);
  must(handoff,/b\.state='PROCESSING'/);
  must(handoff,/new\.episode_id:=v_episode/);
  assert.doesNotMatch(handoff,/raise exception/i);
});

test('operator outbound evidence is not correlated from mutable current state',()=>{
  const start=schema.indexOf('create or replace function dabbir_private.bind_operator_episode_v1');
  const end=schema.indexOf('create or replace function dabbir_private.bind_action_episode_v1');
  const operator=schema.slice(start,end);
  assert.doesNotMatch(operator,/source_kind='outbound'/);
  assert.doesNotMatch(operator,/dabbir_ai_conversation_state/);
});

test('late funnel evidence follows durable action sources instead of mutable current conversation state',()=>{
  const start=schema.indexOf('create or replace function dabbir_private.bind_booking_funnel_episode_v1');
  const funnel=schema.slice(start);
  must(funnel,/new\.source_kind='decision'/);
  must(funnel,/new\.source_kind='action'/);
  must(funnel,/new\.source_kind in \('appointment','payment'\)/);
  must(funnel,/l\.operation_type='booking\.create'/);
  assert.doesNotMatch(funnel,/dabbir_ai_conversation_state/);
});

test('booking creation retro-binds the earlier appointment evidence but reschedule and cancel cannot steal it',()=>{
  must(retro,/new\.operation_type<>'booking\.create'/);
  must(retro,/f\.appointment_id=new\.entity_id/);
  must(retro,/f\.episode_id is null/);
  must(retro,/f\.source_kind in \('appointment','payment'\)/);
  assert.doesNotMatch(retro,/booking\.reschedule/);
  assert.doesNotMatch(retro,/booking\.cancel/);
});

test('episode outcome is a read-only evidence projection and keeps completion source separate',()=>{
  must(projection,/create or replace view public\.dabbir_ai_booking_episode_outcomes_v1/);
  must(projection,/with \(security_invoker=true\)/);
  must(projection,/HISTORICAL_HANDOFF_PARTIAL/);
  must(projection,/CAUSAL_NATIVE/);
  must(projection,/VERIFIED_EXTERNAL/);
  must(projection,/COMMITTED/);
  must(projection,/HUMAN_RESOLVED/);
  must(projection,/INFRA_HANDOFF/);
  must(projection,/HUMAN_HANDOFF/);
  must(projection,/UNRESOLVED/);
  must(projection,/then 'AI'/);
  must(projection,/then 'HUMAN'/);
  must(projection,/else 'UNKNOWN'/);
  assert.doesNotMatch(projection,/insert into public\.dabbir_conversation_outcomes/i);
  assert.doesNotMatch(projection,/update public\.dabbir_conversation_outcomes/i);
});

test('architecture requires end-to-end correlation review and reports unresolved separately',()=>{
  must(architecture,/Any new correlation identifier is incomplete unless its PR documents every durable boundary it must cross/);
  must(architecture,/AI autonomous completion \/ all initiated booking episodes/);
  must(architecture,/AI autonomous completion \/ resolved booking episodes/);
  must(architecture,/UNRESOLVED \/ all initiated booking episodes/);
  must(architecture,/completed_by = AI/);
  must(architecture,/completed_by = HUMAN/);
});
