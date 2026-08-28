import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const ownership = JSON.parse(read('config/dabbir-architecture-ownership.json'));
const runtimeRegistry = JSON.parse(read('config/runtime-registry.json'));
const shell = read('api/app-recovery.js');
const index = read('index.html');
const ownerOperations = read('api/owner-operations-ui.js');
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

test('architecture contract is fail-closed and gives contextual navigation one authority', () => {
  assert.equal(ownership.primary_navigation.feature_modules_may_add_primary_destinations, false);
  assert.equal(ownership.primary_navigation.feature_modules_may_mutate_primary_destinations, false);
  assert.equal(ownership.authorities.primary_navigation_context_router, 'api/dabbir-contextual-navigation-ui.js');
  assert.equal(ownership.authorities.store_navigation_adaptation, 'api/dabbir-contextual-navigation-ui.js');
  assert.equal(ownership.authorities.auth_gate_visibility, 'index.html#showGate');
  assert.equal(ownership.authorities.auth_session_observer, 'api/auth-session-stability-ui.js');
  assert.deepEqual(ownership.temporary_exceptions, {});
  assert.equal(ownership.truth_rules.blocked_or_skipped_qa_is_pass, false);
  assert.equal(ownership.truth_rules.tenant_may_inherit_global_whatsapp_identity, false);
  assert.equal(ownership.truth_rules.meta_authorized_equals_operational_whatsapp, false);
  assert.equal(ownership.truth_rules.presentation_observer_may_veto_verified_gate, false);
});

test('desktop and mobile primary navigation are exactly the five owner destinations', () => {
  const expected = ownership.primary_navigation.desktop_and_mobile_destinations;
  assert.deepEqual(expected, ['dashboard', 'conversations', 'appointments', 'customers', 'more']);

  for (const body of [navBody('nav'), navBody('bottomNav')]) {
    const actual = [...body.matchAll(/data-screen=\"([^\"]+)\"/g)].map(match => match[1]);
    assert.deepEqual(actual, expected);
  }
});

test('feature modules cannot own primary navigation', () => {
  for (const source of [ownerOperations, serviceOperations]) {
    assert.doesNotMatch(source, /function\s+ensureNav\s*\(/);
    assert.doesNotMatch(source, /\.dataset\.screen\s*=/);
    assert.doesNotMatch(source, /querySelector\(['\"]#nav['\"]\)/);
  }
  assert.doesNotMatch(serviceOperations, /dabbirServicesNav/);
  assert.match(contextualNavigation, /data-dabbir-activity-slot/);
  assert.match(contextualNavigation, /setActivitySlot\(node,'operations'/);
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
  assert.equal(modules.at(-1), ownership.shell.last_loaded_ui_observer);

  for (const retired of ownership.shell.retired_modules_forbidden) {
    assert.equal(modules.includes(retired), false, `retired presentation layer returned: ${retired}`);
  }
});

test('presentation observers cannot veto verified gate visibility or depend on continuous polling', () => {
  assert.match(authStability, /gate_observer_only:true/);
  assert.doesNotMatch(authStability, /reconcileVerifiedGate/);

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

test('retired PILOT API aliases cannot return as competing runtime surfaces', () => {
  assert.equal(runtimeRegistry.authority, 'DABBIR');
  assert.equal(runtimeRegistry.runtime, 'api/dabbir-runtime.js');

  const retired = ownership.legacy_api.retired_aliases_forbidden;
  assert.deepEqual(retired, [
    '/api/pilot-runtime',
    '/api/pilot-ai',
    '/api/pilot-whatsapp-webhook'
  ]);

  for (const route of retired) {
    const legacyFile = `${route.slice(1)}.js`;
    assert.equal(fs.existsSync(new URL(legacyFile, root)), false, `retired legacy API returned: ${legacyFile}`);
    assert.match(ownership.legacy_api.canonical_replacements[route], /^\/api\/dabbir-/);
  }
});
