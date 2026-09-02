import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/dabbir-bar12-readiness.yml', import.meta.url), 'utf8');
const journey = fs.readFileSync(new URL('./ai-full-customer-journey-v2.mjs', import.meta.url), 'utf8');
const englishJourney = fs.readFileSync(new URL('./run-ai-full-customer-journey-en.mjs', import.meta.url), 'utf8');
const producer = fs.readFileSync(new URL('../.github/workflows/dabbir-ai-customer-journey.yml', import.meta.url), 'utf8');

test('BAR-12 reads the authoritative deployed runtime instead of assuming repository HEAD is deployed', () => {
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /\/api\/release-evidence/);
  assert.match(workflow, /VERCEL_GIT_PREVIOUS_SHA="\$initial_sha"/);
  assert.match(workflow, /bash vercel-ignore-if-unaffected\.sh/);
  assert.match(workflow, /expected_runtime_sha="\$initial_sha"/);
  assert.match(workflow, /expected_runtime_sha="\$GITHUB_SHA"/);
  assert.match(workflow, /AUTHORITATIVE_PRODUCTION_RUNTIME_MISMATCH/);
});

test('runtime-affecting HEAD waits for its exact Production SHA while docs-only HEAD keeps the prior runtime authority', () => {
  assert.match(workflow, /classification.*-eq 0[\s\S]*expected_runtime_sha="\$initial_sha"/);
  assert.match(workflow, /classification.*-eq 1[\s\S]*expected_runtime_sha="\$GITHUB_SHA"/);
  assert.match(workflow, /for attempt in \$\(seq 1 180\)/);
  assert.match(workflow, /final_sha.*expected_runtime_sha/);
});

test('BAR-12 imports only an exact or proven runtime-equivalent successful Full Customer Journey', () => {
  assert.match(workflow, /actions:\s*read/);
  assert.match(workflow, /dabbir-ai-customer-journey\.yml\/runs\?branch=main&status=success/);
  assert.match(workflow, /candidate_sha.*RUNTIME_SHA/);
  assert.match(workflow, /git merge-base --is-ancestor "\$candidate_sha" "\$RUNTIME_SHA"/);
  assert.match(workflow, /VERCEL_GIT_PREVIOUS_SHA="\$candidate_sha"/);
  assert.match(workflow, /journey_mode='exact_sha'/);
  assert.match(workflow, /journey_mode='runtime_equivalent'/);
  assert.match(workflow, /gh run download "\$journey_run"/);
  assert.match(producer, /name:\s*dabbir-ai-full-customer-journey-evidence/);
  assert.match(workflow, /--name dabbir-ai-full-customer-journey-evidence/);
  assert.doesNotMatch(workflow, /--name dabbir-ai-customer-journey-evidence/);
  assert.match(workflow, /FULL_JOURNEY_RUNTIME_EVIDENCE_PASS/);
});

test('Arabic and English iPhone evidence are tied to real WebKit journeys', () => {
  assert.match(journey, /locale:\s*'ar-AE'/);
  assert.match(englishJourney, /locale:\s*'en-US'/);
  assert.match(englishJourney, /ai-full-customer-journey-v2\.mjs/);
  assert.match(producer, /Run English iPhone WebKit owner journey against exact Production/);
  assert.match(producer, /dabbir-ai-customer-journey-report-en\.json/);
  assert.match(workflow, /25_mobile_webkit_owner_journey/);
  assert.match(workflow, /dabbir-ai-customer-journey-screenshot\.png/);
  assert.match(workflow, /dabbir-ai-customer-journey-report-en\.json/);
  assert.match(workflow, /iphone_safari_ar:\{verdict:"PASS"/);
  assert.match(workflow, /iphone_safari_en:\{verdict:"PASS"/);
  assert.doesNotMatch(workflow, /iphone_safari_en:null/);
});

test('BAR-12 preserves external WhatsApp fail-closed truth while importing internal journey evidence', () => {
  assert.match(workflow, /end_to_end_journey:\{verdict:"PASS"/);
  assert.match(workflow, /real_external_connection:false/);
  assert.match(workflow, /real_inbound_message:false/);
  assert.match(workflow, /approved_reply_verified:false/);
  assert.match(workflow, /external_scope:"UNVERIFIED"/);
  assert.doesNotMatch(workflow, /real_external_connection:true/);
  assert.doesNotMatch(workflow, /approved_reply_verified:true/);
});

test('repository HEAD, deployed runtime, and journey source remain separately evidenced', () => {
  assert.match(workflow, /repository_main_sha:\$repository_sha/);
  assert.match(workflow, /expected_main_sha:\$runtime_sha/);
  assert.match(workflow, /journey_source_commit:\$journey_source_sha/);
  assert.match(workflow, /evidence_mode:\$journey_evidence_mode/);
  assert.match(workflow, /head_runtime_affecting:\(\$head_runtime_affecting == "true"\)/);
  assert.match(workflow, /production_deployment:\{state:"READY",source_commit:\$runtime_sha/);
});