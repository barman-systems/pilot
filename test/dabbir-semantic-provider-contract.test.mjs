import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDABBIRAiReply} from '../api/_ai-core.js';
import {interpretSemanticMessage} from '../api/_dabbir-semantic-interpreter.js';
import {validSemanticContract} from '../api/_dabbir-semantic-contract.js';

const proposal={action:'CHECK_AVAILABILITY',intent:'BOOKING',confidence:.98,risk_level:'LOW',service_name:null,knowledge_key:null,
  entities:[{entity:'date',value:'2026-09-09',evidence:'بكره',confidence:.99,correction:false},
    {entity:'time',value:'09:00',evidence:'9 الصبح',confidence:.99,correction:false}]};
const response=(content=JSON.stringify(proposal),finish_reason='stop')=>new Response(JSON.stringify({choices:[{message:{content},finish_reason}]}),{status:200});

test('actual semantic interpreter requests JSON under system authority and sanitizes data',async()=>{
  let body;
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',referenceTime:'2026-09-08T18:10:11Z',
    context:{business:{timezone:'Asia/Dubai'},secret:'must-not-leak',history:'Bearer private-value'},env:{GROQ_API_KEY:'test'},
    fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return response();}});
  assert.equal(result.proposal.intent,'BOOKING');
  assert.equal(body.response_format.type,'json_object');assert.equal(body.max_tokens,1600);
  assert.match(body.messages[0].content,/semantic interpreter/);assert.doesNotMatch(body.messages[0].content,/25 words|one short, direct sentence/);
  assert.doesNotMatch(JSON.stringify(body.messages),/must-not-leak|private-value/);
  assert.match(JSON.stringify(body.messages),/2026-09-08T18:10:11Z/);
});

for(const invalid of ['وعليكم السلام، كيف أساعدك؟','',JSON.stringify({...proposal,confidence:'high'}),JSON.stringify({...proposal,entities:[{entity:'location',value:'GPS'}]})]) {
  test('HTTP 200 with invalid semantic content falls through to another provider: '+invalid.slice(0,30),async()=>{
    let calls=0;
    const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{},env:{GEMINI_API_KEY:'test',GROQ_API_KEY:'test'},
      fetchImpl:async()=>++calls===1?response(invalid):response()});
    assert.equal(calls,2);assert.equal(result.provider,'groq');assert.equal(result.proposal.intent,'BOOKING');
  });
}

test('truncated output is rejected even if the prefix happens to be valid JSON',async()=>{
  let calls=0;
  await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{},env:{GEMINI_API_KEY:'test',GROQ_API_KEY:'test'},
    fetchImpl:async()=>++calls===1?response(JSON.stringify(proposal),'length'):response()});
  assert.equal(calls,2);
});

test('invalid output from every provider fails closed without any proposed action',async()=>{
  await assert.rejects(interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{},env:{GROQ_API_KEY:'test'},fetchImpl:async()=>response('hello')}),{code:'AI_PLANNER_UNAVAILABLE'});
});

test('ordinary customer replies retain their short answer contract and contact guard',async()=>{
  let body;
  const result=await generateDABBIRAiReply({project:'dabbir_businesses',message:'contact?',env:{GROQ_API_KEY:'test'},
    fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return response('Visit https://unverified.example.com');}});
  assert.equal(body.max_tokens,320);assert.equal(body.response_format,undefined);
  assert.match(body.messages[0].content,/25 words/);assert.equal(result.guarded,true);
});

test('contract refuses prose envelopes and unsupported execution data',()=>{
  assert.equal(validSemanticContract('```json\n'+JSON.stringify(proposal)+'\n```'),false);
  assert.equal(validSemanticContract(JSON.stringify({...proposal,action:'RUN_SQL'})),false);
});
