import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const workflow=readFileSync(resolve(here,'../.github/workflows/dabbir-ai-customer-journey.yml'),'utf8');

function must(pattern,message){assert.match(workflow,pattern,message)}
function mustNot(pattern,message){assert.doesNotMatch(workflow,pattern,message)}

test('trusted production journeys queue instead of cancelling each other',()=>{
  must(/group:\s*dabbir-ai-full-customer-journey/,'journeys must share one serialized production group');
  must(/cancel-in-progress:\s*false/,'a newer push must not cancel an in-flight trusted journey');
  mustNot(/cancel-in-progress:\s*true/,'mid-journey cancellation must not return');
});

test('capacity never runs automatically on push or schedule',()=>{
  const manualGate=/github\.event_name == 'workflow_dispatch'/g;
  assert.ok((workflow.match(manualGate)||[]).length>=2,'both capacity jobs must be workflow_dispatch-only');
  must(/inputs\.run_capacity == true/,'capacity requires an explicit manual boolean');
  must(/needs\.full-customer-journey\.result == 'success'/,'AI capacity requires a successful full journey');
  must(/needs\.ai-capacity\.result == 'success'/,'runtime capacity requires successful AI capacity');
  mustNot(/ai-capacity:[\s\S]*?if:\s*always\(\)/,'AI capacity must not run after a failed journey');
  mustNot(/runtime-capacity-1000:[\s\S]*?if:\s*always\(\)/,'runtime capacity must not run after a failed AI gate');
});

test('production capacity retains exact fail-closed acknowledgement',()=>{
  const ack='ALLOW_CAPACITY_LOAD_ON_PRODUCTION';
  assert.ok(workflow.includes(ack),'workflow must require the exact production acknowledgement');
  must(/PRODUCTION_CAPACITY_LOAD_ACK:\s*\$\{\{ inputs\.production_capacity_ack \}\}/,'the verified manual acknowledgement must reach the capacity safety guard');
});
