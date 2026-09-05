import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decideRollbackBaseline } from '../scripts/dabbir-release-guardian-baseline.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/dabbir-release-guardian.yml',import.meta.url),'utf8');

const failed={id:30,name:'DABBIR AI Full Customer Journey',head_sha:'new-sha',head_branch:'main',event:'push',status:'completed',conclusion:'failure'};

test('guardian refuses rollback when the same workflow was already failing on the previous distinct main SHA',()=>{
  const result=decideRollbackBaseline({failedRun:failed,history:[failed,{id:29,name:failed.name,head_sha:'old-sha',head_branch:'main',event:'push',status:'completed',conclusion:'failure'}]});
  assert.equal(result.eligible,false);
  assert.equal(result.reason,'BASELINE_NOT_GREEN');
});

test('guardian allows governed rollback only for a new failure after a green baseline',()=>{
  const result=decideRollbackBaseline({failedRun:failed,history:[failed,{id:29,name:failed.name,head_sha:'old-sha',head_branch:'main',event:'push',status:'completed',conclusion:'success'}]});
  assert.equal(result.eligible,true);
  assert.equal(result.reason,'NEW_REGRESSION_AFTER_GREEN_BASELINE');
  assert.equal(result.baseline_run_id,29);
});

test('guardian refuses destructive rollback when no distinct baseline exists',()=>{
  const result=decideRollbackBaseline({failedRun:failed,history:[failed]});
  assert.deepEqual(result,{eligible:false,reason:'NO_DISTINCT_BASELINE'});
});

test('workflow grants actions read and gates revert step on proven baseline',()=>{
  assert.match(workflow,/actions: read/);
  assert.match(workflow,/dabbir-release-guardian-baseline\.mjs/);
  assert.match(workflow,/steps\.baseline\.outputs\.eligible == 'true'/);
  assert.match(workflow,/BASELINE_FAILURE_SKIP_ROLLBACK/);
});
