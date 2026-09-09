import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {generateDABBIRAiReply} from '../api/_ai-core.js';
import {interpretSemanticMessage, evaluateSemanticProbe} from '../api/_dabbir-semantic-interpreter.js';
import {SEMANTIC_JSON_SCHEMA,semanticRequestSpans,validSemanticContract,semanticContractViolation} from '../api/_dabbir-semantic-contract.js';

const proposal={action:'CHECK_AVAILABILITY',intent:'BOOKING',confidence:.98,risk_level:'LOW',service_name:null,knowledge_key:null,
  entities:[{entity:'date',value:'2026-09-09',evidence:'بكره',confidence:.99,correction:false},
    {entity:'time',value:'09:00',evidence:'9 الصبح',confidence:.99,correction:false}]};
const response=(content=JSON.stringify(proposal),finish_reason='stop')=>new Response(JSON.stringify({choices:[{message:{content},finish_reason}]}),{status:200});

test('live REQUEST_SPAN_COUNT regression: portable generation and legacy decoding preserve bounded job cardinality',()=>{
 const schema=z.fromJSONSchema(SEMANTIC_JSON_SCHEMA);
 const complete={...proposal,service_evidence:null,service_question:null,dialogue:{message_role:'NEW_REQUEST',evidence:'book tomorrow',invalidated_fields:[]}};
 for(const count of [0,1,2,3,4,8]){
  const quotes=Array.from({length:count},(_,i)=>'book independent service '+i);
  const value={...complete,request_spans:quotes};
  const expected=[0,2,3].includes(count);
  assert.equal(validSemanticContract(JSON.stringify(value)),expected,'legacy application count '+count);
  const wire={...complete,request_spans:count===0?null:{first_quote:quotes[0],second_quote:quotes[1]??null,third_quote:quotes[2]??null,...(count>3?{fourth_quote:quotes[3]}:{})}};
  assert.equal(schema.safeParse(wire).success,expected,'portable provider cardinality '+count);
  assert.equal(validSemanticContract(JSON.stringify(wire)),expected,'portable application cardinality '+count);
  if(expected)assert.deepEqual(semanticRequestSpans(wire.request_spans),quotes);
 }
 for(const text of ['short','x'.repeat(501)]){
  const value={...complete,request_spans:[text,'book another service']};
  assert.equal(validSemanticContract(JSON.stringify(value)),false);
  const wire={...complete,request_spans:{first_quote:text,second_quote:'book another service',third_quote:null}};
  assert.equal(schema.safeParse(wire).success&&validSemanticContract(JSON.stringify(wire)),false,'generation plus execution evidence boundary');
 }
});

test('strict request encoding uses documented object/null unions instead of rejected array bounds',()=>{
 const text=JSON.stringify(SEMANTIC_JSON_SCHEMA.properties.request_spans);
 assert.doesNotMatch(text,/minItems|maxItems|minLength|maxLength/);
 const shape=SEMANTIC_JSON_SCHEMA.properties.request_spans.anyOf[1];
 assert.deepEqual(shape.required,['first_quote','second_quote','third_quote']);assert.equal(shape.additionalProperties,false);
 for(const value of [{first_quote:'first only'},{first_quote:'first request',second_quote:null,third_quote:null},{first_quote:'first request',second_quote:'second request',third_quote:null,extra:'injected'}]){
  assert.equal(validSemanticContract(JSON.stringify({...proposal,request_spans:value})),false);
 }
});

test('actual interpreter decodes two or three native quotes into the existing planner array',async()=>{
 const quotes=['book exterior today','book VIP tomorrow','cancel my old appointment'];
 for(const count of [0,2,3]){
  const raw={...proposal,entities:[],request_spans:count===0?null:{first_quote:quotes[0],second_quote:quotes[1],third_quote:count===3?quotes[2]:null}};
  const result=await interpretSemanticMessage({message:quotes.slice(0,count).join(' and ')||'hello',context:{},env:{GROQ_API_KEY:'test'},fetchImpl:async()=>response(JSON.stringify(raw))});
  assert.deepEqual(result.proposal.requestSpans,quotes.slice(0,count));
 }
});

