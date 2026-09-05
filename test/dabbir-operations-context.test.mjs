import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../api/owner-operations-ui.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('  function syncScope(){'),source.indexOf('  function statusOptions'));
function harness(){const pending=[];const ctx=vm.createContext({workspace:{business:{id:'a'},branch_scope:{branch_id:'one'}},operationsScope:'',loadEpoch:0,recordEpoch:0,loading:false,data:null,businessId:null,productBusiness:null,isStore:()=>true,render(){},closeProductModal(){},request:(options,id)=>new Promise((resolve,reject)=>pending.push({id,resolve,reject}))});vm.runInContext(functions,ctx);return {ctx,pending};}
test('switching activity does not let an older operations response replace new data',async()=>{const {ctx,pending}=harness();const a=ctx.load();ctx.workspace.business.id='b';const b=ctx.load();assert.equal(pending.length,2);pending[1].resolve({business_id:'b'});await b;pending[0].resolve({business_id:'a'});await a;assert.equal(ctx.data.business_id,'b')});
test('an older request cannot release the new loading guard or expose its error',async()=>{const {ctx,pending}=harness();const a=ctx.load();ctx.workspace.branch_scope.branch_id='two';const b=ctx.load();pending[0].reject(Error('old branch'));await a;assert.equal(ctx.loading,true);assert.equal(ctx.data,null);pending[1].resolve({business_id:'a'});await b;assert.equal(ctx.loading,false)});
