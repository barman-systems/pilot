import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decideRollbackBaseline } from '../scripts/dabbir-release-guardian-baseline.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/dabbir-release-guardian.yml',import.meta.url),'utf8');

const failed={id:30,run_attempt:1,name:'DABBIR AI Full Customer Journey',head_sha:'new-sha',head_branch:'main',event:'push',status:'completed',conclusion:'failure'};
const greenBaseline={id:29,name:failed.name,head_sha:'old-sha',head_branch:'main',event:'push',status:'completed',conclusion:'success'};

test('guardian refuses rollback when the same workflow was already failing on the previous distinct main SHA',()=>{
  const result=decideRollbackBaseline({failedRun:failed,history:[failed,{...greenBaseline,conclusion:'failure'}]});
  assert.equal(result.eligible,false);
  assert.equal(result.confirmation_required,false);
  assert.equal(result.reason,'BASELINE_NOT_GREEN');
});

test('guardian requires a confirmation rerun after the first red-after-green result',()=>{
  const result=decideRollbackBaseline({failedRun:failed,history:[failed,greenBaseline]});
  assert.equal(result.eligible,false);
  assert.equal(result.confirmation_required,true);
  assert.equal(result.reason,'REPEAT_FAILURE_REQUIRED');
  assert.equal(result.failed_run_attempt,1);
  assert.equal(result.baseline_run_id,29);
});

test('guardian allows governed rollback only after the repeated attempt also fails',()=>{
  const repeated={...failed,run_attempt:2};
  const result=decideRollbackBaseline({failedRun:repeated,history:[repeated,greenBaseline]});
  assert.equal(result.eligible,true);
  assert.equal(result.confirmation_required,false);
  assert.equal(result.reason,'REPEATED_REGRESSION_AFTER_GREEN_BASELINE');
  assert.equal(result.failed_run_attempt,2);
  assert.equal(result.baseline_run_id,29);
});

test('guardian refuses destructive rollback when no distinct baseline exists',()=>{
  const result=decideRollbackBaseline({failedRun:failed,history:[failed]});
  assert.deepEqual(result,{eligible:false,confirmation_required:false,reason:'NO_DISTINCT_BASELINE',failed_run_attempt:1});
});

test('workflow grants actions write, reruns first failure, and gates revert on repeated proof',()=>{
  assert.match(workflow,/actions: write/);
  assert.match(workflow,/dabbir-release-guardian-baseline\.mjs/);
  assert.match(workflow,/steps\.baseline\.outputs\.confirmation_required == 'true'/);
  assert.match(workflow,/gh run rerun "\$FAILED_RUN_ID" --failed/);
  assert.match(workflow,/steps\.baseline\.outputs\.eligible == 'true'/);
  assert.match(workflow,/REPEAT_FAILURE_REQUIRED|BASELINE_FAILURE_SKIP_ROLLBACK/);
});
