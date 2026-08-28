import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const pages = {
  privacy: read('privacy.html'),
  terms: read('terms.html'),
  support: read('support.html'),
};
const vercel = JSON.parse(read('vercel.json'));

test('App Store public pages exist in Arabic and English', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /<html lang="ar" dir="rtl">/i, `${name} must default to Arabic RTL`);
    assert.match(html, /lang="en"/i, `${name} must contain an English section`);
    assert.match(html, /DABBIR \| دبّر/);
    assert.doesNotMatch(html, /support@bmalman\.com|Barman2013@icloud\.com/i, `${name} must not invent or expose an unverified support address`);
  }
});

test('public legal/support routes resolve to static pages', () => {
  const routes = new Map((vercel.routes || []).map(route => [route.src, route.dest]));
  assert.equal(routes.get('^/privacy/?$'), '/privacy.html');
  assert.equal(routes.get('^/terms/?$'), '/terms.html');
  assert.equal(routes.get('^/support/?$'), '/support.html');
});

test('iOS-facing pages disclose Apple subscription separation without external checkout CTA', () => {
  const combined = `${pages.terms}\n${pages.support}\n${pages.privacy}`;
  assert.match(combined, /Apple In-App Purchase/i);
  assert.match(combined, /does not automatically cancel an App Store subscription/i);
  assert.doesNotMatch(combined, /buy on web|subscribe on web|Stripe checkout|payment link/i);
});

test('privacy page describes product-scoped deletion and iOS no-tracking declaration', () => {
  assert.match(pages.privacy, /NSPrivacyTracking = false/);
  assert.match(pages.privacy, /shared authentication identity/i);
  assert.match(pages.privacy, /حذف حساب DABBIR/);
});
