import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../api/app.js',import.meta.url),'utf8');
const wrapper=source.slice(source.indexOf('  const baseShowScreen=showScreen;'),source.indexOf('  window.__dabbirInterfacePerformance'));
test('fast rendering delegates navigation to canonical history instead of replacing it',()=>{
 const calls=[];const ctx=vm.createContext({workspace:{business:{business_type:'services'}},current:'dashboard',showScreen:name=>{calls.push(['canonical',name]);return 'result'},renderCurrentFast:()=>calls.push(['render']),applyFastBusinessProfile:()=>{},ensureConversationLoaded:()=>{}});
 vm.runInContext(wrapper,ctx);assert.equal(ctx.showScreen('appointments'),'result');assert.deepEqual(calls,[['render'],['canonical','appointments']]);
});
