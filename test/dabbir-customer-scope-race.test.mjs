import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../api/customer-crm-ui.js',import.meta.url),'utf8');
const setup=source.slice(source.indexOf('  let state='),source.indexOf('  function escapeHtml'));
const loader=source.slice(source.indexOf('  async function loadOperations'),source.indexOf('  function ordersFor'));
test('customer operations ignores a previous business response and preserves the new cache',async()=>{
 const pending=[];const ctx=vm.createContext({workspace:{business:{id:'first'},branch_scope:{branch_id:'one'}},q:()=>null,fetch:()=>new Promise(resolve=>pending.push(resolve))});
 vm.runInContext(setup+loader+';globalThis.run=loadOperations;globalThis.cache=()=>operationsCache;',ctx);
 const old=ctx.run();ctx.workspace={business:{id:'second'},branch_scope:{branch_id:'two'}};const fresh=ctx.run();
 pending[1]({ok:true,json:async()=>({ok:true,business_id:'second'})});await fresh;
 pending[0]({ok:true,json:async()=>({ok:true,business_id:'first'})});assert.equal(await old,null);assert.equal(ctx.cache().business_id,'second');
});
test('a branch change clears customer selection and pending details',()=>{
 const closed=[];const ctx=vm.createContext({workspace:{business:{id:'same'},branch_scope:{branch_id:'one'}},q:id=>({classList:{remove:()=>closed.push(id)}})});
 vm.runInContext(setup+`;syncScope();state.selected={id:'old'};workspace.branch_scope.branch_id='two';syncScope();globalThis.selected=state.selected;`,ctx);
 assert.equal(ctx.selected,null);assert.ok(closed.includes('#crmDetailModal'));assert.ok(closed.includes('#crmOrderModal'));
});
