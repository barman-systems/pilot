import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('mobile owner operations route preserves native bearer and delegates to the tenant API', () => {
  const source = read('api/mobile/owner-operations.js');
  assert.match(source, /requireNativeBearer/);
  assert.match(source, /ownerOperationsHandler/);
  assert.match(source, /METHOD_NOT_ALLOWED/);
});

test('mobile owner copilot route is authenticated and POST-only', () => {
  const source = read('api/mobile/owner-copilot.js');
  assert.match(source, /requireNativeBearer/);
  assert.match(source, /ownerCopilotHandler/);
  assert.match(source, /allow: 'POST'/);
});

test('owner operations exposes tenant-scoped expense reads and writes', () => {
  const source = read('api/owner-operations.js');
  assert.match(source, /dabbir_expenses\?select=id,amount_aed,category,note,occurred_on,created_at&business_id=eq/);
  assert.match(source, /action==='create_expense'/);
  assert.match(source, /INVALID_EXPENSE_INPUT/);
  assert.match(source, /business_id:businessId,amount_aed/);
  assert.match(source, /limit=100/);
});

test('expense migration enforces tenant permissions and avoids anonymous access', () => {
  const source = read('db/dabbir_store_expenses_v1.sql');
  assert.match(source, /alter table public\.dabbir_expenses force row level security/);
  assert.match(source, /revoke all on public\.dabbir_expenses from anon/);
  assert.match(source, /has_permission\(business_id,'view_analytics'\)/);
  assert.match(source, /has_permission\(business_id,'manage_business'\)/);
  assert.match(source, /created_by = auth\.uid\(\)/);
});

test('native API exposes store operations and owner copilot without privileged client credentials', () => {
  const source = read('mobile/src/api.ts');
  assert.match(source, /\/api\/mobile\/owner-operations/);
  assert.match(source, /\/api\/mobile\/owner-copilot/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE/);
});

test('native product manager is bilingual and includes the core store surfaces', () => {
  const source = read('mobile/App.tsx');
  for (const token of ['إدارة المتجر', 'المساعد الذكي', 'تسجيل مصروف', 'Products & inventory', 'Smart assistant']) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /LanguageToggle/);
  assert.match(source, /StatusBar style="light"/);
});
