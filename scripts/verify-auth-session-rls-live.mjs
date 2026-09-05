import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium, webkit, devices } from 'playwright';

// Uses an isolated synthetic Auth user. No customer account is read or reset.
// No tokens, passwords, response bodies, screenshots, or traces are published.
const project = 'fphpoysqdsceniwduxjq';
const authOrigin = `https://${project}.supabase.co`;
const origins = ['https://dabbir.bmalman.com', 'https://dabbir-nd56cm4j5v-3619s-projects.vercel.app'];
const managementToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_TOKEN;
assert.ok(managementToken, 'بيانات إدارة Supabase غير متاحة للاختبار');
const mask = value => console.log(`::add-mask::${value}`);
mask(managementToken);
async function management(path, options = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${managementToken}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `تعذر طلب إدارة Supabase: HTTP ${response.status}`);
  return response.json();
}
const aclRows = await management('/database/query', { method: 'POST', body: JSON.stringify({ query: `
select n.nspname as schema,p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') as executable
from pg_policy pol
join pg_depend d on d.classid='pg_policy'::regclass and d.objid=pol.oid and d.refclassid='pg_proc'::regclass
join pg_proc p on p.oid=d.refobjid
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='dabbir_private'
and (0=any(pol.polroles) or (select oid from pg_roles where rolname='authenticated')=any(pol.polroles));` }) });
assert.ok(Array.isArray(aclRows) && aclRows.length > 0, 'لم تُقرأ صلاحيات دوال RLS');
assert.equal(aclRows.filter(row => !row.executable).length, 0, 'هناك دوال سياسة غير قابلة للتنفيذ للمستخدم');
console.log('نجح فحص صلاحيات جميع دوال RLS الخاصة المستدعاة للمستخدمين.');
const keys = await management('/api-keys?reveal=true');
const keyList = Array.isArray(keys) ? keys : keys.keys;
const adminKey = keyList?.find(key => key.name === 'service_role')?.api_key
  || keyList?.find(key => key.type === 'secret')?.api_key;
assert.ok(adminKey, 'مفتاح إنشاء حساب الاختبار غير متاح');
mask(adminKey);
async function admin(path, options = {}) {
  return fetch(`${authOrigin}${path}`, {
    ...options,
    headers: { apikey: adminKey, authorization: `Bearer ${adminKey}`, 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(30000),
  });
}
const password = `Qa!${randomBytes(24).toString('base64url')}9z`;
const email = `qa.auth.rls.${Date.now()}.${randomBytes(4).toString('hex')}@example.com`;
mask(password);
mask(email);
let userId;
try {
  const created = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { qa_fixture: 'auth-rls-session-20260905' } }) });
  assert.ok(created.ok, `تعذر إنشاء حساب اختبار معزول: HTTP ${created.status}`);
  const data = await created.json();
  userId = data.id || data.user?.id;
  assert.match(String(userId), /^[0-9a-f-]{36}$/i, 'معرف حساب الاختبار غير صالح');
  for (const [engine, device] of [[webkit, devices['iPhone 13']], [chromium, { viewport: { width: 1280, height: 900 } }]]) {
    const browser = await engine.launch();
    try {
      for (const origin of origins) {
        const context = await browser.newContext({ ...device, locale: 'ar-AE' });
        try {
          const page = await context.newPage();
          await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.locator('#authEmail').waitFor({ state: 'visible', timeout: 45000 });
          await page.locator('#authEmail').fill(email);
          await page.locator('#authPassword').fill(password);
          const loginPromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST', { timeout: 60000 });
          await page.locator('#authSubmit').click();
          const login = await loginPromise;
          assert.equal(login.status(), 200, 'فشل تسجيل الدخول عبر النموذج');
          assert.equal((await login.json()).ok, true, 'لم يقبل الخادم تسجيل الدخول');
          await page.locator('#onboardingGate:not(.hidden), #appShell:not(.hidden)').first().waitFor({ state: 'visible', timeout: 45000 });
          const session = await context.request.get(`${origin}/api/auth/session`);
          assert.equal(session.status(), 200, 'تعذر فحص الجلسة بعد الدخول');
          const sessionBody = await session.json();
          assert.equal(sessionBody.authenticated, true);
          assert.equal(sessionBody.user.id, userId);
          assert.deepEqual(sessionBody.memberships, [], 'حساب الاختبار لا يجوز أن يرى عضويات غيره');
          const cookies = (await context.cookies(origin)).filter(cookie => cookie.name.startsWith('__Host-dabbir_'));
          assert.equal(cookies.length, 2, 'كوكيز الجلسة غير مكتملة');
          for (const cookie of cookies) {
            assert.ok(cookie.secure && cookie.httpOnly && cookie.path === '/' && !cookie.domain.startsWith('.'), 'خصائص أمان الكوكي غير صحيحة');
          }
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.locator('#onboardingGate:not(.hidden), #appShell:not(.hidden)').first().waitFor({ state: 'visible', timeout: 45000 });
          const afterReload = await context.request.get(`${origin}/api/auth/session`);
          assert.equal(afterReload.status(), 200, 'فقدت الجلسة بعد تحديث الصفحة');
          assert.equal((await afterReload.json()).authenticated, true);
          const logout = await context.request.post(`${origin}/api/auth/logout`, { headers: { origin, 'x-dabbir-client': 'web' }, data: {} });
          assert.equal(logout.status(), 200, 'فشل تسجيل الخروج');
          const signedOut = await context.request.get(`${origin}/api/auth/session`);
          assert.equal(signedOut.status(), 401, 'الجلسة بقيت فعالة بعد الخروج');
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.locator('#authEmail').waitFor({ state: 'visible', timeout: 45000 });
          console.log(JSON.stringify({ browser: engine.name(), host: new URL(origin).host, login: 200, session: 200, reload: 200, logout: 200, signed_out: 401, cookie_security: true, tenant_isolation: true }));
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  if (userId) {
    const deleted = await admin(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    assert.ok(deleted.ok, `تعذر تنظيف حساب الاختبار: HTTP ${deleted.status}`);
    console.log('حُذف حساب الاختبار المؤقت بعد التحقق.');
  }
}
console.log('نجحت اختبارات الدخول وبقاء الجلسة والتحديث والخروج على محاكاة Safari وChromium للرابطين.');
