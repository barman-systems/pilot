import test from 'node:test';
import assert from 'node:assert/strict';
import {probeCognitiveDialogue} from '../api/_dabbir-cognitive-probe.js';

const first='أبي أحجز خارجي اليوم الساعة 5 م';
const second='أبي أحجز VIP بكره الساعة 6 م';

test('live provider role drift cannot turn a VIP price side question into the active booking service',async()=>{
  const result=await probeCognitiveDialogue({
    scenario:'multiple_requests',
    interpret:async({message})=>{
      if(message.includes('وبعدين'))return {
        provider:'test-provider',model:'live-regression-model',
        proposal:{
          action:'CHECK_AVAILABILITY',intent:'BOOKING',confidence:.95,riskLevel:'LOW',entities:[],
          requestSpans:[first,second],
          dialogue:{message_role:'NEW_REQUEST',evidence:message,invalidated_fields:[]}
        }
      };
      if(message==='كم VIP')return {
        provider:'test-provider',model:'live-regression-model',
        proposal:{
          action:'PRICING',intent:'PRICING',confidence:.95,riskLevel:'LOW',entities:[],
          serviceName:'VIP',
          serviceQuestion:{field:'price',evidence:'كم VIP',explicit_service:true},
          // This is the exact bad role seen in Production. The explicit
          // serviceQuestion contract is still a read-only side question.
          dialogue:{message_role:'ANSWER_TO_PENDING_QUESTION',evidence:'كم VIP',invalidated_fields:[]}
        }
      };
      return {
        provider:'test-provider',model:'live-regression-model',
        proposal:{
          action:message.startsWith('لا ')?'CLARIFY':'REPLY',intent:'BOOKING',confidence:.99,riskLevel:'LOW',entities:[],
          dialogue:{message_role:message.startsWith('لا ')?'CORRECTION':'ANSWER_TO_PENDING_QUESTION',evidence:message,invalidated_fields:message.startsWith('لا ')?['time']:[]}
        }
      };
    }
  });

  assert.equal(result.ok,true,JSON.stringify({checks:result.checks,turns:result.turns}));
  assert.equal(result.checks.independent_jobs,true);
  assert.equal(result.checks.service_retained,true);
  assert.equal(result.checks.side_question_price,true);
  assert.equal(result.checks.correction_scoped,true);
  assert.equal(result.turns[2].service_preserved,true);
  assert.match(result.turns[2].reply,/VIP.*100/);
  assert.equal(result.turns[2].pending_field,'location');
  assert.equal(result.turns[3].service_preserved,true);
  assert.equal(result.turns[3].time,'19:00');
  assert.equal(result.turns[3].queued[0].time,'18:00');
  assert.equal(result.external_side_effects,false);
});
