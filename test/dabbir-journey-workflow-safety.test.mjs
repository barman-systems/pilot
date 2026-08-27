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

test('runtime dependency changes trigger the production customer journey',()=>{
  must(/- 'package\.json'/,'package.json changes must trigger the full production journey');
  must(/- 'package-lock\.json'/,'package-lock.json changes must trigger the full production journey');
});

test('capacity never runs automatically on push or schedule',()=>{
  const manualGate=/github\.event_name == 'workflow_dispatch'/g;
  assert.ok((workflow.match(manualGate)||[]).length>=2,'both capacity jobs must be workflow_dispatch-only');
  must(/inputs\.run_capacity == true/,'capacity requires an explicit manual boolean');
  must(/ai-capacity:\n    name:[^\n]*\n    needs: full-customer-journey\n    if: \$\{\{[^\n]*github\.event_name == 'workflow_dispatch'[^\n]*needs\.full-customer-journey\.result == 'success'[^\n]*\}\}/,'AI capacity job gate must be manual-only and require a successful journey');
  must(/runtime-capacity-1000:\n    name:[^\n]*\n    needs: ai-capacity\n    if: \$\{\{[^\n]*github\.event_name == 'workflow_dispatch'[^\n]*needs\.ai-capacity\.result == 'success'[^\n]*\}\}/,'runtime capacity job gate must be manual-only and require successful AI capacity');
});

test('production capacity retains exact fail-closed acknowledgement',()=>{
  const ack='ALLOW_CAPACITY_LOAD_ON_PRODUCTION';
  assert.ok(workflow.includes(ack),'workflow must require the exact production acknowledgement');
  must(/PRODUCTION_CAPACITY_LOAD_ACK:\s*\$\{\{ inputs\.production_capacity_ack \}\}/,'the verified manual acknowledgement must reach the capacity safety guard');
});
