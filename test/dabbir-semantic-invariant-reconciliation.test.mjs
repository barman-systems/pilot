import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicSemanticInvariant,
  reconcileSemanticProposal,
  interpretSemanticMessage,
  evaluateSemanticProbe,
} from '../api/_dabbir-semantic-interpreter.js';

const entities=[
  {entity:'date',value:'2026-09-09',evidence:'بكره',confidence:.99,correction:false},
  {entity:'time',value:'09:00',evidence:'9 الصبح',confidence:.99,correction:false},
];
const base={action:'SERVICE_MENU',intent:'SERVICE_DISCOVERY',confidence:.91,risk_level:'LOW',service_name:null,knowledge_key:null,entities};
const response=proposal=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(proposal)},finish_reason:'stop'}]}),{status:200});

test('GCC availability plus grounded time is a deterministic booking invariant',()=>{
  const cases=['فاضين بكره 9 الصبح','متوفرين باجر الساعة 5 المسا','عندكم وقت غدا الساعة 10','في مجال بكره 9 الصبح'];
  for(const text of cases){
    const invariant=deterministicSemanticInvariant(text);
    assert.equal(invariant?.intent,'BOOKING',text);
    assert.equal(invariant?.action,'CHECK_AVAILABILITY',text);
    assert.ok(invariant.confidence>=.96,text);
  }
});

test('English availability plus time is reconciled the same way',()=>{
  const invariant=deterministicSemanticInvariant('Are you available tomorrow at 9 am?');
  assert.equal(invariant?.intent,'BOOKING');
  assert.equal(invariant?.action,'CHECK_AVAILABILITY');
});

test('quantity and mixed service-menu questions are not overclassified as booking',()=>{
  assert.equal(deterministicSemanticInvariant('فاضين 9 سيارات الصبح'),null);
  assert.equal(deterministicSemanticInvariant('شو خدماتكم بكره؟'),null);
  assert.equal(deterministicSemanticInvariant('فاضين بكره 9 وكم السعر؟'),null);
  assert.equal(deterministicSemanticInvariant('لا تحجز بكره 9 الصبح'),null);
});

test('valid but semantically wrong provider output is reconciled before policy',async()=>{
  const result=await interpretSemanticMessage({
    message:'فاضين بكره 9 الصبح',referenceTime:'2026-09-08T18:10:11Z',context:{},env:{GROQ_API_KEY:'test'},
    fetchImpl:async()=>response(base),
  });
  assert.equal(result.proposal.intent,'BOOKING');
  assert.equal(result.proposal.action,'CHECK_AVAILABILITY');
  assert.ok(result.proposal.confidence>=.96);
  assert.equal(result.proposal.riskLevel,'LOW');
  assert.equal(result.provider_alignment,false);
  assert.equal(result.reconciliation?.reason,'AVAILABILITY_BOOKING');
  const probe=evaluateSemanticProbe({...result.proposal,serviceName:null});
  assert.equal(probe.passed,true);
  assert.equal(probe.policy_action,'CLARIFY');
});

test('provider mutation proposal is reduced to read-only availability without lowering its risk label',()=>{
  const raw={...base,action:'CREATE_BOOKING',intent:'BOOKING',confidence:.99,risk_level:'MEDIUM'};
  const result=reconcileSemanticProposal(raw,'فاضين بكره 9 الصبح');
  assert.equal(result.proposal.action,'CHECK_AVAILABILITY');
  assert.equal(result.proposal.intent,'BOOKING');
  assert.equal(result.proposal.risk_level,'MEDIUM');
  assert.equal(result.reconciliation?.reason,'AVAILABILITY_BOOKING');
});

test('HIGH risk provider proposal is never downgraded by deterministic reconciliation',()=>{
  const raw={...base,action:'HANDOFF',intent:'HUMAN_ASSISTANCE',confidence:.99,risk_level:'HIGH'};
  const result=reconcileSemanticProposal(raw,'فاضين بكره 9 الصبح');
  assert.equal(result.reconciliation,null);
  assert.equal(result.proposal.action,'HANDOFF');
  assert.equal(result.proposal.risk_level,'HIGH');
});

test('explicit booking language is stabilized but still cannot create a booking directly',()=>{
  const invariant=deterministicSemanticInvariant('ابي احجز غسيل كامل');
  assert.equal(invariant?.intent,'BOOKING');
  assert.equal(invariant?.action,'CLARIFY');
  const raw={...base,action:'CREATE_BOOKING',intent:'BOOKING',confidence:.99,risk_level:'MEDIUM'};
  const result=reconcileSemanticProposal(raw,'ابي احجز غسيل كامل');
  assert.equal(result.proposal.action,'CLARIFY');
  assert.equal(result.proposal.risk_level,'MEDIUM');
});
