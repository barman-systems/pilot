import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RELEASE_STAGES, deriveReleaseState } from '../scripts/dabbir-release-state-machine.mjs';

const root = new URL('../', import.meta.url);
const architecture = JSON.parse(await readFile(new URL('config/dabbir-architecture-ownership.json', root), 'utf8'));
const workflow = await readFile(new URL('.github/workflows/dabbir-bar12-readiness.yml', root), 'utf8');

const sha='abc123';
const complete={
  expectedMainSha:sha,
  candidateBuild:{state:'PASS',source_commit:sha},
  exactShaTests:{state:'PASS',source_commit:sha},
  deployment:{state:'READY',source_commit:sha},
  journey:{verdict:'PASS',real_external_connection:true,real_inbound_message:true,approved_reply_verified:true},
  iphoneSafariAr:{verdict:'PASS'},
  iphoneSafariEn:{verdict:'PASS'},
};

test('release progresses only through the four BAR-30 stages',()=>{
  assert.deepEqual(RELEASE_STAGES,{
    BUILT:'built',
    EXACT_SHA_TESTED:'exact_SHA_tested',
    DEPLOYED:'deployed',
    PRODUCTION_JOURNEY_VERIFIED:'production_journey_verified',
  });
  assert.equal(deriveReleaseState(complete).stage,RELEASE_STAGES.PRODUCTION_JOURNEY_VERIFIED);
  assert.equal(deriveReleaseState(complete).ready,true);
});

test('exact SHA tests are mandatory after candidate build',()=>{
  const state=deriveReleaseState({...complete,exactShaTests:{state:'PASS',source_commit:'wrong'}});
  assert.equal(state.stage,RELEASE_STAGES.BUILT);
  assert.equal(state.ready,false);
  assert.equal(state.reason,'EXACT_SHA_TESTS_NOT_VERIFIED');
});

test('deployment must be READY on the same tested SHA',()=>{
  const state=deriveReleaseState({...complete,deployment:{state:'READY',source_commit:'wrong'}});
  assert.equal(state.stage,RELEASE_STAGES.EXACT_SHA_TESTED);
  assert.equal(state.reason,'EXACT_SHA_NOT_DEPLOYED_READY');
});

test('production journey requires real external proof plus both iPhone languages',()=>{
  const noExternal=deriveReleaseState({...complete,journey:{verdict:'PASS',real_external_connection:false,real_inbound_message:true,approved_reply_verified:true}});
  assert.equal(noExternal.stage,RELEASE_STAGES.DEPLOYED);
  const noArabic=deriveReleaseState({...complete,iphoneSafariAr:{verdict:'BLOCKED'}});
  assert.equal(noArabic.stage,RELEASE_STAGES.DEPLOYED);
  assert.equal(noArabic.ready,false);
});

test('architecture and workflow bind release truth to one deployed runtime authority without confusing docs-only repository HEAD',()=>{
  assert.equal(architecture.authorities.release_state_machine,'scripts/dabbir-release-state-machine.mjs');
  assert.equal(architecture.truth_rules.release_ready_requires_exact_tested_sha,true);
  assert.equal(architecture.truth_rules.release_ready_requires_exact_ready_deployment,true);
  assert.equal(architecture.truth_rules.release_ready_requires_real_production_journey,true);

  // Repository HEAD is retained as provenance, while the release state machine is
  // intentionally fed the authoritative deployed runtime SHA. A docs/CI-only
  // commit may advance main without changing the Production artifact.
  assert.match(workflow,/repository_main_sha:\$repository_sha/);
  assert.match(workflow,/expected_main_sha:\$runtime_sha/);
  assert.match(workflow,/candidate_build:\{state:"PASS",source_commit:\$runtime_sha/);
  assert.match(workflow,/exact_sha_tests:\{state:"PASS",source_commit:\$runtime_sha/);
  assert.match(workflow,/production_deployment:\{state:"READY",source_commit:\$runtime_sha/);

  // Runtime equivalence is never guessed: the same fail-closed Vercel classifier
  // determines whether HEAD must deploy and whether older journey evidence may be
  // reused for an unchanged runtime artifact.
  assert.match(workflow,/VERCEL_GIT_PREVIOUS_SHA="\$initial_sha"/);
  assert.match(workflow,/VERCEL_GIT_PREVIOUS_SHA="\$candidate_sha"/);
  assert.match(workflow,/bash vercel-ignore-if-unaffected\.sh/);
  assert.match(workflow,/git merge-base --is-ancestor "\$candidate_sha" "\$RUNTIME_SHA"/);
  assert.match(workflow,/AUTHORITATIVE_PRODUCTION_RUNTIME_MISMATCH/);

  // Importing the internal owner journey must never promote missing Meta evidence.
  assert.match(workflow,/real_external_connection:false/);
  assert.match(workflow,/real_inbound_message:false/);
  assert.match(workflow,/approved_reply_verified:false/);
  assert.match(workflow,/scripts\/dabbir-release-state-machine\.mjs/);
});
