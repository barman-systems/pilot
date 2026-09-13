import test from 'node:test';
import assert from 'node:assert/strict';
import {runConversationRuntimeTurn} from '../api/_dabbir-conversation-runtime.js';
import {context,ids} from './fixtures/understanding/cases.mjs';

const batchId='90000000-0000-4000-8000-000000000001';

test('legacy-visible conversation routes and executes from one semantic load snapshot',async()=>{
  const at='2026-09-11T10:05:00Z';
  const c=context({
    batch:{id:batchId,last_message_at:at},
    batch_messages:[{id:'91000000-0000-4000-8000-000000000001',body:'مرحبا',created_at:at}],
    history:[],
  });
  const claim={batch_id:batchId,lock_token:'lock-one-snapshot',attempt_count:1};
  const load={semantic_state:{},version:0,message_revision:1,cognitive_policy:{mode:'shadow'},activity_profile:c.activity_profile};
  const calls=[];
  const rpc=async(name,args)=>{
    calls.push({name,args});
    if(name==='dabbir_semantic_load_v2')return structuredClone(load);
    if(name==='dabbir_semantic_commit_v2')return {version:1,replay:false,state:args.p_state};
    if(name==='dabbir_semantic_set_pending_v2')return true;
    if(name==='dabbir_record_ai_operator_decision_v1')return true;
    return true;
  };
  const replies=[];
  const result=await runConversationRuntimeTurn({
    claim,context:c,rpc,
    deliver:async(_claim,_context,text)=>{replies.push(text);return {providerMessageId:'provider-message-1'};},
    finish:async()=>true,handoff:async()=>true,bookingText:()=>'',slotsText:()=>'',
    resolveProduct:()=>null,deliverMenu:async()=>null,logger:{info(){},error(){}},
  });

  assert.equal(calls.filter(x=>x.name==='dabbir_semantic_load_v2').length,1,'engine selection and legacy execution must share one database snapshot');
  assert.equal(calls.find(x=>x.name==='dabbir_semantic_load_v2')?.args?.p_batch_id,batchId);
  assert.equal(calls.find(x=>x.name==='dabbir_semantic_load_v2')?.args?.p_lock_token,claim.lock_token);
  assert.equal(calls.filter(x=>x.name==='dabbir_semantic_commit_v2').length,1);
  assert.equal(result.state,'PROCESSED');
  assert.equal(replies.length,1);
});

test('preloaded semantic snapshot remains fenced to the selected batch and lock',async()=>{
  const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../api/_dabbir-conversation-runtime.js',import.meta.url),'utf8'));
  assert.match(source,/args\?\.p_batch_id!==claim\.batch_id\|\|args\?\.p_lock_token!==claim\.lock_token/);
  assert.match(source,/SEMANTIC_PRELOAD_SCOPE_MISMATCH/);
  assert.match(source,/const turnRpc=preloadedSemanticRpc\(\{rpc,claim,load:routingLoad\}\)/);
  assert.match(source,/createV3ShadowObserver\(\{context,rpc:turnRpc\}\)/);
});
