import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {dialogueHarness} from './fixtures/understanding/dialogue-harness.mjs';
import {ids} from './fixtures/understanding/cases.mjs';

// Failure observed in Production workflow 34432118238: an unrelated quote
// introduced a guessed vehicle and displaced the database's sole delivery mode.
for(const correction of [false,true])test('live continuity: unrelated entity evidence cannot override activity truth, correction='+correction,async()=>{
 const h=dialogueHarness({planner:body=>({intent:body==='شو خدماتكم'?'SERVICE_DISCOVERY':'BOOKING',action:'CLARIFY',confidence:.92,riskLevel:'MEDIUM',entities:body.includes('خارجي')?[
  {entity:'vehicle',value:'saloon',evidence:'خارجي',confidence:.98,correction},
  {entity:'delivery_mode',value:'MOBILE',evidence:'خارجي',confidence:.98,correction},
 ]:[]})});
 await h.turn('شو خدماتكم');await h.turn('أبا غسيل خارجي');
 assert.equal(h.state.goal,'BOOK_SERVICE');assert.equal(h.state.entities.service.value,ids.service);
 assert.equal(h.state.entities.vehicle,undefined);assert.equal(h.state.entities.delivery_mode.source,'DATABASE_FACT');
 assert.equal(h.state.clarification_entity,'vehicle');
 await h.turn('ستيشن');
 assert.equal(h.state.entities.vehicle.value,'station');assert.equal(h.state.entities.vehicle.source,'CUSTOMER_STATED');
 assert.equal(h.state.clarification_entity,'location');assert.equal(h.state.goal,'BOOK_SERVICE');
});

test('real PostgreSQL JSONB representation accepts bounded fallback metrics and canonical state retains attempts',async()=>{
 const names=['google-gemini','groq','cloudflare-workers-ai','vercel-ai-gateway'];
 const trace={provider:names[3],model:'provider/'.padEnd(160,'a'),attempts:names.map((provider,i)=>({provider,model:('model/'+i+'/').padEnd(160,'b'),status:i===3?200:429,latency_ms:2500})),latency_ms:10000,actual_cost_usd:.002,final_request_usage:{inputTokens:1900,outputTokens:350}};
 const h=dialogueHarness({extra:{operational_history:[{id:'80000000-0000-4000-8000-000000000001',business_id:ids.business,customer_id:ids.customer,branch_id:ids.branch,service_id:ids.service,status:'completed',simulated:false,starts_at:'2026-09-08T09:00:00Z'}]},planner:()=>({intent:'SUPPORT',action:'REPLY',confidence:.99,riskLevel:'LOW',entities:[],executionMetadata:trace})});
 await h.turn('نفس أمس');
 const metrics=h.decisions.at(-1);const db=new PGlite();
 try{
  const r=await db.query('select octet_length($1::jsonb::text) as bytes',[JSON.stringify(metrics)]);
  assert.ok(r.rows[0].bytes<=2048,`SEMANTIC_METRICS_INVALID: ${r.rows[0].bytes}`);
 }finally{await db.close();}
 assert.equal(metrics.details_in_canonical_state,true);assert.equal(metrics.provider_trace.fallback_used,true);
 assert.equal(metrics.goal,'BOOK_SERVICE');assert.equal(metrics.action,'CLARIFY');
 assert.equal(metrics.reference_resolution.source,'YESTERDAY');
 assert.equal(h.state.provider_trace.attempts.length,4);assert.equal(h.state.provider_trace.model.length,160);
 assert.equal(h.state.entities.service.value,ids.service);
});
