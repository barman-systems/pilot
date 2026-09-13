import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretSemanticMessage} from '../api/_dabbir-semantic-interpreter.js';

function providerResponse(overrides={}){
  const output={
    action:'CLARIFY',
    intent:'BOOKING',
    confidence:.98,
    risk_level:'LOW',
    service_name:'استشارة',
    service_evidence:'استشارة',
    knowledge_key:null,
    entities:[],
    service_question:{field:'duration_minutes',evidence:'كم تاخذ وقت؟'},
    dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'كم تاخذ وقت؟',invalidated_fields:[]},
    request_spans:[],
    ...overrides,
  };
  return async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]}),{status:200});
}

test('ungrounded model service_name cannot turn an implicit side question into an explicit target',async()=>{
  const result=await interpretSemanticMessage({
    message:'كم تاخذ وقت؟',
    context:{services:[{name:'استشارة'}]},
    env:{GROQ_API_KEY:'test'},
    fetchImpl:providerResponse(),
  });
  assert.equal(result.proposal.serviceName,null);
  assert.equal(result.proposal.serviceQuestion.field,'duration_minutes');
  assert.equal(result.proposal.serviceQuestion.explicit_service,false);
});

test('a service explicitly grounded in the current message remains an explicit target',async()=>{
  const result=await interpretSemanticMessage({
    message:'استشارة كم تاخذ وقت؟',
    context:{services:[{name:'استشارة'}]},
    env:{GROQ_API_KEY:'test'},
    fetchImpl:providerResponse({service_evidence:'استشارة'}),
  });
  assert.equal(result.proposal.serviceName,'استشارة');
  assert.equal(result.proposal.serviceQuestion.field,'duration_minutes');
  assert.equal(result.proposal.serviceQuestion.explicit_service,true);
});
