import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const business='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222';
const source=fs.readFileSync(new URL('../api/owner-product-management.js',import.meta.url),'utf8').replace(/import[\s\S]*?from '[^']+';\n/g,'').replace('export default async function handler','async function handler');
async function run({role='owner',member=true,found=true,stock=true}={}){
 let result;const queries=[];
 const ctx=vm.createContext({Set,Number,JSON,singleQueryValue:(req,key)=>req.query[key],accessTokenFromRequest:()=> 'qa-token',getVerifiedUser:async()=>({id:'qa-user'}),getBusinessMemberships:async()=>member?[{business_id:business,role}]:[],json:(res,status,body)=>result={status,body},supabaseRest:async(path,token)=>{assert.equal(token,'qa-token');queries.push(path);const rows=path.startsWith('dabbir_products')?(found?[{id:product,business_id:business,name:'QA'}]:[]):stock?[{quantity:7,reserved:2}]:[];return {ok:true,text:async()=>JSON.stringify(rows)}}});
 vm.runInContext(source,ctx);await ctx.handler({method:'GET',query:{business_id:business,product_id:product}},{});return {...result,queries};
}
test('product direct read uses exact identifiers and returns saved stock, not the current page',async()=>{const r=await run();assert.equal(r.status,200);assert.equal(r.body.product.quantity,7);assert.ok(r.queries.every(q=>q.includes('business_id=eq.'+business)));assert.ok(r.queries[0].includes('&id=eq.'+product));assert.ok(r.queries[1].includes('&product_id=eq.'+product));assert.equal(r.body.inventory_scope,'business')});
test('missing product is not replaced by another loaded product',async()=>{assert.equal((await run({found:false})).status,404)});
test('missing inventory is unavailable rather than zero',async()=>{const r=await run({stock:false});assert.equal(r.status,409);assert.equal(r.body.error,'INVENTORY_UNAVAILABLE')});
test('nonmembers cannot query product details',async()=>{const r=await run({member:false});assert.equal(r.status,403);assert.equal(r.queries.length,0)});
test('employee cannot open the owner product editor without business management grant',async()=>{const r=await run({role:'employee'});assert.equal(r.status,403);assert.equal(r.queries.length,0)});
