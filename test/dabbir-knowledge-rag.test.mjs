import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {knowledgeDocumentInstruction,knowledgeQueryInstruction,embeddingConfiguration,embedKnowledgeText,vectorSqlText,retrieveDabbirKnowledge,indexApprovedKnowledge} from '../api/_dabbir-knowledge-rag.js';
const vector=Array.from({length:768},(_,i)=>i/1000);
const enabledEnv={GEMINI_API_KEY:'k',DABBIR_KNOWLEDGE_RAG_ENABLED:'1'};
const BUSINESS_ID='11111111-1111-4111-8111-111111111111';
const KNOWLEDGE_ID='22222222-2222-4222-8222-222222222222';

function assertEmbeddingMeter(name,p,businessId=BUSINESS_ID){
 assert.equal(name,'dabbir_record_ai_usage_v1');
 assert.equal(p.p_business_id,businessId);
 assert.equal(p.p_channel,'knowledge_rag');
 assert.equal(p.p_provider,'google-gemini');
 assert.equal(p.p_model,'gemini-embedding-2');
 assert.equal(p.p_cost_mode,'DIRECT_FREE_OR_QUOTA');
 assert.ok(Number.isInteger(p.p_input_tokens)&&p.p_input_tokens>0);
 assert.equal(p.p_output_tokens,0);assert.equal(p.p_reasoning_tokens,0);
 assert.equal(p.p_request_count,1);assert.equal(p.p_actual_cost_microusd,null);
 assert.equal(p.p_cost_source,'DIRECT_PROVIDER_COST_UNPRICED');
 assert.equal(p.p_metadata.meter_scope,'knowledge_embedding');
 assert.equal(p.p_metadata.usage_evidence,'utf8_byte_upper_bound');
 return {ok:true};
}

test('index failures expose bounded provider codes without knowledge text or credentials',async()=>{
 const row={knowledge_id:KNOWLEDGE_ID,business_id:BUSINESS_ID,content:'PRIVATE CUSTOMER CONTENT',content_hash:'0123456789abcdef0123456789abcdef'};
 const result=await indexApprovedKnowledge({env:enabledEnv,rpc:async name=>{assert.equal(name,'dabbir_knowledge_embedding_queue_v1');return [row]},fetchImpl:async()=>({ok:false,status:401,text:async()=>JSON.stringify({error:'secret must not escape'})})});
 assert.equal(result.ok,false);assert.equal(result.indexed,0);assert.equal(result.failed,1);
 assert.deepEqual(result.error_codes,{EMBEDDING_PROVIDER_401:1});
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE CUSTOMER|secret must/);
});
test('retrieval failure remains safe and produces a PII-free diagnostic',async()=>{
 const original=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
 try {
  const result=await retrieveDabbirKnowledge({businessId:BUSINESS_ID,query:'PRIVATE PHONE +971501234567',env:enabledEnv,rpc:async(name,p)=>{if(name==='dabbir_record_ai_usage_v1')return assertEmbeddingMeter(name,p);throw new Error('SECRET DATABASE DETAILS')},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})})});
  assert.deepEqual(result,[]);assert.equal(logs.length,1);assert.equal(logs[0][1].code,'RAG_DEPENDENCY_FAILED');
  assert.equal(logs[0][1].business_id,BUSINESS_ID);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|971501234567|SECRET DATABASE/);
 } finally {console.warn=original;}
});

