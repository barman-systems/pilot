import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const landing = fs.readFileSync(new URL('../try.html', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const previewHandler = fs.readFileSync(new URL('../api/dabbir-market-preview.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('public activation page communicates business positioning, outcome, approvals, evidence and simulation limits before signup', () => {
  for (const marker of [
    'للأنشطة المختلفة — حسب احتياج نشاطك',
    'أعمال نشاطك تتقدم.',
    'بلا بطاقة',
    'مثال متخصص: حجز غسيل سيارات',
    'غسيل السيارات مثال واحد، وليس تعريف دبّر',
    'تحديد الصلاحيات',
    'ملخص التنفيذ',
    'قيمة الحجز التقديرية',
    'المبلغ المحصّل فعليًا',
    'تجربة بلا إرسال',
  ]) assert.match(landing, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(landing, /299 AED|14 يومًا|Shadow Mode|Owner Receipt/);
  const demoPosition = landing.indexOf('id="demoForm"');
  const signupPosition = landing.indexOf('أنشئ حساب نشاطك');
  assert.ok(demoPosition >= 0 && signupPosition > demoPosition, 'signup CTA must appear after the value demo');
});

test('activation page calls the isolated same-origin demo endpoint and renders evidence', () => {
  assert.match(landing, /fetch\('\/api\/dabbir-market-demo'/);
  assert.match(landing, /credentials:'same-origin'/);
  assert.match(landing, /AbortSignal\.timeout\(10000\)/);
  assert.match(landing, /external_side_effects/);
  assert.match(landing, /لم تُرسل رسالة واتساب ولم يُحصّل مبلغ/);
});

test('root login gate offers value before account while retaining the existing auth contract', () => {
  assert.match(shell, /href="\/try"/);
  assert.match(shell, /جرّب أولًا — بلا تسجيل/);
  assert.ok(shell.indexOf('id="demoFirstCta"') < shell.indexOf('id="authForm"'));
  assert.match(shell, /id="authGate" class="authWrap hidden"/);
  assert.match(shell, /applyLang\(\);boot\(\);/);
});

test('Vercel exposes the public try route without changing the protected root runtime route', () => {
  assert.ok(vercel.routes.some(route => route.src === '^/try/?$' && route.dest === '/api/dabbir-market-preview'));
  assert.ok(vercel.rewrites.some(route => route.source === '/try' && route.destination === '/api/dabbir-market-preview'));
  assert.equal(vercel.functions['api/dabbir-market-preview.js'].includeFiles, 'try.html');
  assert.match(previewHandler, /readFileSync\(new URL\('\.\.\/try\.html'/);
  assert.match(previewHandler, /x-dabbir-market-preview/);
  assert.ok(vercel.routes.some(route => route.src === '^/$' && route.dest === '/api/app-safari-recovery'));
});
