import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

for (const page of ['privacy.html', 'terms.html', 'support.html']) {
  test(`public/${page} is deployable`, () => {
    const html = read(`public/${page}`);
    assert.match(html, /<html lang="ar" dir="rtl">/i);
    assert.match(html, /lang="en"/i);
    assert.match(html, /DABBIR \| دبّر/);
    assert.doesNotMatch(html, /support@bmalman\.com|Barman2013@icloud\.com/i);
  });
}

test('public discovery and icon assets exist', () => {
  assert.ok(fs.statSync(path.join(root, 'public/robots.txt')).size > 0);
  assert.ok(fs.statSync(path.join(root, 'public/sitemap.xml')).size > 0);
  assert.ok(fs.statSync(path.join(root, 'public/favicon.png')).size > 0);
});

test('main HTML recovery handler applies security headers', () => {
  const source = read('api/app-recovery.js');
  for (const header of [
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'permissions-policy',
    'content-security-policy',
  ]) {
    assert.match(source, new RegExp(`['"]${header}['"]`));
  }
});

test('public auth onboarding explains password requirements and legal links', () => {
  const html = read('index.html');
  assert.match(html, /id="authHint"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/support"/);
  assert.match(html, /passwordHintSignup/);
  assert.match(html, /aria-selected/);
});

test('performance bundles are present and shell delivery is split by lifecycle', () => {
  const shell = read('api/app-recovery.js');
  const app = read('api/app.js');
  const vercel = JSON.parse(read('vercel.json'));
  const manifest = JSON.parse(read('config/dabbir-ui-bundles.json'));
  for (const bundle of ['critical', 'deferred']) {
    const bundlePath = path.join(root, `public/dabbir-ui-${bundle}.js`);
    assert.ok(fs.statSync(bundlePath).size > 0);
  }
  assert.equal(manifest.critical.length, 3);
  assert.equal(manifest.deferred.length, 23);
  assert.match(shell, /dabbir-ui-critical\.js/);
  assert.match(shell, /dabbir-ui-deferred\.js/);
  assert.match(shell, /__dabbirLoadDeferredUi/);
  assert.match(app, /public, max-age=0, s-maxage=600/);
  assert.ok(vercel.headers.some(rule => rule.source.includes('/dabbir-ui-') && rule.source.includes('critical')));
});
