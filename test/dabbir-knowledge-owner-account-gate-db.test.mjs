import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const base='supabase/migrations/20260908025920_dabbir_understanding_engine_v2.sql';
const correction='supabase/migrations/20260908040649_dabbir_knowledge_owner_account_gate_v2.sql';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uuid(1),otherOwner=uuid(2),manager=uuid(3);
const business=uuid(11),otherBusiness=uuid(12),service=uuid(21),otherService=uuid(22);
const proposalFunction='dabbir_knowledge_propose_v2',reviewFunction='dabbir_knowledge_review_v2';
let baselineBypass=false,baselineAcl;

async function installHelper(path,name){
  const source=await read(path);
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=source.match(new RegExp(`create or replace function ${escaped}\\([\\s\\S]*?\\n(?:\\$\\$|\\$function\\$);`,'i'));
  assert.ok(match,`missing canonical helper ${name}`);
  await db.exec(match[0]);
}
async function rpc(actor,name,args){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[actor]);
  await db.exec('set role authenticated');
  try{
    return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  }finally{await db.exec('reset role')}
}
const propose=(actor=owner,b=business,target=service)=>rpc(actor,proposalFunction,[b,null,null,'service','VIP',target]);
const review=(id,action='approve',actor=owner,b=business)=>rpc(actor,reviewFunction,[b,id,action]);
const counts=async()=> (await db.query(`select
  (select count(*) from public.dabbir_ai_knowledge_proposals) proposals,
  (select count(*) from public.dabbir_ai_understanding_events) events,
  (select count(*) from public.dabbir_business_knowledge) knowledge`)).rows[0];
const acl=async()=> (await db.query(`select p.proname,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('${proposalFunction}','${reviewFunction}') order by p.proname`)).rows;

before(async()=>{
  // Real predecessor and corrective migrations; only business records and the
  // underlying Auth claims/table shapes are disposable local fixtures.
  await db.exec(await read('test/fixtures/understanding/database.sql'));
  await db.exec(`alter table public.dabbir_memberships add column suspended_at timestamptz;
    alter table public.dabbir_memberships add column removed_at timestamptz;
    create table public.account_access_state(user_id uuid primary key,status text);`);
  await installHelper('supabase/migrations/20260828092000_dabbir_product_scoped_account_deletion_v1.sql','dabbir_private.account_active');
  await installHelper('supabase/migrations/20260828043000_dabbir_active_membership_rls_root_fix_v1.sql','dabbir_private.is_active_member');
  await db.exec(await read(base));
  await db.exec(`insert into auth.users(id) values('${owner}'),('${otherOwner}'),('${manager}');
    insert into public.dabbir_businesses(id) values('${business}'),('${otherBusiness}');
    insert into public.dabbir_memberships(business_id,user_id,role,status) values
      ('${business}','${owner}','owner','active'),('${otherBusiness}','${otherOwner}','owner','active'),
      ('${business}','${manager}','manager','active');
    insert into public.dabbir_services(id,business_id) values('${service}','${business}'),('${otherService}','${otherBusiness}');
    insert into public.account_access_state values('${owner}','suspended');`);
  const oldProposal=await propose();
  const oldApproval=await review(oldProposal.id);
  baselineBypass=oldProposal.status==='PROPOSED'&&oldApproval.active===true;
  baselineAcl=await acl();
  await db.exec(await read(correction));
});
beforeEach(async()=>{
  await db.exec(`reset role;
    delete from public.dabbir_ai_understanding_events;
    delete from public.dabbir_ai_knowledge_proposals;
    delete from public.dabbir_business_knowledge;
    delete from public.account_access_state;
    update public.dabbir_memberships set status='active',suspended_at=null,removed_at=null;`);
});
after(()=>db.close());

test('reproduces both suspended-account RPC bypasses before the corrective migration',()=>{
  assert.equal(baselineBypass,true);
});

