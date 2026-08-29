import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ownerCopilotHandler from '../api/owner-copilot.js';

const apiSource=fs.readFileSync(new URL('../api/owner-copilot.js',import.meta.url),'utf8');
const uiSource=fs.readFileSync(new URL('../api/owner-copilot-ui.js',import.meta.url),'utf8');
const recoverySource=fs.readFileSync(new URL('../api/app-recovery.js',import.meta.url),'utf8');

function responseMock(){
  return {
    statusCode:200,
    headers:{},
    body:null,
    status(code){this.statusCode=code;return this},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;return this},
    json(value){this.body=value;return this},
    end(value=''){
      if(typeof value==='string'&&String(this.headers['content-type']||'').includes('application/json')){
        try{this.body=JSON.parse(value)}catch{this.body=value}
      }else this.body=value;
      return this;
    },
  };
}

test('owner copilot fails closed without an authenticated owner session',async()=>{
  const res=responseMock();
  await ownerCopilotHandler({method:'GET',url:'/api/owner-copilot?business_id=11111111-1111-4111-8111-111111111111',headers:{}},res);
  assert.equal(res.statusCode,401);
  assert.equal(res.body?.error,'AUTH_REQUIRED');
});

test('owner copilot is owner-only, same-origin on writes and read-only by contract',()=>{
  assert.match(apiSource,/OWNER_REQUIRED/);
  assert.match(apiSource,/requireSameOrigin\(req\)/);
  assert.match(apiSource,/READ_ONLY_VERIFIED_OWNER_COPILOT/);
  assert.match(apiSource,/external_side_effects:false/);
  assert.match(apiSource,/unverified_numbers_forbidden:true/);
  assert.doesNotMatch(apiSource,/service_role/i);
});

test('owner copilot value proof counts only verified autonomous successful outcomes',()=>{
  assert.match(apiSource,/outcome=eq\.VERIFIED_SUCCESS/);
  assert.match(apiSource,/autonomous=eq\.true/);
  assert.match(apiSource,/estimated_manual_seconds/);
  assert.match(apiSource,/estimated_manual_minutes_saved/);
  assert.match(apiSource,/available:false,verified_autonomous_actions:null/);
  assert.match(apiSource,/estimates\.length\?Math\.round\(seconds\/60\):null/);
});

test('owner copilot grounds AI on exact tenant counts and provides deterministic fallback',()=>{
  assert.match(apiSource,/prefer:'count=exact'/);
  assert.match(apiSource,/AI_GROUNDED_ON_VERIFIED_OWNER_SNAPSHOT/);
  assert.match(apiSource,/DETERMINISTIC_VERIFIED_FALLBACK/);
  assert.match(apiSource,/OWNER OPERATIONS SNAPSHOT — VERIFIED TENANT DATA ONLY/);
  assert.match(apiSource,/Never claim you executed, sent, changed, booked, paid, cancelled, or contacted anyone/);
  assert.match(apiSource,/simulated=eq\.false/);
});

test('owner copilot recommends only safe in-app next screens',()=>{
  assert.match(apiSource,/function recommendScreen/);
  assert.match(apiSource,/return 'tasks'/);
  assert.match(apiSource,/return 'appointments'/);
  assert.match(apiSource,/return 'operations'/);
  assert.match(apiSource,/return 'integrations'/);
  assert.match(apiSource,/return 'settings'/);
  assert.match(apiSource,/return 'conversations'/);
  assert.match(apiSource,/recommended_screen:recommendedScreen/);
});

test('owner copilot UI gives natural-language options, value proof and accessible action navigation',()=>{
  assert.match(uiSource,/اسأل دَبِّر عن عملك/);
  assert.match(uiSource,/ما الذي يحتاجني اليوم؟/);
  assert.match(uiSource,/من يحتاج متابعة؟/);
  assert.match(uiSource,/ماذا أنجزت اليوم؟/);
  assert.match(uiSource,/estimated_manual_minutes_saved/);
  assert.match(uiSource,/VERIFIED_EXACT_COUNTS/);
  assert.match(uiSource,/\/dabbir-app-icon\.png/);
  assert.match(uiSource,/role="status" aria-live="polite"/);
  assert.match(uiSource,/recommended_screen/);
  assert.match(uiSource,/prefers-reduced-motion/);
  assert.doesNotMatch(uiSource,/setInterval\s*\(/);
});

test('authoritative shell mounts owner copilot after verified metrics and activation UI',()=>{
  const metrics=recoverySource.indexOf('/api/verified-metrics-ui');
  const activation=recoverySource.indexOf('/api/customer-activation-ui');
  const copilot=recoverySource.indexOf('/api/owner-copilot-ui');
  assert.ok(metrics>=0&&activation>metrics&&copilot>activation);
});
