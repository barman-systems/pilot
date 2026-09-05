import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityExperience } from '../api/_activity-experience.js';
const registry=createActivityExperience();
const workspace=(type,role='owner')=>({business:{id:'one',business_type:type,timezone:'Asia/Dubai'},membership:{role}});
for(const type of Object.keys(registry.profiles))for(const role of ['owner','admin','manager','employee','staff','agent','viewer']){
 test(type+' / '+role+' has a bounded, stable navigation model',()=>{for(const language of ['ar','en']){const m=registry.model(workspace(type,role),language);assert.ok(m.primary.length>=3&&m.primary.length<=5);assert.equal(new Set(m.primary).size,m.primary.length);assert.equal(m.owner,role==='owner');assert.ok(m.primary.every(m.allowed));if(type==='store')assert.equal(m.primary.includes('appointments'),false);assert.equal(m.allowed('nonexistent'),false)}});
}
test('explicit permissions and disabled activity capabilities are respected',()=>{const w=workspace('salon','employee');w.membership.permissions=['view_business'];assert.deepEqual(registry.model(w).primary,['dashboard','more']);w.membership.permissions=['view_business','view_appointments'];w.activity_navigation_capabilities={business_id:'one',show_appointments:false};assert.equal(registry.model(w).allowed('appointments'),false);w.activity_navigation_capabilities.business_id='another';assert.equal(registry.model(w).allowed('appointments'),true)});
test('unknown role gets no destinations',()=>assert.deepEqual(registry.model(workspace('store','unknown')).primary,[]));
test('today queue respects business timezone and excludes cancelled and simulated appointments',()=>{const w=workspace('salon');w.appointments=[{id:'today',starts_at:'2026-09-05T21:00:00Z',status:'confirmed'},{id:'old',starts_at:'2026-09-05T18:00:00Z',status:'confirmed'},{id:'cancel',starts_at:'2026-09-05T21:00:00Z',status:'cancelled'},{id:'fake',starts_at:'2026-09-05T21:00:00Z',simulated:true}];assert.deepEqual(registry.workRows(w,'en',Date.parse('2026-09-06T00:00:00Z')).map(x=>x.id),['today'])});
test('switching activity does not reuse the previous queue',()=>{const a=workspace('store');a.owner_action_center={items:[{type:'inventory',target:'operations',entity_id:'product'}]};assert.equal(registry.workRows(a).length,1);const b=workspace('creator');assert.deepEqual(registry.workRows(b),[])});
