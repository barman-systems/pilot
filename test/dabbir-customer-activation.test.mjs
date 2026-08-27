import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const activationPath='api/customer-activation-ui.js';
const recoveryPath='api/app-recovery.js';
const activation=fs.readFileSync(activationPath,'utf8');
const recovery=fs.readFileSync(recoveryPath,'utf8');

test('customer activation center is mounted after the authoritative owner-first shell',()=>{
  const ownerFirst=recovery.indexOf('/api/dabbir-owner-first-ui');
  const metrics=recovery.indexOf('/api/verified-metrics-ui');
  const activationIndex=recovery.indexOf('/api/customer-activation-ui');
  assert.ok(ownerFirst>=0);
  assert.ok(metrics>ownerFirst);
  assert.ok(activationIndex>metrics);
});

test('activation readiness is based on verified business profile, WhatsApp and AI state',()=>{
  assert.match(activation,/\/api\/business-profile\?business_id=/);
  assert.match(activation,/\/api\/dabbir-whatsapp-status\?business_id=/);
  assert.match(activation,/workspace\?\.ai\?\.configured/);
  assert.match(activation,/about_business/);
  assert.match(activation,/business_hours/);
});

test('proof-of-value metrics fail closed unless exact database counts are present',()=>{
  assert.match(activation,/VERIFIED_EXACT_COUNTS/);
  assert.match(activation,/Number\.isSafeInteger/);
  assert.match(activation,/value==null\?t\.unverified:value/);
  assert.doesNotMatch(activation,/workspace\?\.customers\?\.length/);
  assert.doesNotMatch(activation,/workspace\?\.conversations\?\.length/);
});

test('customer activation does not add a continuous polling loop',()=>{
  assert.doesNotMatch(activation,/setInterval\s*\(/);
  assert.match(activation,/CACHE_MS=30000/);
});

test('activation UI and recovery shell parse as Node modules',()=>{
  for(const path of [activationPath,recoveryPath]){
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}: ${result.stderr||result.stdout}`);
  }
});
