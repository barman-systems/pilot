import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const business='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222';
const source=fs.readFileSync(new URL('../api/activity-tasks.js',import.meta.url),'utf8').replace(/import[\s\S]*?from '[^']+';\n/g,'').replace('export default async function handler','async function handler');
async function run({role='owner',member=true,found=true,stock=true}={}){
 let result;const queries=[];
 const ctx=vm.createContext({Set,Number,JSON,singleQueryValue:(req,key)=>req.query[key],accessTokenFromRequest:()=> 'qa-token',getVerifiedUser:async()=>({id:'qa-user'}),getBusinessMemberships:async()=>member?[{business_id:business,role}]:[],json:(res,status,body)=>result={status,body},supabaseRest:async(path,token)=>{assert.equal(token,'qa-token');queries.push(path);const rows=path.startsWith('dabbir_businesses')?[{id:business,business_type:'store'}]:(found?[{id:product,status:'pending'}]:[]);return {ok:true,text:async()=>JSON.stringify(rows)}}});
 vm.runInContext(source,ctx);await ctx.handler({method:'GET',query:{business_id:business,task_id:product}},{});return {...result,queries};
}
test('task detail fetch is scoped by task and business instead of the loaded list',async()=>{const r=await run();assert.equal(r.status,200);const q=r.queries.find(q=>q.startsWith('dabbir_tasks'));assert.ok(q.includes('&id=eq.'+product));assert.ok(q.includes('&business_id=eq.'+business));assert.ok(q.endsWith('&limit=1'));assert.equal(r.body.tasks[0].id,product)});
test('missing task returns 404 without substituting another task',async()=>{assert.equal((await run({found:false})).status,404)});
test('nonmember cannot fetch task details',async()=>{const r=await run({member:false});assert.equal(r.status,403);assert.equal(r.queries.length,0)});
test('employee receives a read-only task',async()=>{const r=await run({role:'employee'});assert.equal(r.status,200);assert.equal(r.body.can_manage,false)});
