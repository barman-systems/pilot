import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../api/dabbir-navigation-event-bridge-ui.js',import.meta.url),'utf8');
const activate=source.match(/function activate\(hit,source\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(activate);
const classes=()=>{const values=new Set();return {add:k=>values.add(k),remove:k=>values.delete(k),contains:k=>values.has(k)};};

function harness(){
  const side={classList:classes()},screen={classList:classes()};
  let finishRefresh,failRefresh;
  const refresh=new Promise((resolve,reject)=>{finishRefresh=resolve;failRefresh=reject;});
  const calls=[];
  const context=vm.createContext({window:{},workspace:{business:{id:'synthetic'}},performance:{now:()=>1},
    document:{querySelector:selector=>selector==='#side'?side:null},
    renderLoadedScreen:()=>{},paint:hit=>{hit.screen.classList.add('active');side.classList.remove('open');},
    afterPaint:callback=>callback(),refreshConversationWorkspace:()=>refresh,
    showScreen:name=>{calls.push(name);side.classList.remove('open');},safeFallback:()=>assert.fail('unexpected fallback')});
  vm.runInContext('let navigationEpoch=0;'+activate+';globalThis.activate=activate;',context);
  return {side,screen,calls,finishRefresh,failRefresh,activate:name=>context.activate({name,screen},'click')};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('a delayed conversation refresh cannot close a menu opened after navigation',async()=>{
  const h=harness();h.activate('conversations');h.side.classList.add('open');
  h.finishRefresh({ok:true});await tick();
  assert.deepEqual(h.calls,['conversations']);
  assert.equal(h.side.classList.contains('open'),true);
});

test('a delayed failed refresh also preserves the user-opened menu',async()=>{
  const h=harness();h.activate('conversations');h.side.classList.add('open');
  h.failRefresh(new Error('network'));await tick();
  assert.equal(h.side.classList.contains('open'),true);
});

test('a menu the user closed is not reopened by a delayed response',async()=>{
  const h=harness();h.activate('conversations');h.side.classList.add('open');h.side.classList.remove('open');
  h.finishRefresh({ok:true});await tick();assert.equal(h.side.classList.contains('open'),false);
});

test('newer navigation supersedes the old refresh and closes the menu normally',async()=>{
  const h=harness();h.activate('conversations');h.side.classList.add('open');h.activate('operations');
  h.finishRefresh({ok:true});await tick();
  assert.deepEqual(h.calls,['operations']);assert.equal(h.side.classList.contains('open'),false);
});
