import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const candidate=JSON.parse(fs.readFileSync(new URL('../release/DABBIR_TEST_CANDIDATE.json',import.meta.url),'utf8'));

test('main cannot auto-deploy to Production while preview branches remain available',()=>{
  assert.equal(vercel?.git?.deploymentEnabled?.main,false);
  assert.notEqual(vercel?.git?.deploymentEnabled,false);
});

test('DABBIR release candidate is fail-closed until explicit owner approval',()=>{
  assert.equal(candidate.product,'DABBIR');
  assert.equal(candidate.channel,'preview');
  assert.equal(candidate.owner_approval.required,true);
  assert.equal(candidate.owner_approval.approved,false);
  assert.equal(candidate.production.automatic_git_deploy,false);
  assert.equal(candidate.production.promotion_allowed,false);
  assert.equal(candidate.status,'AWAITING_OWNER_APPROVAL');
});

test('release candidate must carry exact preview evidence before approval can be requested',()=>{
  assert.ok(Object.hasOwn(candidate,'candidate_sha'));
  assert.ok(Object.hasOwn(candidate,'preview_url'));
  assert.equal(candidate.owner_approval.approval_source,'explicit_owner_message_only');
});
