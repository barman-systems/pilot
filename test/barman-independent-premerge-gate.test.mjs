import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REQUIRED_WORKFLOWS,
  STATUS_CONTEXT,
  TRUST_ROOT_AUTHORITY_ACTORS,
  isProtectedTrustPath,
  isTrustedTrustRootActor,
  requiredWorkflowEvidence,
  requirePromotionAttestation,
  validatePullRequestShape,
} from '../scripts/barman-independent-premerge-gate.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/barman-independent-premerge-gate.yml',import.meta.url),'utf8');
const candidateCi=fs.readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../scripts/barman-independent-premerge-gate.mjs',import.meta.url),'utf8');

const shaA='a'.repeat(40);
const shaB='b'.repeat(40);
function pr(overrides={}){
  return {
    number:755,
    draft:false,
    user:{login:'barmanai'},
    base:{ref:'main',sha:shaA,repo:{full_name:'barman-systems/pilot'}},
    head:{ref:'feature/test',sha:shaB,repo:{full_name:'barman-systems/pilot'}},
    ...overrides,
  };
}

test('pre-merge gate runs from trusted base and has only required OIDC/status permissions',()=>{
  assert.match(workflow,/pull_request_target:/);
  assert.match(workflow,/push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow,/workflow_dispatch:/);
  for(const token of ['contents: read','actions: read','pull-requests: read','statuses: write','id-token: write','persist-credentials: false']){
    assert.match(workflow,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  for(const token of ['contents: write','actions: write','pull-requests: write','secrets.']){
    assert.doesNotMatch(workflow,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(workflow,/pull_request\.base\.sha/);
  assert.doesNotMatch(workflow,/pull_request\.head\.sha/);
});

test('trusted gate exclusively owns the branch-protection required test context',()=>{
  assert.equal(STATUS_CONTEXT,'test');
  assert.deepEqual([...REQUIRED_WORKFLOWS],['DABBIR CI','DABBIR Security Gate']);
  assert.match(script,/\/statuses\/\$\{sha\}/);
  assert.match(script,/context:STATUS_CONTEXT/);
  assert.match(script,/state:'pending'/);
  assert.match(script,/state:'success'/);
  assert.match(script,/state:'failure'/);
  assert.match(script,/BARMAN_REQUIRED_TEST_PASS/);
  assert.match(candidateCi,/github\.event_name == 'pull_request' && 'candidate-ci'/);
  assert.doesNotMatch(candidateCi,/github\.event_name == 'pull_request' && 'test'/);
});

test('trusted identity is same-repository main and fail-closed for drafts or forks',()=>{
  const identity=validatePullRequestShape(pr(),'barman-systems/pilot');
  assert.equal(identity.number,755);
  assert.equal(identity.headSha,shaB);
  assert.equal(identity.baseSha,shaA);
  assert.equal(identity.headRef,'feature/test');
  assert.equal(identity.authorLogin,'barmanai');
  assert.throws(()=>validatePullRequestShape(pr({draft:true}),'barman-systems/pilot'),/PREMERGE_DRAFT_BLOCKED/);
  assert.throws(()=>validatePullRequestShape(pr({base:{ref:'dev',sha:shaA,repo:{full_name:'barman-systems/pilot'}}}),'barman-systems/pilot'),/PREMERGE_BASE_NOT_MAIN/);
  assert.throws(()=>validatePullRequestShape(pr({head:{ref:'feature/test',sha:shaB,repo:{full_name:'someone/fork'}}}),'barman-systems/pilot'),/PREMERGE_FORK_DENIED/);
  assert.throws(()=>validatePullRequestShape(pr({user:{login:''}}),'barman-systems/pilot'),/PREMERGE_IDENTITY_INCOMPLETE/);
});

test('trust-root changes use trusted actor authority without owner bottleneck',()=>{
  for(const path of [
    '.github/workflows/ci.yml',
    '.github/workflows/barman-independent-premerge-gate.yml',
    'scripts/barman-independent-premerge-gate.mjs',
    'scripts/barman-tool-agent.mjs',
    'api/barman-tool-agent-broker.js',
    'scripts/dabbir-required-pr-gates.mjs',
    'scripts/dabbir-security-gate.mjs',
  ]) assert.equal(isProtectedTrustPath(path),true,path);
  assert.equal(isProtectedTrustPath('api/ai-business-operator.js'),false);
  assert.deepEqual([...TRUST_ROOT_AUTHORITY_ACTORS],['barmanai']);
  assert.equal(isTrustedTrustRootActor(' BARMANAI '),true);
  assert.equal(isTrustedTrustRootActor('dependabot[bot]'),false);
  assert.doesNotMatch(script,/PREMERGE_TRUST_ROOT_CHANGE_REQUIRES_OWNER/);
  assert.match(script,/PREMERGE_TRUST_ROOT_ACTOR_DENIED/);
});

test('gate binds current base and exact head and closes main-movement races around attestation',()=>{
  assert.match(script,/\/compare\/\$\{baseSha\}\.\.\.\$\{headSha\}/);
  assert.match(script,/\/branches\/main/);
  assert.match(script,/behind_by/);
  assert.match(script,/PREMERGE_HEAD_BEHIND_BASE/);
  assert.match(script,/PREMERGE_HEAD_CHANGED_DURING_VERIFY/);
  assert.match(script,/PREMERGE_BASE_CHANGED_DURING_VERIFY/);
  assert.match(script,/PREMERGE_AUTHOR_CHANGED_DURING_VERIFY/);
  assert.match(script,/PREMERGE_CURRENT_MAIN_SHA_INVALID/);
  assert.match(script,/PREMERGE_MAIN_MOVED_\$\{clean\(stage\)/);
  for(const stage of ['BEFORE_ATTESTATION','BEFORE_SUCCESS_STATUS','AFTER_SUCCESS_STATUS']){
    assert.match(script,new RegExp(`stage:'${stage}'`));
  }
  const beforeAttest=script.indexOf("stage:'BEFORE_ATTESTATION'");
  const attest=script.indexOf('const attestation=await requirePromotionAttestation');
  const beforeSuccess=script.indexOf("stage:'BEFORE_SUCCESS_STATUS'");
  const success=script.indexOf("state:'success'",beforeSuccess);
  const afterSuccess=script.indexOf("stage:'AFTER_SUCCESS_STATUS'");
  assert.ok(beforeAttest>0&&beforeAttest<attest);
  assert.ok(attest<beforeSuccess&&beforeSuccess<success&&success<afterSuccess);
  assert.match(script,/main moved after attestation; re-run BARMAN required test/);
  assert.match(script,/main changed; update branch and re-run BARMAN required test/);
});

test('required workflow evidence is exact-head and names both required workflows',()=>{
  const passed=new Map([
    ['DABBIR CI',{id:11,conclusion:'success',head_sha:shaB,event:'pull_request',workflow_id:1}],
    ['DABBIR Security Gate',{id:12,conclusion:'success',head_sha:shaB,event:'pull_request',workflow_id:2}],
  ]);
  assert.deepEqual(requiredWorkflowEvidence(passed),[
    {name:'DABBIR CI',run_id:'11',conclusion:'success',head_sha:shaB,event:'pull_request',workflow_id:'1'},
    {name:'DABBIR Security Gate',run_id:'12',conclusion:'success',head_sha:shaB,event:'pull_request',workflow_id:'2'},
  ]);
});

test('promotion attestation is hard, OIDC-authenticated, exact-SHA and fail-closed',async()=>{
  assert.match(script,/barman-promotion-attestation-gate/);
  assert.doesNotMatch(script,/barman-promotion-attestation-shadow/);
  assert.match(script,/blocks_merge:true/);
  assert.match(script,/PREMERGE_ATTESTATION_REQUIRED/);

  await assert.rejects(
    requirePromotionAttestation({repository:'barman-systems/pilot',prNumber:755,headSha:shaB,baseSha:shaA,requiredWorkflows:[],env:{},fetchImpl:async()=>{throw new Error('unexpected')}}),
    /PREMERGE_ATTESTATION_OIDC_ENV_MISSING/,
  );

  let calls=0;
  const requiredWorkflows=[
    {name:'DABBIR CI',run_id:'11',conclusion:'success',head_sha:shaB},
    {name:'DABBIR Security Gate',{id:12,conclusion:'success',head_sha:shaB}],
  ];
  requiredWorkflows[1]={name:'DABBIR Security Gate',run_id:'12',conclusion:'success',head_sha:shaB};
  const result=await requirePromotionAttestation({
    repository:'barman-systems/pilot',prNumber:755,headSha:shaB,baseSha:shaA,requiredWorkflows,protectedPaths:['.github/workflows/ci.yml'],
    env:{ACTIONS_ID_TOKEN_REQUEST_URL:'https://oidc.example/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'req'},
    fetchImpl:async(url,options)=>{
      calls+=1;
      if(calls===1)return new Response(JSON.stringify({value:'signed-github-oidc'}),{status:200,headers:{'content-type':'application/json'}});
      assert.match(String(url),/barman-promotion-attestation-gate/);
      const body=JSON.parse(options.body);
      assert.equal(body.repository,'barman-systems/pilot');
      assert.equal(body.pr_number,755);
      assert.equal(body.head_sha,shaB);
      assert.equal(body.base_sha,shaA);
      assert.deepEqual(body.required_workflows,requiredWorkflows);
      return new Response(JSON.stringify({ok:true,state:'ATTESTED',enforcement:'HARD',blocks_merge:true,attestation:{head_sha:shaB}}),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  assert.equal(result.state,'ATTESTED');
  assert.equal(result.blocks_merge,true);
  assert.equal(calls,2);
});
