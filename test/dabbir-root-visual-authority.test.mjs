import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const css=fs.readFileSync(new URL('public/dabbir-executive-calm.css',root),'utf8');
const helper=fs.readFileSync(new URL('api/_executive-calm-page.js',root),'utf8');
const safari=fs.readFileSync(new URL('api/app-safari-recovery.js',root),'utf8');
const booking=fs.readFileSync(new URL('api/car-wash-booking.js',root),'utf8');
const team=fs.readFileSync(new URL('api/team-page.js',root),'utf8');
const builder=fs.readFileSync(new URL('scripts/build-dabbir-ui-bundles.mjs',root),'utf8');
const vercel=JSON.parse(fs.readFileSync(new URL('vercel.json',root),'utf8'));

test('Executive Calm has one static first-paint token authority and no legacy neon accent',()=>{
  assert.match(css,/--ds-brand:#536dfe/);
  assert.match(css,/--accent:var\(--ds-brand\)!important/);
  assert.match(css,/--bg:var\(--ds-bg\)!important/);
  assert.doesNotMatch(css,/#d7ff5f/i);
  assert.match(helper,/dabbir-executive-calm\.css/);
  assert.match(helper,/content=\"#091421\"/);
});

test('app receives static design authority before auth boot without breaking Safari release headers',()=>{
  assert.match(safari,/applyExecutiveCalmPage\(canonical\)/);
  assert.match(safari,/x-dabbir-first-paint-authority/);
  assert.match(safari,/owner-first-inline-before-auth-boot-v2/);
  assert.match(safari,/x-dabbir-static-design-authority/);
  assert.match(safari,/executive-calm-static-before-auth-boot-v1/);
  assert.match(safari,/executiveCalmHeaders\(res\)/);
});

test('stable App Store public routes keep their contract while build output receives the shared design authority',()=>{
  for(const source of [booking,team]){
    assert.match(source,/applyExecutiveCalmPage/);
    assert.match(source,/executiveCalmHeaders/);
  }
  assert.match(builder,/brandStablePublicPages/);
  for(const page of ['privacy','terms','support']){
    assert.match(builder,new RegExp(`${page}\\.html`));
    const route=vercel.routes.find(item=>item.src===`^/${page}/?$`);
    assert.ok(route,`${page} stable route must remain present`);
    assert.equal(route.dest,`/${page}.html`);
  }
});
