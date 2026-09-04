import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const css=fs.readFileSync(new URL('public/dabbir-executive-calm.css',root),'utf8');
const helper=fs.readFileSync(new URL('api/_executive-calm-page.js',root),'utf8');
const safari=fs.readFileSync(new URL('api/app-safari-recovery.js',root),'utf8');
const booking=fs.readFileSync(new URL('api/car-wash-booking.js',root),'utf8');
const team=fs.readFileSync(new URL('api/team-page.js',root),'utf8');
const privacy=fs.readFileSync(new URL('api/privacy-page.js',root),'utf8');
const terms=fs.readFileSync(new URL('api/terms-page.js',root),'utf8');
const support=fs.readFileSync(new URL('api/support-page.js',root),'utf8');
const vercel=JSON.parse(fs.readFileSync(new URL('vercel.json',root),'utf8'));

test('Executive Calm has one static first-paint token authority and no legacy neon accent',()=>{
  assert.match(css,/--ds-brand:#536dfe/);
  assert.match(css,/--accent:var\(--ds-brand\)!important/);
  assert.match(css,/--bg:var\(--ds-bg\)!important/);
  assert.doesNotMatch(css,/#d7ff5f/i);
  assert.match(helper,/dabbir-executive-calm\.css/);
  assert.match(helper,/content=\"#091421\"/);
});

test('app receives static design authority before auth boot instead of relying on JavaScript-only styling',()=>{
  assert.match(safari,/applyExecutiveCalmPage\(canonical\)/);
  assert.match(safari,/x-dabbir-first-paint-authority/);
  assert.match(safari,/executive-calm-static-before-auth-boot-v1/);
  assert.match(safari,/executiveCalmHeaders\(res\)/);
});

test('all public routes are served through the same design authority including direct html URLs',()=>{
  for(const source of [booking,team,privacy,terms,support]){
    assert.match(source,/applyExecutiveCalmPage/);
    assert.match(source,/executiveCalmHeaders/);
  }
  for(const page of ['privacy','terms','support']){
    const route=vercel.routes.find(item=>item.dest===`/api/${page}-page`);
    assert.ok(route,`${page} route must use branded handler`);
    assert.ok(route.src.includes('\\.html'),`${page} route must cover direct .html access`);
    assert.ok(vercel.rewrites.some(item=>item.source===`/${page}.html`&&item.destination===`/api/${page}-page`));
  }
});