test('active owner retains propose, approve, revoke and rollback with audit evidence',async()=>{
  const proposal=await propose();
  assert.equal(proposal.active,false);
  const approved=await review(proposal.id);
  assert.equal(approved.active,true);
  assert.equal((await review(proposal.id,'revoke')).active,false);
  const restored=await review(proposal.id,'rollback');
  assert.equal(restored.active,true);
  assert.ok(restored.version>approved.version);
  assert.deepEqual(await counts(),{proposals:1,events:4,knowledge:1});
});

const deniedActors=[
  ['suspended membership',"update public.dabbir_memberships set status='suspended' where user_id=$1"],
  ['removed membership',"update public.dabbir_memberships set status='removed' where user_id=$1"],
  ['suspended timestamp despite active status','update public.dabbir_memberships set suspended_at=now() where user_id=$1'],
  ['removed timestamp despite active status','update public.dabbir_memberships set removed_at=now() where user_id=$1'],
  ['globally suspended account',"insert into public.account_access_state values($1,'suspended')"],
  ['globally deleted account',"insert into public.account_access_state values($1,'deleted')"],
];
for(const [label,disable] of deniedActors){
  test(`${label}: both RPCs reject with no proposal, knowledge or audit side effects`,async()=>{
    const proposal=await propose();
    const before=await counts();
    await db.query(disable,[owner]);
    await assert.rejects(propose(),/OWNER_REQUIRED/);
    await assert.rejects(review(proposal.id),/OWNER_REQUIRED/);
    assert.deepEqual(await counts(),before);
    assert.equal((await db.query('select status from public.dabbir_ai_knowledge_proposals where id=$1',[proposal.id])).rows[0].status,'PROPOSED');
  });
}

test('active manager never gains owner approval authority',async()=>{
  const proposal=await propose();
  await assert.rejects(propose(manager),/OWNER_REQUIRED/);
  await assert.rejects(review(proposal.id,'approve',manager),/OWNER_REQUIRED/);
  assert.deepEqual(await counts(),{proposals:1,events:1,knowledge:0});
});

test('other-tenant owner cannot propose, review, or substitute a foreign target',async()=>{
  const proposal=await propose();
  await assert.rejects(propose(otherOwner),/OWNER_REQUIRED/);
  await assert.rejects(review(proposal.id,'approve',otherOwner),/OWNER_REQUIRED/);
  await assert.rejects(propose(owner,business,otherService),/KNOWLEDGE_TARGET_SCOPE_INVALID/);
  const foreign=await propose(otherOwner,otherBusiness,otherService);
  await assert.rejects(review(foreign.id),/KNOWLEDGE_PROPOSAL_NOT_FOUND/);
  assert.deepEqual(await counts(),{proposals:2,events:2,knowledge:0});
});

test('missing identity and anonymous role remain unable to call privileged actions',async()=>{
  const proposal=await propose();
  await assert.rejects(propose(''),/OWNER_REQUIRED/);
  await assert.rejects(review(proposal.id,'approve',''),/OWNER_REQUIRED/);
  await db.exec('set role anon');
  try{
    await assert.rejects(db.query('select public.dabbir_knowledge_propose_v2($1,null,null,\'service\',\'VIP\',$2)',[business,service]),/permission denied/);
    await assert.rejects(db.query('select public.dabbir_knowledge_review_v2($1,$2,\'approve\')',[business,proposal.id]),/permission denied/);
  }finally{await db.exec('reset role')}
});

test('correction is rerunnable without changing grants, search paths or existing evidence',async()=>{
  await propose();
  const before=await counts();
  await db.exec(await read(correction));
  assert.deepEqual(await counts(),before);
  assert.deepEqual(await acl(),baselineAcl);
  for(const row of await acl()){
    assert.equal(row.anon_execute,false);
    assert.equal(row.authenticated_execute,true);
    assert.equal(row.prosecdef,true);
  }
});
