import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateChangeSet, validateMigrationContent } from '../scripts/dabbir-production-db-change-gate.mjs';

const migrationPath = 'supabase/migrations/20260905191504_dabbir_restore_authenticated_rls_helper_execute_v1.sql';
const testPath = 'test/auth-session-rls-helper-acl.test.mjs';
const sql = readFileSync(new URL(`../${migrationPath}`, import.meta.url), 'utf8');
const liveTest = readFileSync(new URL('../scripts/verify-auth-session-rls-live.mjs', import.meta.url), 'utf8');
const helpers = [
  'account_active()',
  'branch_access_allowed(uuid,uuid)',
  'has_permission(uuid,text)',
  'is_active_member(uuid)',
  'salon_customer_scope(uuid,uuid,boolean)',
  'salon_member_scope(uuid,uuid,boolean)',
].map(signature => `dabbir_private.${signature}`).sort();

test('إصلاح الجلسة يمنح التنفيذ للدوال الست المحددة فقط وللمستخدم المسجل فقط', () => {
  const statements = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  const grants = [...statements.matchAll(/\bgrant\s+execute\s+on\s+function\s+([\w.]+\([^)]*\))\s+to\s+(\w+)\s*;/gi)];
  assert.equal(grants.length, 6);
  assert.deepEqual(grants.map(match => match[1].replace(/\s/g, '')).sort(), helpers);
  assert.ok(grants.every(match => match[2] === 'authenticated'));
  assert.equal((statements.match(/\bgrant\b/gi) || []).length, 6, 'يُمنع توسيع المنح خارج القائمة');
  assert.doesNotMatch(statements, /\bgrant\s+all\b|\bon\s+all\s+functions\b|\bto\s+(?:anon|public)\b/i);
});

test('الإصلاح لا يغير البيانات أو سياسات الصفوف أو أجسام الدوال ويحافظ على عزل الخادم', () => {
  const statements = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(statements, /\b(?:insert\s+into|update\s+\w|delete\s+from|truncate\s+|alter\s+table|drop\s+(?:table|policy|function)|create\s+(?:or\s+replace\s+)?(?:policy|function))\b/i);
  assert.match(sql, /if not has_function_privilege\('authenticated',signature,'EXECUTE'\)/);
  assert.match(sql, /if has_function_privilege\('anon',signature,'EXECUTE'\)/);
  assert.match(sql, /RLS_HELPER_ANONYMOUS_EXPOSURE/);
  assert.match(sql, /has_function_privilege\('authenticated','public\.dabbir_owner_session_verify_v1\(text\)','EXECUTE'\)/);
  assert.match(sql, /OWNER_SESSION_RPC_MUST_REMAIN_SERVER_ONLY/);
});

test('ملف الإصلاح يلتزم ببوابة تغيير قاعدة البيانات ويترك المعاملة للمشغل', () => {
  assert.deepEqual(validateMigrationContent(migrationPath, sql), []);
  assert.equal(evaluateChangeSet([migrationPath, testPath], {
    exists: file => file === migrationPath,
    readFile: file => { assert.equal(file, migrationPath); return sql; },
  }).ok, true);
});

test('التحقق الحي يشمل الدخول بالنموذج وبقاء الجلسة والخروج وتنظيف الحساب المؤقت', () => {
  for (const required of [
    'pg_policy', "has_function_privilege('authenticated',p.oid,'EXECUTE')",
    'https://dabbir.bmalman.com', 'https://dabbir-nd56cm4j5v-3619s-projects.vercel.app',
    "[webkit, devices['iPhone 13']]", '[chromium,',
    "page.locator('#authSubmit').click()", 'await page.reload(',
    'assert.equal(sessionBody.authenticated, true)',
    'assert.deepEqual(sessionBody.memberships, [])',
    'assert.equal(signedOut.status(), 401',
    'cookie.secure && cookie.httpOnly',
    '/auth/v1/admin/users/${encodeURIComponent(userId)}',
  ]) {
    // The membership assertion includes a descriptive second argument.
    const source = required === 'assert.deepEqual(sessionBody.memberships, [])'
      ? liveTest.replace(/assert\.deepEqual\(sessionBody\.memberships, \[\], [^\n]+\);/, 'assert.deepEqual(sessionBody.memberships, [])')
      : liveTest;
    assert.ok(source.includes(required), `التحقق الحي يفتقد: ${required}`);
  }
  assert.match(liveTest, /finally\s*\{\s*if\s*\(userId\)/);
  assert.match(liveTest, /method: 'DELETE'/);
  assert.match(liveTest, /assert\.ok\(deleted\.ok/);
});
