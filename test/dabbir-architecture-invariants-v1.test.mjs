import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const ownership = JSON.parse(read('config/dabbir-architecture-ownership.json'));
const shell = read('api/app-recovery.js');
const index = read('index.html');
const serviceOperations = read('api/service-operations-ui.js');
const contextualNavigation = read('api/dabbir-contextual-navigation-ui.js');
const ownerFirst = read('api/dabbir-owner-first-ui.js');
const authStability = read('api/auth-session-stability-ui.js');
const whatsappStatus = read('api/dabbir-whatsapp-status.js');

function shellModules(source) {
  return [...source.matchAll(/<script src=\"(\/api\/[^\"]+)\"><\/script>/g)].map(match => match[1]);
}

function navBody(id) {
  return index.match(new RegExp(`<nav class=\"[^\"]*\" id=\"${id}\">([\\s\\S]*?)<\\/nav>`))?.[1] || '';
}

test('architecture contract is fail-closed and does not permit feature-owned primary navigation', () => {
  assert.equal(ownership.primary_navigation.feature_modules_may_add_primary_destinations, false);
  assert.equal(ownership.truth_rules.blocked_or_skipped_qa_is_pass, false);
  assert.equal(ownership.truth_rules.tenant_may_inherit_global_whatsapp_identity, false);
  assert.equal(ownership.truth_rules.meta_authorized_equals_operational_whatsapp, false);
});

test('desktop and mobile primary navigation are exactly the five owner destinations', () => {
  const expected = ownership.primary_navigation.desktop_and_mobile_destinations;
  assert.deepEqual(expected, ['dashboard', 'conversations', 'appointments', 'customers', 'more']);

  for (const body of [navBody('nav'), navBody('bottomNav')]) {
    const actual = [...body.matchAll(/data-screen=\"([^\"]+)\"/g)].map(match => match[1]);
    assert.deepEqual(actual, expected);
  }
});

test('service catalog cannot inject or mutate primary navigation', () => {
  assert.doesNotMatch(serviceOperations, /function\s+ensureNav\s*\(/);
  assert.doesNotMatch(serviceOperations, /dabbirServicesNav/);
  assert.doesNotMatch(serviceOperations, /\.dataset\.screen\s*=/);
  assert.doesNotMatch(serviceOperations, /querySelector\(['\"]#nav['\"]\)/);
  assert.match(contextualNavigation, /#screen-more \.moreGrid/);
  assert.match(contextualNavigation, /showScreen\('operations'\)/);
  assert.doesNotMatch(contextualNavigation, /dabbirServicesNav/);
});

test('shell UI module growth is frozen to the explicit allowlist', () => {
  const modules = shellModules(shell);
  const expected = [
    '/api/brand-ui',
    '/api/dabbir-whatsapp-embedded-ui',
    '/api/dabbir-whatsapp-connect-guard-ui',
    '/api/timezone-ui',
    '/api/auth/recovery-ui',
    '/api/chat-human-ui',
    '/api/translation-ui',
    '/api/owner-operations-ui',
    '/api/service-operations-ui',
    '/api/activity-profile-ui',
    '/api/owner-action-center-ui',
    '/api/dabbir-owner-away-ui',
    '/api/dabbir-owner-decision-memory-ui',
    '/api/business-profile-ui',
    '/api/dabbir-customer-number-ui',
    '/api/dabbir-billing-ui',
    '/api/platform-customers-ui',
    '/api/platform-customer-support-ui',
    '/api/platform-recovery-reconciliation-ui',
    '/api/dabbir-owner-first-ui',
    '/api/verified-metrics-ui',
    '/api/customer-activation-ui',
    '/api/owner-copilot-ui',
    '/api/dabbir-contextual-navigation-ui',
    '/api/auth-session-stability-ui'
  ];

  assert.deepEqual(modules, expected, 'new shell patch modules require an explicit architecture change');
  assert.equal(new Set(modules).size, modules.length, 'duplicate shell module injection detected');
  assert.ok(modules.length <= ownership.shell.maximum_injected_api_modules, 'shell module ceiling exceeded');
  assert.equal(modules.at(-1), ownership.shell.final_ui_authority);

  for (const retired of ownership.shell.retired_modules_forbidden) {
    assert.equal(modules.includes(retired), false, `retired presentation layer returned: ${retired}`);
  }
});

test('presentation authorities cannot depend on continuous polling', () => {
  for (const [name, source] of [
    ['owner-first', ownerFirst],
    ['contextual-navigation', contextualNavigation],
    ['auth-session-stability', authStability]
  ]) {
    assert.doesNotMatch(source, /setInterval\s*\(/, `${name} must be event/lifecycle driven`);
  }
});

test('tenant WhatsApp truth remains fail-closed and cannot inherit global identity', () => {
  assert.match(whatsappStatus, /TENANT_WHATSAPP_NOT_LINKED/);
  assert.match(whatsappStatus, /BUSINESS_CONTEXT_REQUIRED/);
  assert.match(whatsappStatus, /must never inherit a global\/server WhatsApp/i);
});
