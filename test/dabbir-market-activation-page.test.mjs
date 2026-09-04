import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const landing = fs.readFileSync(new URL('../try.html', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('public activation page communicates vertical, outcome, approvals, evidence and price before signup', () => {
  for (const marker of [
    'لمشغلي غسيل السيارات المتنقل في الإمارات',
    'كل استفسار WhatsApp يصبح حجزًا مؤكدًا',
    '299 AED',
    '14 يومًا بلا بطاقة',
    'Shadow Mode',
    'Owner Receipt',
    'Estimated',
    'Verified',
    'SANDBOX — لا إرسال خارجي',
  ]) assert.match(landing, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const demoPosition = landing.indexOf('id="demoForm"');
  const signupPosition = landing.indexOf('ابدأ تجربة 14 يومًا');
  assert.ok(demoPosition >= 0 && signupPosition > demoPosition, 'signup CTA must appear after the value demo');
});

test('activation page calls the isolated same-origin demo endpoint and renders evidence', () => {
  assert.match(landing, /fetch\('\/api\/dabbir-market-demo'/);
  assert.match(landing, /credentials:'same-origin'/);
  assert.match(landing, /AbortSignal\.timeout\(10000\)/);
  assert.match(landing, /external_side_effects/);
  assert.match(landing, /الإيراد المثبت 0 AED/);
});

test('root login gate offers value before account while retaining the existing auth contract', () => {
  assert.match(shell, /href="\/try"/);
  assert.match(shell, /جرّب أولًا — بلا تسجيل/);
  assert.ok(shell.indexOf('id="demoFirstCta"') < shell.indexOf('id="authForm"'));
  assert.match(shell, /id="authGate" class="authWrap hidden"/);
  assert.match(shell, /applyLang\(\);boot\(\);/);
});

test('Vercel exposes the public try route without changing the protected root runtime route', () => {
  assert.ok(vercel.routes.some(route => route.src === '^/try/?$' && route.dest === '/try.html'));
  assert.ok(vercel.rewrites.some(route => route.source === '/try' && route.destination === '/try.html'));
  assert.ok(vercel.routes.some(route => route.src === '^/$' && route.dest === '/api/app-safari-recovery'));
});
