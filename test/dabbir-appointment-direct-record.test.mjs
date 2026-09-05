import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {resolveBranchScope,branchFilter} from '../api/_branch-scope.js';
const business='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',branch='33333333-3333-4333-8333-333333333333';
const source=fs.readFileSync(new URL('../api/appointment-management.js',import.meta.url),'utf8').replace(/import[\s\S]*?from '[^']+';\n/g,'').replace('export default async function handler','async function handler');
async function run({role='owner',permissions=[],found=true,member=true,method='GET',assigned=true}={}){
 const queries=[];let result;
 const ctx=vm.createContext({URLSearchParams,Date,Set,Number,console,encodeURIComponent,resolveBranchScope,branchFilter,
 singleQueryValue:(req,key)=>req.query[key],accessTokenFromRequest:()=> 'test-token',getVerifiedUser:async()=>({id:'test-user'}),getBusinessMemberships:async()=>member?[{business_id:business,role,permissions}]:[],requireSameOrigin:()=>true,readJsonBody:async()=>({business_id:business,appointment_id:id,action:'update',status:'requested',branch_id:branch}),json:(res,status,body)=>{result={status,body}},
 supabaseRest:async(path,token,options)=>{queries.push(path);assert.equal(token,'test-token');let rows=[];
 if(path.startsWith('dabbir_business_branches'))rows=[{id:branch,business_id:business}];
 else if(path.startsWith('dabbir_membership_branches'))rows=assigned?[{branch_id:branch,business_id:business,user_id:'test-user'}]:[];
 else if(path.startsWith('dabbir_appointments'))rows=found?[{id,business_id:business,branch_id:branch,status:'confirmed'}]:[];
 return {ok:true,text:async()=>JSON.stringify(rows)};
 }});
 vm.runInContext(source,ctx);await ctx.handler({method,query:{business_id:business,appointment_id:id,branch_id:branch}},{});return {...result,queries};
}
test('direct appointment fetch is constrained by business, entity and selected branch',async()=>{const r=await run();assert.equal(r.status,200);assert.equal(r.body.appointment.id,id);const query=r.queries.find(x=>x.startsWith('dabbir_appointments'));assert.ok(query.includes('business_id=eq.'+business));assert.ok(query.includes('&id=eq.'+id));assert.ok(query.includes('&branch_id=eq.'+branch))});
test('deleted or inaccessible record returns 404 without a substitute',async()=>{assert.equal((await run({found:false})).status,404)});
test('nonmember cannot query an appointment',async()=>{const r=await run({member:false});assert.equal(r.status,403);assert.equal(r.queries.length,0)});
test('viewer gets read-only detail and cannot mutate',async()=>{const read=await run({role:'viewer'});assert.equal(read.status,200);assert.equal(read.body.can_manage,false);const write=await run({role:'viewer',method:'POST'});assert.equal(write.status,403);assert.equal(write.queries.length,0)});
test('explicit grants cannot be expanded by a role default',async()=>{const r=await run({role:'employee',permissions:['view_business']});assert.equal(r.status,403);assert.equal(r.queries.length,0)});
test('unassigned staff cannot read another branch',async()=>{const r=await run({role:'employee',assigned:false});assert.equal(r.status,403);assert.equal(r.queries.some(x=>x.startsWith('dabbir_appointments')),false)});

test('direct appointment mutation preserves selected branch on lookup and write',async()=>{const r=await run({method:'POST'});assert.equal(r.status,200);const queries=r.queries.filter(x=>x.startsWith('dabbir_appointments'));assert.equal(queries.length,2);assert.ok(queries.every(q=>q.includes('&branch_id=eq.'+branch)))});
test('unassigned staff cannot write a selected branch',async()=>{const r=await run({role:'employee',assigned:false,method:'POST'});assert.equal(r.status,403);assert.equal(r.queries.some(x=>x.startsWith('dabbir_appointments')),false)});
