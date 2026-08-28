import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync(new URL('../api/app-recovery.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../api/dabbir-customer-journey-ui.js', import.meta.url), 'utf8');

test('authoritative shell loads customer journey simplification last', () => {
  assert.match(shell, /\/api\/dabbir-customer-journey-ui/);
  assert.ok(shell.indexOf('/api/dabbir-customer-journey-ui') > shell.indexOf('/api/owner-copilot-ui'));
});

test('daily navigation is simplified without deleting capabilities', () => {
  assert.match(ui, /dashboard:t\.today/);
  assert.match(ui, /tasks:t\.needsYou/);
  assert.match(ui, /settings:t\.more/);
  for (const screen of ['automations','analytics','integrations','notifications','help']) {
    assert.match(ui, new RegExp("'" + screen + "'"));
  }
  assert.match(ui, /journeyAdvancedNav/);
});

test('owner gets direct actions and one-step onboarding', () => {
  assert.match(ui, /إجراءات سريعة/);
  assert.match(ui, /محادثة جديدة/);
  assert.match(ui, /موعد جديد/);
  assert.match(ui, /ربط WhatsApp/);
  assert.match(ui, /جهّز نشاطك في خطوة واحدة/);
  assert.match(ui, /لن نطلب منك إعدادات طويلة الآن/);
});

test('advanced functions remain discoverable from More without DOM polling', () => {
  assert.match(ui, /ensureSettingsHub/);
  assert.match(ui, /add\(t\.customers,'customers'\)/);
  assert.match(ui, /add\(t\.analytics,'analytics'\)/);
  assert.match(ui, /add\(t\.integrations,'integrations'\)/);
  assert.match(ui, /add\(t\.automations,'automations'\)/);
  assert.match(ui, /add\(t\.notifications,'notifications'\)/);
  assert.match(ui, /add\(t\.help,'help'\)/);
  assert.doesNotMatch(ui, /setInterval\(/);
  assert.doesNotMatch(ui, /MutationObserver/);
});
