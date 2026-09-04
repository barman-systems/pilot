import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const pathUrl=path=>new URL(path,root);
const read=path=>fs.readFileSync(pathUrl(path),'utf8');
const wrapper=read('test/run-ai-full-customer-journey-en.mjs');
const canonicalWorkflow=read('.github/workflows/dabbir-ai-customer-journey.yml');
const broker=read('supabase/functions/barman-qa-suite-runner/index.ts');
const deploymentClassifier=read('vercel-ignore-if-unaffected.sh');
const shell=read('index.html');

test('iPad WebKit journey runs inside the already-authorized canonical customer journey identity',()=>{
  assert.equal(fs.existsSync(pathUrl('.github/workflows/dabbir-ipad-webkit-production.yml')),false,'standalone privileged iPad workflow must be retired');
  assert.equal(fs.existsSync(pathUrl('test/run-ai-full-customer-journey-ipad.mjs')),false,'standalone iPad runner must be retired');
  assert.match(canonicalWorkflow,/run-ai-full-customer-journey-en\.mjs/);
  assert.match(canonicalWorkflow,/GITHUB_WORKFLOW_REF.*dabbir-ai-customer-journey\.yml@refs\/heads\/main/);
  assert.match(wrapper,/viewport: \{ width: 820, height: 1180 \}/);
  assert.match(wrapper,/isMobile:\\s\*true/);
  assert.match(wrapper,/hasTouch:\\s\*true/);
  assert.match(wrapper,/dabbir-ai-customer-journey-report-ipad\.json/);
  assert.match(wrapper,/25_mobile_webkit_owner_journey/);
  assert.match(wrapper,/label: 'IPAD_WEBKIT'/);
  assert.match(wrapper,/IPAD_WEBKIT_JOURNEY_PASS/);
});

test('iPad test follows the real 701-920px shell contract: menu button opens transformed sidebar before navigation',()=>{
  assert.match(shell,/@media\(max-width:920px\)\{[^}]*\.shell\{grid-template-columns:1fr\}\.side\{position:fixed;/);
  assert.match(shell,/\.side\.open\{transform:translateX\(0\)!important\}/);
  assert.match(shell,/\.mobileMenu\{display:block;/);
  assert.match(shell,/@media\(max-width:700px\)[\s\S]*?\.bottomNav\{position:fixed;display:grid;/);
  assert.match(wrapper,/#menuBtn:visible/);
  assert.match(wrapper,/#side\.open #nav \[data-screen=\"conversations\"\]:visible/);
  assert.match(wrapper,/#side\.open #nav \[data-screen=\"operations\"\]:visible/);
  assert.match(wrapper,/BROWSER_IPAD_MENU_FOR_CONVERSATIONS_MISSING/);
  assert.match(wrapper,/BROWSER_IPAD_MENU_FOR_OPERATIONS_MISSING/);
});

test('iPad sidebar targets must be truly inside the viewport and pointer-hit-testable before Playwright clicks',()=>{
  assert.match(wrapper,/DABBIR_IPAD_CONVERSATIONS_NAV_STATE/);
  assert.match(wrapper,/DABBIR_IPAD_OPERATIONS_NAV_STATE/);
  assert.match(wrapper,/inside_viewport:/);
  assert.match(wrapper,/centre_hits_target/);
  assert.match(wrapper,/pointer_events/);
  assert.match(wrapper,/width >= 40/);
  assert.match(wrapper,/height >= 40/);
  assert.equal((wrapper.match(/rect\.left >= 0/g)||[]).length,2);
  assert.equal((wrapper.match(/rect\.right <= window\.innerWidth/g)||[]).length,2);
  assert.equal((wrapper.match(/rect\.top >= 0/g)||[]).length,2);
  assert.equal((wrapper.match(/rect\.bottom <= window\.innerHeight/g)||[]).length,2);
  assert.doesNotMatch(wrapper,/style\.display\s*=\s*['\"](?:flex|block|grid)['\"]/);
  assert.doesNotMatch(wrapper,/dispatchEvent\(/);
});

test('each iPad sidebar navigation proves the responsive shell closes after a successful destination change',()=>{
  assert.match(wrapper,/DABBIR_IPAD_CONVERSATIONS_TRANSITION/);
  assert.match(wrapper,/conversationsTransition\.active && !conversationsTransition\.sidebar_open/);
  assert.match(wrapper,/DABBIR_IPAD_OPERATIONS_TRANSITION/);
  assert.match(wrapper,/operationsTransition\.active && !operationsTransition\.sidebar_open/);
  assert.match(wrapper,/menu-opened-responsive-sidebar/);
});

test('iPad responsive source transformation fails closed if the canonical navigation contract moves',()=>{
  assert.match(wrapper,/replaceSingleExact/);
  assert.match(wrapper,/replaceSingleRange/);
  assert.match(wrapper,/IPAD_WEBKIT_CONVERSATIONS_NAV_CONTRACT_CHANGED/);
  assert.match(wrapper,/IPAD_WEBKIT_OPERATIONS_NAV_CONTRACT_CHANGED/);
  assert.match(wrapper,/IPAD_WEBKIT_RESPONSIVE_NAV_REWRITE_FAILED/);
  assert.match(wrapper,/IPAD_WEBKIT_EVIDENCE_DETAIL_CONTRACT_CHANGED/);
});

test('canonical iPad journey remains fail closed and persists its PASS summary into uploaded canonical evidence',()=>{
  assert.match(wrapper,/\$\{label\}_REPORT_MISSING/);
  assert.match(wrapper,/\$\{label\}_JOURNEY_NOT_PASS/);
  assert.match(wrapper,/report\.verdict !== 'PASS'/);
  assert.match(wrapper,/mobileStep\?\.status !== 'PASS'/);
  assert.match(wrapper,/english\.report\.ipad_webkit/);
  assert.match(wrapper,/mobile_step_status: ipad\.mobileStep\.status/);
  assert.match(wrapper,/report_path: ipadReportPath/);
  assert.doesNotMatch(canonicalWorkflow,/continue-on-error:\s*true/);
});

test('Supabase QA broker authority is not widened for iPad',()=>{
  assert.match(
    broker,
    /workflowRefs:new Set\(\['barman-systems\/pilot\/\.github\/workflows\/dabbir-ai-customer-journey\.yml@refs\/heads\/main','barman-systems\/pilot\/\.github\/workflows\/dabbir-owner-away-production\.yml@refs\/heads\/main'\]\)/,
  );
  assert.doesNotMatch(broker,/dabbir-ipad-webkit-production\.yml@refs\/heads\/main/);
  assert.match(broker,/workflowRefs\.has\(String\(payload\.workflow_ref\|\|''\)\)/);
});

test('canonical iPad-bearing wrapper and its contract force an exact-SHA Production deployment',()=>{
  for(const path of [
    'test/run-ai-full-customer-journey-en.mjs',
    'test/dabbir-ipad-webkit-production-contract.test.mjs',
  ]){
    assert.ok(deploymentClassifier.includes(path),`${path} must be classified as exact-SHA Production-affecting`);
  }
  assert.doesNotMatch(deploymentClassifier,/\.github\/workflows\/dabbir-ipad-webkit-production\.yml/);
  assert.doesNotMatch(deploymentClassifier,/test\/run-ai-full-customer-journey-ipad\.mjs/);
});
