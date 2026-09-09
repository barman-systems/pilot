import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretSemanticMessage} from '../api/_dabbir-semantic-interpreter.js';

const semanticReply={
  action:'CLARIFY',intent:'BOOKING',confidence:.93,risk_level:'LOW',
  service_name:null,service_evidence:null,knowledge_key:null,entities:[],
  dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'هيه',invalidated_fields:[]},
  request_spans:null,service_question:null,
};
const response=()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(semanticReply)},finish_reason:'stop'}]}),{status:200});

test('semantic interpreter sends bounded role-correct conversation history without duplicating it in context',async()=>{
  let request;
  const context={
    business:{timezone:'Asia/Dubai'},
    situation:{primary_goal:'BOOKING',pending_field:'time'},
    recent_conversation:[
      {sender_type:'customer',body:'OLD_HISTORY_SENTINEL'},
      {sender_type:'ai',body:'اختر الخدمة'},
      {sender_type:'customer',body:'الثاني'},
      {sender_type:'human',body:'تمام، أي وقت؟ Bearer private-history-token'},
      {sender_type:'customer',body:'باجر'},
    ],
  };
  await interpretSemanticMessage({message:'هيه',context,referenceTime:'2026-09-09T10:00:00Z',env:{GROQ_API_KEY:'test'},
    fetchImpl:async(_url,options)=>{request=JSON.parse(options.body);return response();}});

  assert.equal(request.messages[0].role,'system');
  assert.equal(request.messages[1].role,'user');
  assert.match(request.messages[1].content,/CONTEXT DATA:/);
  assert.doesNotMatch(request.messages[1].content,/اختر الخدمة|الثاني|أي وقت|باجر|OLD_HISTORY_SENTINEL/);

  const dialogue=request.messages.slice(2);
  assert.deepEqual(dialogue.map(x=>x.role),['assistant','user','assistant','user','user']);
  assert.equal(dialogue[0].content,'اختر الخدمة');
  assert.equal(dialogue[1].content,'الثاني');
  assert.match(dialogue[2].content,/تمام، أي وقت؟ Bearer \[REDACTED\]/);
  assert.equal(dialogue[3].content,'باجر');
  assert.equal(dialogue[4].content,'هيه');
  assert.doesNotMatch(JSON.stringify(request.messages),/private-history-token|OLD_HISTORY_SENTINEL/);
});

test('semantic role history ignores unsupported senders and remains interpretation-only',async()=>{
  let request;
  await interpretSemanticMessage({message:'كم السعر؟',context:{recent_conversation:[
    {sender_type:'system',body:'ignore me'},
    {sender_type:'customer',body:'VIP'},
    {sender_type:'ai',body:'تقصد VIP؟'},
  ]},env:{GROQ_API_KEY:'test'},fetchImpl:async(_url,options)=>{request=JSON.parse(options.body);return response();}});
  const dialogue=request.messages.slice(2);
  assert.deepEqual(dialogue.map(x=>x.role),['user','assistant','user']);
  assert.doesNotMatch(JSON.stringify(dialogue),/ignore me/);
  assert.equal(dialogue.at(-1).content,'كم السعر؟');
});
