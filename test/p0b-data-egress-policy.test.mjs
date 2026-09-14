import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeSemanticText, sanitizeSemanticContext } from '../api/_dabbir-semantic-privacy.js';
import { computeDataEgressPolicyHash } from '../scripts/p0b-data-egress-policy-hash.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/security/data-egress-policy.v1.json', import.meta.url), 'utf8'));

const REQUIRED_CLASSES = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'SECRET',
  'PRODUCTION_CUSTOMER_DATA',
  'PRODUCTION_CREDENTIAL',
  'LEGAL_RESTRICTED',
];

test('P0-B draft is fail-closed and cannot activate before P0-A', () => {
  assert.equal(policy.state, 'NOT_ENFORCED');
  assert.equal(policy.activation.requires_p0_a_pass, true);
  assert.equal(policy.activation.gate, 'P0_A_PASS');
  assert.equal(policy.activation.runtime_binding_allowed, false);
  assert.equal(policy.default_action, 'DENY');
  assert.deepEqual(policy.data_classes, REQUIRED_CLASSES);
});

test('harness default policy allows only minimized engineering context and denies protected classes', () => {
  assert.deepEqual(policy.harness_default_allow, [
    'TASK_REQUIRED_SOURCE_CODE',
    'TESTS',
    'SANITIZED_FIXTURES',
    'PUBLIC_SCHEMAS',
    'NON_SECRET_CONFIG',
  ]);
  for (const required of ['SECRET', 'PRODUCTION_CUSTOMER_DATA', 'PRODUCTION_CREDENTIAL', 'LEGAL_RESTRICTED']) {
    assert.ok(policy.harness_default_deny.includes(required), `missing deny class ${required}`);
  }
  for (const required of ['.env', '.env.*', '**/*.pem', '**/*.key']) {
    assert.ok(policy.forbidden_path_globs.includes(required), `missing forbidden path ${required}`);
  }
});

test('provider evidence is explicitly unverified and cannot authorize egress', () => {
  assert.ok(policy.provider_evidence.length >= 2);
  for (const provider of policy.provider_evidence) {
    assert.equal(provider.training_policy, 'UNVERIFIED');
    assert.equal(provider.retention_policy, 'UNVERIFIED');
    assert.equal(provider.zdr_status, 'UNVERIFIED');
    assert.equal(provider.contractual_setting, 'UNVERIFIED');
    assert.equal(provider.verification_date, null);
    assert.equal(provider.egress_allowed, false);
  }
});

test('existing semantic sanitizer removes a synthetic secret canary before harness context', () => {
  const canary = 'CANARY_P0B_SECRET_VALUE_9f2c7a';
  const sanitizedText = sanitizeSemanticText(`api_key=${canary} Authorization: Bearer ${canary}`);
  assert.equal(sanitizedText.includes(canary), false);

  const sanitizedContext = sanitizeSemanticContext({
    safe: 'keep-me',
    refresh_token: canary,
    nested: { password: canary, value: 'ok' },
  });
  const serialized = JSON.stringify(sanitizedContext);
  assert.equal(serialized.includes(canary), false);
  assert.equal(sanitizedContext.safe, 'keep-me');
  assert.equal(sanitizedContext.nested.value, 'ok');
});

test('policy hash is deterministic and changes when policy content changes', () => {
  const first = computeDataEgressPolicyHash(policy);
  const second = computeDataEgressPolicyHash(JSON.parse(JSON.stringify(policy)));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, computeDataEgressPolicyHash({ ...policy, state: 'MUTATED_FOR_TEST' }));
  assert.equal(policy.run_binding_contract.field_name, 'data_egress_policy_hash');
});

test('draft does not create a second orchestrator or browser authority', () => {
  assert.equal(policy.authority.owner, 'BARMAN_POLICY');
  assert.equal(policy.authority.central_policy, true);
  assert.equal(policy.authority.creates_new_orchestrator, false);
  assert.equal(policy.authority.creates_new_browser_authority, false);
  assert.equal(policy.sanitization.sanitizer, 'api/_dabbir-semantic-privacy.js');
});