test('actual semantic interpreter requests JSON under system authority and sanitizes data',async()=>{
  let body;
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',referenceTime:'2026-09-08T18:10:11Z',
    context:{business:{timezone:'Asia/Dubai'},secret:'must-not-leak',history:'Bearer private-value'},env:{GROQ_API_KEY:'test'},
    fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return response();}});
  assert.equal(result.proposal.intent,'BOOKING');
  assert.equal(body.response_format.type,'json_schema');assert.equal(body.max_tokens,1600);
  assert.equal(body.response_format.json_schema.strict,true);
  assert.equal(body.response_format.json_schema.name,'dabbir_semantic_interpretation');
  const schema=body.response_format.json_schema.schema;
  for(const object of [schema,schema.properties.dialogue,schema.properties.entities.items]){
    assert.equal(object.additionalProperties,false);
    assert.deepEqual([...object.required].sort(),Object.keys(object.properties).sort());
  }
  assert.ok(schema.required.includes('dialogue'));assert.ok(schema.required.includes('request_spans'));
  assert.ok(schema.properties.dialogue.properties.message_role.enum.includes('ANSWER_TO_PENDING_QUESTION'));
  assert.ok(schema.properties.entities.items.properties.entity.enum.includes('property_details'));
  assert.equal(schema.properties.action.enum.includes('RUN_SQL'),false);
  assert.match(body.messages[0].content,/semantic interpreter/);assert.doesNotMatch(body.messages[0].content,/25 words|one short, direct sentence/);
  assert.doesNotMatch(JSON.stringify(body.messages),/must-not-leak|private-value/);
  assert.match(JSON.stringify(body.messages),/2026-09-08T18:10:11Z/);
});

for(const [provider,env] of [
  ['gemini',{GEMINI_API_KEY:'test'}],
  ['cloudflare',{CLOUDFLARE_API_TOKEN:'test',CLOUDFLARE_ACCOUNT_ID:'test'}],
  ['gateway',{VERCEL_ENV:'production',AI_GATEWAY_API_KEY:'test'}],
  ['unverified Groq override',{GROQ_API_KEY:'test',DABBIR_AI_MODEL:'configured-model-without-verified-schema-support'}],
])test('schema capability is not assumed for '+provider,async()=>{
  let body;
  await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{},env,
    fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return response();}});
  assert.deepEqual(body.response_format,{type:'json_object'});
  assert.equal(body.max_tokens,1600);assert.equal(body.stream,false);
});

test('strict schema output still passes through confidence and evidence authority',async()=>{
  const structured={...proposal,service_name:'VIP Wash',service_evidence:'VIP',
    dialogue:{message_role:'NEW_REQUEST',evidence:'بكره',invalidated_fields:[]},request_spans:[]};
  let calls=0;
  await assert.rejects(interpretSemanticMessage({message:'بكره',context:{},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>{calls++;return response(JSON.stringify({...structured,confidence:2}));}}),{code:'AI_PLANNER_UNAVAILABLE'});
  assert.equal(calls,2);
  const result=await interpretSemanticMessage({message:'بكره',context:{services:[{name:'VIP Wash'}]},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify(structured))});
  assert.equal(result.proposal.serviceName,null,'schema conformance never authorizes a service absent from the message');
});

test('strict schema rejection uses the existing fallback budget and format',async()=>{
  const requests=[];
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{},
    env:{GROQ_API_KEY:'test',CLOUDFLARE_API_TOKEN:'test',CLOUDFLARE_ACCOUNT_ID:'test'},
    fetchImpl:async(_url,options)=>{requests.push(JSON.parse(options.body));return requests.length<3?response('invalid'):response();}});
  assert.equal(requests.length,3);assert.equal(requests[0].response_format.type,'json_schema');
  assert.deepEqual(requests[1].response_format,{type:'json_object'});
  assert.deepEqual(requests[2].response_format,{type:'json_object'});
  assert.equal(result.provider,'cloudflare-workers-ai');
});

test('provider schema refusal permits one metered compatibility attempt with identical validation',async()=>{
 const formats=[];
 const r=await interpretSemanticMessage({message:'بكره',context:{},env:{GROQ_API_KEY:'test'},fetchImpl:async(_u,o)=>{
  formats.push(JSON.parse(o.body).response_format.type);
  return formats.length===1?new Response(JSON.stringify({error:{code:'json_validate_failed',failed_generation:'must-not-be-logged'}}),{status:400}):response();
 }});
 assert.deepEqual(formats,['json_schema','json_object']);assert.equal(r.provider,'groq');assert.equal(r.telemetry.request_count,2);
});
for(const status of [401,403,429,500])test('schema compatibility never retries auth, quota or server status '+status,async()=>{
 let calls=0;await assert.rejects(interpretSemanticMessage({message:'بكره',context:{},env:{GROQ_API_KEY:'test'},fetchImpl:async()=>{calls++;return new Response('{}',{status});}}),{code:'AI_PLANNER_UNAVAILABLE'});
 assert.equal(calls,1);
});
test('structural diagnostics name the violated constraint without disclosing values',()=>{
 assert.equal(semanticContractViolation(JSON.stringify({...proposal,request_spans:['private customer sentence']})),'REQUEST_SPAN_COUNT');
 assert.equal(semanticContractViolation(JSON.stringify({...proposal,dialogue:{message_role:'SOCIAL',evidence:'',invalidated_fields:[]}})),'DIALOGUE_EVIDENCE');
 assert.equal(semanticContractViolation(JSON.stringify(proposal)),null);
});

