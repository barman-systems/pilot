import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('let navigationBusiness='),html.indexOf("$$('[data-screen]').forEach(b=>b.onclick"));
function harness(){
  const node=()=>({dataset:{},classList:{toggle(){},remove(){},add(){}},setAttribute(){},removeAttribute(){}});
  const screens=['dashboard','tasks','customers'].map(name=>Object.assign(node(),{id:'screen-'+name}));
  const nodes=Object.fromEntries(screens.map(n=>['#'+n.id,n]));
  for(const key of ['#pageTitle','#side','#menuBtn'])nodes[key]=node();
  const callbacks={},entries=[],frames=[];
  const context=vm.createContext({workspace:{business:{id:'a'}},current:'dashboard',window:{scrollY:120,scrollTo(x,y){context.window.scrollY=y},addEventListener(type,fn){callbacks[type]=fn}},history:{state:null,replaceState(s){this.state=s},pushState(s){this.state=s;entries.push(s)}},requestAnimationFrame:fn=>frames.push(fn),$:s=>nodes[s],$$:s=>s==='.screen'?screens:[],T:()=>({})});
  vm.runInContext(source,context);
  return {context,callbacks,entries,flush:()=>{while(frames.length)frames.shift()()},go:name=>{context.showScreen(name);while(frames.length)frames.shift()()}};
}
test('back and forward navigate without adding history entries',()=>{
  const h=harness();h.go('tasks');h.go('customers');assert.equal(h.entries.length,2);
  h.callbacks.popstate({state:h.entries[0]});assert.equal(h.context.current,'tasks');assert.equal(h.entries.length,2);
  h.callbacks.popstate({state:h.entries[1]});assert.equal(h.context.current,'customers');assert.equal(h.entries.length,2);
});
test('repeated renders and invalid destinations do not add history',()=>{
  const h=harness();h.go('tasks');h.go('tasks');h.go('missing');assert.equal(h.entries.length,1);assert.equal(h.context.current,'tasks');
});
test('history from another business cannot change the current screen',()=>{
  const h=harness();h.go('tasks');h.context.workspace.business.id='b';h.callbacks.popstate({state:h.entries[0]});assert.equal(h.entries.length,1);assert.equal(h.context.current,'tasks');
});

test('returning to a screen restores its previous page scroll',()=>{
  const h=harness();h.go('tasks');assert.equal(h.context.window.scrollY,0);h.context.window.scrollY=350;h.go('customers');assert.equal(h.context.window.scrollY,0);
  h.callbacks.popstate({state:h.entries[0]});h.flush();assert.equal(h.context.window.scrollY,350);
});


test('late runtime response cannot replace a newly selected business',async()=>{
  const pending=[],renders=[];
  const ctx=vm.createContext({URLSearchParams,workspace:null,selectedConversationId:null,api:()=>new Promise(resolve=>pending.push(resolve)),showGate(){},toast(){},T:()=>({}),renderAll(){renders.push(ctx.workspace.business.id)}});
  const start=html.indexOf('let runtimeRequestEpoch=');
  vm.runInContext(html.slice(start,html.indexOf('\n',html.indexOf('async function loadRuntime',start))),ctx);
  const first=ctx.loadRuntime('old'),second=ctx.loadRuntime('new');
  pending[1]({r:{ok:true,status:200},j:{ok:true,business:{id:'new'}}});await second;
  pending[0]({r:{ok:true,status:200},j:{ok:true,business:{id:'old'}}});await first;
  assert.equal(ctx.workspace.business.id,'new');assert.deepEqual(renders,['new']);
});
