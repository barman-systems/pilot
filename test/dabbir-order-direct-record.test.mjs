import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolveBranchScope,branchFilter} from '../api/_branch-scope.js';
const business='11111111-1111-4111-8111-111111111111',order='22222222-2222-4222-8222-222222222222',branch='33333333-3333-4333-8333-333333333333';
const source=fs.readFileSync(new URL('../api/owner-operations.js',import.meta.url),'utf8').replace(/import[\s\S]*?from '[^']+';\n/g,'').replace('export default async function handler','async function handler');
async function run({member=true,found=true,role='owner',assigned=true}={}){
 let result;const queries=[];const ctx=vm.createContext({URL,Date,Number,Set,encodeURIComponent,resolveBranchScope,branchFilter,accessTokenFromRequest:()=> 'qa',getVerifiedUser:async()=>({id:'qa-user'}),getBusinessMemberships:async()=>member?[{business_id:business,role}]:[],json:(res,status,body)=>result={status,body},supabaseRest:async(path,token)=>{assert.equal(token,'qa');queries.push(path);let rows=[];if(path.startsWith('dabbir_business_branches'))rows=[{id:branch,business_id:business}];if(path.startsWith('dabbir_membership_branches'))rows=assigned?[{business_id:business,branch_id:branch,user_id:'qa-user'}]:[];if(path.startsWith('dabbir_orders'))rows=found?[{id:order,business_id:business,branch_id:branch}]:[];return {ok:true,text:async()=>JSON.stringify(rows)}}});vm.runInContext(source,ctx);await ctx.handler({method:'GET',url:'/api/owner-operations?'+new URLSearchParams({business_id:business,order_id:order,branch_id:branch})},{});return {...result,queries};
}
test('order details query the exact order within its business and selected branch',async()=>{const r=await run();assert.equal(r.status,200);const q=r.queries.find(q=>q.startsWith('dabbir_orders'));assert.ok(q.includes('&id=eq.'+order));assert.ok(q.includes('&business_id=eq.'+business));assert.ok(q.includes('&branch_id=eq.'+branch));assert.ok(r.queries.find(q=>q.startsWith('dabbir_order_items')).includes('&order_id=eq.'+order))});
test('missing order returns 404 and does not load substitute items',async()=>{const r=await run({found:false});assert.equal(r.status,404);assert.equal(r.queries.some(q=>q.startsWith('dabbir_order_items')),false)});
test('nonmember cannot query an order',async()=>{const r=await run({member:false});assert.equal(r.status,403);assert.equal(r.queries.length,0)});
test('staff without branch assignment cannot query an order',async()=>{const r=await run({role:'employee',assigned:false});assert.equal(r.status,403);assert.equal(r.queries.some(q=>q.startsWith('dabbir_orders')),false)});
test('viewer receives details without order mutation permission',async()=>{const r=await run({role:'viewer'});assert.equal(r.status,200);assert.equal(r.body.can_operate,false)});
