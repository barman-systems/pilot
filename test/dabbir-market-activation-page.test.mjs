import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shell = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('login and signup remain available without the retired public demo', () => {
  assert.doesNotMatch(shell, /demoFirst|preSignupValue|href="\/try"/);
  const redirect = fs.readFileSync(new URL('../try.html', import.meta.url), 'utf8');
  assert.doesNotMatch(redirect, /demoForm|demoMessage|runDemo|fetch\(/);
  assert.ok(redirect.includes('http-equiv="refresh" content="0;url=/"'));
  assert.ok(redirect.includes("window.location.replace('/');"));
  assert.ok(redirect.includes('href="/"'));
  for (const id of ['authForm', 'authEmail', 'authPassword', 'loginTab', 'signupTab', 'authAr', 'authEn']) {
    assert.ok(shell.includes(`id="${id}"`));
  }
  assert.match(shell, /id="authGate" class="authWrap hidden"/);
  assert.match(shell, /applyLang\(\);boot\(\);/);
});

test('old demo paths resolve to the retirement handler while the root keeps its auth runtime', () => {
  for (const path of ['/try', '/try/']) {
    const route = vercel.routes.find(route => new RegExp(route.src).test(path));
    assert.equal(route?.dest, '/api/dabbir-market-preview');
  }
  for (const path of ['/try']) {
    assert.ok(vercel.rewrites.some(route => route.source === path && route.destination === '/api/dabbir-market-preview'));
  }
  assert.ok(vercel.routes.some(route => route.src === '^/$' && route.dest === '/api/app-safari-recovery'));
});
