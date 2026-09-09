import test from 'node:test';import assert from 'node:assert/strict';
import {knowledgeDocumentInstruction,knowledgeQueryInstruction,embeddingConfiguration,embedKnowledgeText,vectorSqlText,retrieveDabbirKnowledge,indexApprovedKnowledge} from '../api/_dabbir-knowledge-rag.js';
const vector=Array.from({length:768},(_,i)=>i/1000);
const enabledEnv={GEMINI_API_KEY:'k',DABBIR_KNOWLEDGE_RAG_ENABLED:'1'};

test('index failures expose bounded provider codes without knowledge text or credentials',async()=>{
 const row={knowledge_id:'22222222-2222-4222-8222-222222222222',content:'PRIVATE CUSTOMER CONTENT',content_hash:'0123456789abcdef0123456789abcdef'};
 const result=await indexApprovedKnowledge({env:enabledEnv,rpc:async name=>{assert.equal(name,'dabbir_knowledge_embedding_queue_v1');return [row]},fetchImpl:async()=>({ok:false,status:401,text:async()=>JSON.stringify({error:'secret must not escape'})})});
 assert.equal(result.ok,false);assert.equal(result.indexed,0);assert.equal(result.failed,1);
 assert.deepEqual(result.error_codes,{EMBEDDING_PROVIDER_401:1});
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE CUSTOMER|secret must/);
});
test('retrieval failure remains safe and produces a PII-free diagnostic',async()=>{
 const original=console.warn,logs=[];console.warn=(...args)=>logs.push(args);
 try {
  const result=await retrieveDabbirKnowledge({businessId:'11111111-1111-4111-8111-111111111111',query:'PRIVATE PHONE +971501234567',env:enabledEnv,rpc:async()=>{throw new Error('SECRET DATABASE DETAILS')},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})})});
  assert.deepEqual(result,[]);assert.equal(logs.length,1);assert.equal(logs[0][1].code,'RAG_DEPENDENCY_FAILED');
  assert.equal(logs[0][1].business_id,'11111111-1111-4111-8111-111111111111');
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|971501234567|SECRET DATABASE/);
 } finally {console.warn=original;}
});

test('Gemini Embedding 2 uses asymmetric retrieval instructions and existing key',()=>{assert.equal(knowledgeQueryInstruction('حجز غسيل'),'task: search result | query: حجز غسيل');assert.match(knowledgeDocumentInstruction({title:'غسيل',content:'خدمة متنقلة'}),/^title: غسيل \| text: خدمة متنقلة$/);assert.equal(embeddingConfiguration({GEMINI_API_KEY:'existing'}).model,'gemini-embedding-2')});
test('embedding contract is exactly 768 and uses no taskType field',async()=>{let body;const result=await embedKnowledgeText('task: search result | query: test',{env:{GEMINI_API_KEY:'k'},fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}}});assert.equal(result.length,768);assert.equal(body.output_dimensionality,768);assert.equal(body.taskType,undefined);assert.equal(body.content.parts[0].text.startsWith('task:'),true);assert.match(vectorSqlText(result),/^\[/)});
test('retrieval is business scoped and returns sanitized approved search results',async()=>{let params;const rows=await retrieveDabbirKnowledge({businessId:'11111111-1111-4111-8111-111111111111',query:'كم السعر',env:enabledEnv,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async(name,p)=>{assert.equal(name,'dabbir_knowledge_hybrid_search_v1');params=p;return [{knowledge_key:'price',knowledge_type:'policy',content:'السعر 50',score:.8}]}});assert.equal(params.p_business_id,'11111111-1111-4111-8111-111111111111');assert.equal(rows[0].content,'السعر 50')});
test('indexer embeds only rows supplied by approved-knowledge queue and does not need a new credential',async()=>{const calls=[];const result=await indexApprovedKnowledge({env:{...enabledEnv,GEMINI_API_KEY:'same-key'},fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({embedding:{values:vector}})}),rpc:async(name,p)=>{calls.push([name,p]);if(name==='dabbir_knowledge_embedding_queue_v1')return [{knowledge_id:'22222222-2222-4222-8222-222222222222',title:'policy',content:'owner approved',content_hash:'0123456789abcdef0123456789abcdef'}];return {ok:true}}});assert.equal(result.indexed,1);assert.equal(calls[1][0],'dabbir_knowledge_embedding_upsert_v1');assert.equal(calls[1][1].p_model,'gemini-embedding-2')});
test('live retrieval and indexing remain fail closed until explicitly enabled',async()=>{let calls=0;const rpc=async()=>{calls++;return []};const rows=await retrieveDabbirKnowledge({businessId:'11111111-1111-4111-8111-111111111111',query:'كم السعر',env:{GEMINI_API_KEY:'k'},rpc,fetchImpl:async()=>{throw new Error('network must not run')}});const indexing=await indexApprovedKnowledge({env:{GEMINI_API_KEY:'k'},rpc,fetchImpl:async()=>{throw new Error('network must not run')}});assert.deepEqual(rows,[]);assert.equal(indexing.state,'SKIPPED');assert.equal(indexing.reason,'DISABLED');assert.equal(calls,0)});
