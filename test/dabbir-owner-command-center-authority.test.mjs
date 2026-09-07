import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {OWNER_NAVIGATION,renderOwnerCommandCenter} from '../api/owner-command-center.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('one renderer and authenticated gateway replace the complete numbered chain',()=>{
 assert.deepEqual(OWNER_NAVIGATION.map(row=>row[0]),['home','customers','operations','support','ceo','system']);
 assert.equal(fs.readdirSync(new URL('../api/',import.meta.url)).filter(n=>/^owner-command-center-v\d+\.js$/.test(n)).length,0);
 const gateway=read('api/owner-dashboard-gateway.js');assert.match(gateway,/renderOwnerCommandCenter/);assert.match(gateway,/verifyOwnerSession/);assert.doesNotMatch(gateway,/generated|injectOwner/);
 const pkg=JSON.parse(read('package.json'));assert.doesNotMatch(JSON.stringify(pkg.scripts),/build-owner-command-center-runtime/);
});
test('both languages render six screens with exactly one syntactically valid client bootstrap',()=>{
 for(const lang of ['ar','en']){
  const html=renderOwnerCommandCenter({authority_role:'ROOT_OWNER'},lang),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);new vm.Script(scripts[0][1]);assert.equal((html.match(/class="screen"/g)||[]).length,6);
  assert.match(html,new RegExp('lang="'+lang+'" dir="'+(lang==='ar'?'rtl':'ltr')+'"'));
  assert.equal((html.split('<script>')[0].match(/data-primary=/g)||[]).length,6);assert.doesNotMatch(html,/MutationObserver|setInterval|owner-command-center-v\d/);
 }
});
test('legacy numbered URLs redirect through a single compatibility route',()=>{
 const cfg=JSON.parse(read('vercel.json')),route=cfg.routes.find(r=>r.dest==='/api/owner-command-center');assert.ok(route);
 for(const version of [3,14,22,29])assert.ok(new RegExp(route.src).test('/api/owner-command-center-v'+version));
 assert.ok(cfg.routes.some(r=>r.src==='^/owner-dashboard/?$'&&r.dest==='/api/owner-dashboard-gateway'));
});
test('browser payload contains no session storage, privileged credential or tenant impersonation',()=>{
 const html=renderOwnerCommandCenter({authority_role:'ROOT_OWNER'});
 assert.doesNotMatch(html,/SUPABASE_SERVICE_ROLE_KEY|session_token|localStorage|document\.cookie|<iframe|api\/auth\/login/);
 assert.match(html,/api\/auth\/owner-logout/);assert.match(html,/AbortController/);assert.match(html,/generations/);
});
