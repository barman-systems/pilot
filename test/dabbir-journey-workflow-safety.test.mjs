import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const workflow=readFileSync(resolve(here,'../.github/workflows/dabbir-ai-customer-journey.yml'),'utf8');

function must(pattern,message){assert.match(workflow,pattern,message)}
function mustNot(pattern,message){assert.doesNotMatch(workflow,pattern,message)}

test('trusted production journeys serialize per exact SHA without cancelling cleanup',()=>{
  must(/group:\s*dabbir-ai-full-customer-journey-\$\{\{ github\.sha \}\}/,'journey concurrency must be scoped to the exact candidate SHA');
  must(/cancel-in-progress:\s*false/,'an in-flight exact-SHA journey must retain its finally cleanup path');
  mustNot(/group:\s*dabbir-ai-full-customer-journey\s*\n/,'a retired SHA must not block validation of a newer Production candidate');
  mustNot(/cancel-in-progress:\s*true/,'mid-journey cancellation must not strand disposable QA identities');
});

test('runtime dependency changes trigger the production customer journey',()=>{
  must(/- 'package\.json'/,'package.json changes must trigger the full production journey');
  must(/- 'package-lock\.json'/,'package-lock.json changes must trigger the full production journey');
});

test('every root and nested API runtime change triggers the production customer journey',()=>{
  must(/- 'api\/\*\*'/,'all DABBIR API runtime changes must trigger the full production journey');
  must(/- 'index\.html'/,'the authoritative shell must trigger the full production journey');
  must(/- 'team\.html'/,'team UI changes must trigger the full production journey');
});

test('capacity never runs automatically on push or schedule',()=>{
  const manualGate=/github\.event_name == 'workflow_dispatch'/g;
  assert.ok((workflow.match(manualGate)||[]).length>=2,'both capacity jobs must be workflow_dispatch-only');
  must(/inputs\.run_capacity == true/,'capacity requires an explicit manual boolean');
  must(/ai-capacity:\n    name:[^\n]*\n    needs: full-customer-journey\n    if: \$\{\{[^\n]*github\.event_name == 'workflow_dispatch'[^\n]*needs\.full-customer-journey\.result == 'success'[^\n]*needs\.full-customer-journey\.outputs\.production_ready == 'true'[^\n]*\}\}/,'AI capacity must require a successful public-production journey');
  must(/runtime-capacity-1000:\n    name:[^\n]*\n    needs: \[full-customer-journey, ai-capacity\]\n    if: \$\{\{[^\n]*github\.event_name == 'workflow_dispatch'[^\n]*needs\.ai-capacity\.result == 'success'[^\n]*needs\.full-customer-journey\.outputs\.production_ready == 'true'[^\n]*\}\}/,'runtime capacity must require both successful AI capacity and the explicit public-production-ready gate');
});

test('production capacity retains exact fail-closed acknowledgement',()=>{
  const ack='ALLOW_CAPACITY_LOAD_ON_PRODUCTION';
  assert.ok(workflow.includes(ack),'workflow must require the exact production acknowledgement');
  must(/PRODUCTION_CAPACITY_LOAD_ACK:\s*\$\{\{ inputs\.production_capacity_ack \}\}/,'the verified manual acknowledgement must reach the capacity safety guard');
});