test('Gemini Embedding 2 uses asymmetric retrieval instructions and existing key',()=>{assert.equal(knowledgeQueryInstruction('حجز غسيل'),'task: search result | query: حجز غسيل');assert.match(knowledgeDocumentInstruction({title:'غسيل',content:'خدمة متنقلة'}),/^title: غسيل \| text: خدمة متنقلة$/);assert.equal(embeddingConfiguration({GEMINI_API_KEY:'existing'}).model,'gemini-embedding-2')});
test('embedding contract is exactly 768 and uses no taskType field',async()=>{let body;const result=await embedKnowledgeText('task: search result | query: test',{env:{GEMINI_API_KEY:'k'},fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}}});assert.equal(result.length,768);assert.equal(body.output_dimensionality,768);assert.equal(body.taskType,undefined);assert.equal(body.content.parts[0].text.startsWith('task:'),true);assert.match(vectorSqlText(result),/^\[/)});
test('retrieval is business scoped, metered, and returns sanitized approved search results',async()=>{let params,metered=0;const rows=await retrieveDabbirKnowledge({businessId:BUSINESS_ID,query:'كم السعر',env:enabledEnv,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async(name,p)=>{if(name==='dabbir_record_ai_usage_v1'){metered++;assert.match(p.p_operation_key,/^knowledge_retrieval_embedding:/);assert.equal(p.p_operation_type,'knowledge_retrieval_embedding');assert.ok(p.p_input_tokens>=Buffer.byteLength('task: search result | query: كم السعر','utf8'));return assertEmbeddingMeter(name,p)}assert.equal(name,'dabbir_knowledge_hybrid_search_v1');params=p;return [{knowledge_key:'price',knowledge_type:'policy',content:'السعر 50',score:.8}]}});assert.equal(metered,1);assert.equal(params.p_business_id,BUSINESS_ID);assert.equal(rows[0].content,'السعر 50')});
test('retrieval fails closed after provider success when embedding exposure cannot be metered',async()=>{let searchCalls=0;const original=console.warn;console.warn=()=>{};try{const rows=await retrieveDabbirKnowledge({businessId:BUSINESS_ID,query:'كم السعر',env:enabledEnv,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async name=>{if(name==='dabbir_record_ai_usage_v1')return {ok:false};searchCalls++;return []}});assert.deepEqual(rows,[]);assert.equal(searchCalls,0)}finally{console.warn=original}});
test('indexer embeds only rows supplied by approved-knowledge queue and meters before persistence',async()=>{const calls=[];const hash='0123456789abcdef0123456789abcdef';const result=await indexApprovedKnowledge({env:{...enabledEnv,GEMINI_API_KEY:'same-key'},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async(name,p)=>{calls.push([name,p]);if(name==='dabbir_knowledge_embedding_queue_v1')return [{knowledge_id:KNOWLEDGE_ID,business_id:BUSINESS_ID,title:'policy',content:'owner approved',content_hash:hash}];if(name==='dabbir_record_ai_usage_v1'){assert.equal(p.p_operation_key,`knowledge_index_embedding:${KNOWLEDGE_ID}:${hash}`);assert.equal(p.p_operation_type,'knowledge_index_embedding');return assertEmbeddingMeter(name,p)}return {ok:true,knowledge_id:p.p_knowledge_id,business_id:BUSINESS_ID,content_hash:p.p_content_hash}}});assert.equal(result.indexed,1);assert.equal(calls[1][0],'dabbir_record_ai_usage_v1');assert.equal(calls[2][0],'dabbir_knowledge_embedding_upsert_v1');assert.equal(calls[2][1].p_model,'gemini-embedding-2')});
test('live retrieval and indexing remain fail closed until explicitly enabled',async()=>{let calls=0;const rpc=async()=>{calls++;return []};const rows=await retrieveDabbirKnowledge({businessId:BUSINESS_ID,query:'كم السعر',env:{GEMINI_API_KEY:'k'},rpc,fetchImpl:async()=>{throw new Error('network must not run')}});const indexing=await indexApprovedKnowledge({env:{GEMINI_API_KEY:'k'},rpc,fetchImpl:async()=>{throw new Error('network must not run')}});assert.deepEqual(rows,[]);assert.equal(indexing.state,'SKIPPED');assert.equal(indexing.reason,'DISABLED');assert.equal(calls,0)});


test('indexer preserves database content bytes and checksum across multilingual whitespace',async()=>{
 const content='policy\nowner_note\nالسعر  ٥٠\tدرهم\r\nService   notes';
 const row={knowledge_id:KNOWLEDGE_ID,business_id:BUSINESS_ID,title:'approved policy',content,content_hash:createHash('md5').update(content).digest('hex')};
 let writes=0,meters=0;
 const result=await indexApprovedKnowledge({env:enabledEnv,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async(name,p)=>{
  if(name==='dabbir_knowledge_embedding_queue_v1')return [row];
  if(name==='dabbir_record_ai_usage_v1'){meters++;return assertEmbeddingMeter(name,p)}
  assert.equal(name,'dabbir_knowledge_embedding_upsert_v1');
  assert.equal(p.p_content,content);
  assert.equal(createHash('md5').update(p.p_content).digest('hex'),p.p_content_hash);
  writes++;
  return {ok:true,knowledge_id:row.knowledge_id,business_id:row.business_id,content_hash:row.content_hash};
 }});
 assert.equal(meters,1);assert.equal(writes,1);assert.equal(result.indexed,1);assert.equal(result.failed,0);assert.equal(result.ok,true);
});
test('indexer does not claim success for an unverified database result',async()=>{
 const row={knowledge_id:KNOWLEDGE_ID,business_id:BUSINESS_ID,content:'approved policy',content_hash:'0123456789abcdef0123456789abcdef'};
 const result=await indexApprovedKnowledge({env:enabledEnv,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async(name,p)=>{if(name==='dabbir_knowledge_embedding_queue_v1')return [row];if(name==='dabbir_record_ai_usage_v1')return assertEmbeddingMeter(name,p);return {ok:true,knowledge_id:row.knowledge_id,business_id:'33333333-3333-4333-8333-333333333333',content_hash:row.content_hash}}});
 assert.equal(result.indexed,0);assert.equal(result.failed,1);assert.deepEqual(result.error_codes,{KNOWLEDGE_UPSERT_UNVERIFIED:1});
});
test('indexer fails closed before storing an embedding when its usage meter is unavailable',async()=>{
 const row={knowledge_id:KNOWLEDGE_ID,business_id:BUSINESS_ID,content:'approved policy',content_hash:'0123456789abcdef0123456789abcdef'};let writes=0;
 const result=await indexApprovedKnowledge({env:enabledEnv,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async(name)=>{if(name==='dabbir_knowledge_embedding_queue_v1')return [row];if(name==='dabbir_record_ai_usage_v1')return {ok:false};writes++;return {ok:true}}});
 assert.equal(writes,0);assert.equal(result.indexed,0);assert.equal(result.failed,1);assert.deepEqual(result.error_codes,{EMBEDDING_USAGE_METER_UNVERIFIED:1});
});
