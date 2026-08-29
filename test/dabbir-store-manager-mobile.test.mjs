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


test('owner operations supports an itemized quick sale and stock receipt without trusting client totals', () => {
  const source = read('api/owner-operations.js');
  assert.match(source, /action==='complete_sale'/);
  assert.match(source, /dabbir_owner_complete_sale/);
  assert.match(source, /action==='receive_stock'/);
  assert.match(source, /dabbir_owner_receive_stock/);
  assert.match(source, /INVALID_SALE_INPUT/);
  assert.match(source, /INVALID_RECEIPT_INPUT/);
  assert.doesNotMatch(source, /p_total_aed/);
});

test('sales ledger migration itemizes sales, records movement reasons, and scopes access to the tenant', () => {
  const source = read('db/dabbir_store_sales_and_inventory_ledger_v1.sql');
  for (const token of ['dabbir_order_items', 'dabbir_inventory_movements', 'OPENING_BALANCE', 'SALE', 'RECEIPT', 'ADJUSTMENT', 'dabbir_owner_complete_sale', 'dabbir_owner_receive_stock']) assert.match(source, new RegExp(token));
  assert.match(source, /quantity_delta integer not null check\(quantity_delta <> 0\)/);
  assert.match(source, /line_total_aed numeric\(12,2\) not null/);
  assert.match(source, /force row level security/);
  assert.match(source, /revoke all on table public\.dabbir_order_items from public, anon/);
  assert.match(source, /revoke all on table public\.dabbir_inventory_movements from public, anon/);
  assert.match(source, /INSUFFICIENT_AVAILABLE_INVENTORY/);
  assert.match(source, /paid_aed=case when v_payment_method='credit' then 0 else v_total end/);
});

test('owner copilot grounds store answers in Dubai-day sales, collections, expenses, and low-stock facts', () => {
  const source = read('api/owner-copilot.js');
  for (const token of ['dabbir_products', 'dabbir_inventory', 'dabbir_orders', 'dabbir_expenses', 'sales_today_aed', 'cash_collected_today_aed', 'receivables_today_aed', 'low_stock_products']) assert.match(source, new RegExp(token));
  assert.match(source, /Never call sales minus expenses profit/);
  assert.match(source, /store_metrics_are_dubai_day_facts:true/);
});

test('native store manager exposes a reviewable quick-sale flow and auditable inventory movements', () => {
  const source = read('mobile/App.tsx');
  for (const token of ['بيع سريع', 'تسجيل بيع سريع', 'إتمام البيع', 'استلام +5', 'آخر حركات المخزون', 'paymentMethods', 'complete_sale', 'receive_stock']) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /بيع كمية غير متاحة/);
  assert.match(source, /تأكيد استلام المخزون/);
  assert.match(source, /البيع الآجل يسجل كمبلغ مستحق/);
});


test('mobile runtime accepts authenticated setup writes and the native client creates a store in store-first mode', () => {
  const runtimeSource = read('api/mobile/runtime.js');
  const clientSource = read('mobile/src/api.ts');
  const appSource = read('mobile/App.tsx');
  assert.match(runtimeSource, /\['GET', 'POST'\]/);
  assert.match(runtimeSource, /requireNativeBearer/);
  assert.match(clientSource, /createStore/);
  assert.match(clientSource, /action: 'create_business'/);
  assert.match(clientSource, /business_type: 'store'/);
  for (const token of ['StoreOnboarding', 'دبّر للمتاجر الصغيرة', 'ابدأ إدارة متجري']) assert.match(appSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});


test('native store UI validates operational inputs, uses Dubai-local dates, and supports product discovery', () => {
  const source = read('mobile/App.tsx');
  for (const token of ["timeZone: 'Asia/Dubai'", 'isValidDateKey', 'Number.isInteger(quantity)', 'ابحث بالاسم أو رمز المنتج', 'لا يوجد منتج مطابق للبحث', 'المبيعات والتحصيل والمصروفات حقائق تشغيلية مسجلة']) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('iOS configuration is iPhone-first and fails closed until an HTTPS API URL is configured', () => {
  const configSource = read('mobile/app.config.ts');
  const clientSource = read('mobile/src/api.ts');
  const envExample = read('mobile/.env.example');
  assert.match(configSource, /supportsTablet: false/);
  assert.match(clientSource, /DABBIR_API_BASE_URL_NOT_CONFIGURED/);
  assert.match(envExample, /EXPO_PUBLIC_DABBIR_API_BASE_URL=https:\/\/dabbir-nd56cm4j5v-3619s-projects\.vercel\.app/);
});