test('explicit availability with grounded date/time is deterministic even when provider misclassifies it',async()=>{
  const providerMistake={...proposal,action:'SERVICE_MENU',intent:'SERVICE_DISCOVERY',confidence:.42};
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{services:[{name:'غسيل كامل'}]},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify(providerMistake))});
  assert.equal(result.proposal.intent,'BOOKING');
  assert.equal(result.proposal.action,'CHECK_AVAILABILITY');
  assert.equal(result.proposal.confidence,.96);
  assert.equal(result.proposal.intentResolution,'DETERMINISTIC_AVAILABILITY_WITH_TEMPORAL_EVIDENCE');
  const probe=evaluateSemanticProbe(result.proposal);
  assert.equal(probe.passed,true);assert.equal(probe.policy_action,'CLARIFY');
});

test('deterministic availability policy also covers English temporal availability language',async()=>{
  const providerMistake={action:'SERVICE_MENU',intent:'SERVICE_DISCOVERY',confidence:.55,risk_level:'LOW',service_name:null,service_evidence:null,knowledge_key:null,
    entities:[{entity:'date',value:'2026-09-09',evidence:'tomorrow',confidence:.99,correction:false},{entity:'time',value:'09:00',evidence:'9',confidence:.99,correction:false}]};
  const result=await interpretSemanticMessage({message:'Any availability tomorrow at 9?',context:{},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify(providerMistake))});
  assert.equal(result.proposal.intent,'BOOKING');assert.equal(result.proposal.action,'CHECK_AVAILABILITY');
  assert.equal(result.proposal.intentResolution,'DETERMINISTIC_AVAILABILITY_WITH_TEMPORAL_EVIDENCE');
});

test('service discovery without grounded temporal evidence is not promoted to booking',async()=>{
  const discovery={action:'SERVICE_MENU',intent:'SERVICE_DISCOVERY',confidence:.95,risk_level:'LOW',service_name:null,service_evidence:null,knowledge_key:null,entities:[]};
  const result=await interpretSemanticMessage({message:'وش الخدمات المتوفرة؟',context:{},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify(discovery))});
  assert.equal(result.proposal.intent,'SERVICE_DISCOVERY');assert.equal(result.proposal.action,'SERVICE_MENU');
  assert.equal(result.proposal.intentResolution,undefined);
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

test('a sole catalog service is not a customer selection without message evidence',async()=>{
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{services:[{name:'غسيل كامل'}]},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify({...proposal,service_name:'غسيل كامل',service_evidence:'فاضين'}))});
  assert.equal(result.proposal.serviceName,null);
  assert.equal(result.proposal.intent,'BOOKING');assert.equal(result.proposal.entities[1].value,'09:00');
});

for(const evidence of [null,'غسيل كامل','بكره'])test('unsubstantiated service evidence is rejected: '+evidence,async()=>{
  const result=await interpretSemanticMessage({message:'فاضين بكره 9 الصبح',context:{services:[{name:'غسيل كامل'}]},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify({...proposal,service_name:'غسيل كامل',service_evidence:evidence}))});
  assert.equal(result.proposal.serviceName,null);
});

test('explicit service mention in the current message can select a supplied catalog name',async()=>{
  const result=await interpretSemanticMessage({message:'أبا VIP باجر',context:{services:[{name:'VIP Wash'}]},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify({...proposal,service_name:'VIP Wash',service_evidence:'VIP'}))});
  assert.equal(result.proposal.serviceName,'VIP Wash');
});

test('a quoted service absent from the scoped catalog is rejected',async()=>{
  const result=await interpretSemanticMessage({message:'أبا VIP',context:{services:[{name:'Haircut'}]},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(JSON.stringify({...proposal,service_name:'VIP Wash',service_evidence:'VIP'}))});
  assert.equal(result.proposal.serviceName,null);
});

for(const risk of ['LOW','MEDIUM'])test('live probe requires safe actual clarification for '+risk+' proposal',()=>{
  const p={...proposal,riskLevel:risk,serviceName:null};
  const result=evaluateSemanticProbe(p);
  assert.equal(result.passed,true);assert.equal(result.policy_action,'CLARIFY');
  assert.equal(Object.keys(result.checks).length,5);
});

test('live probe still rejects a provider proposal that forces human handoff',()=>{
  const result=evaluateSemanticProbe({...proposal,riskLevel:'HIGH',serviceName:null});
  assert.equal(result.passed,false);assert.equal(result.policy_action,'HANDOFF');
  assert.equal(result.checks.operational_clarification,false);
});

test('live probe rejects low-confidence interpretation despite correctly shaped values when policy boundary is bypassed',()=>{
  const result=evaluateSemanticProbe({...proposal,confidence:.5,riskLevel:'LOW',serviceName:null});
  assert.equal(result.passed,false);assert.equal(result.checks.booking_intent,false);
});
