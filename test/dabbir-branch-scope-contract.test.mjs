import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBranchScope,branchFilter,branchWrite } from '../api/_branch-scope.js';

const businessId='11111111-1111-4111-8111-111111111111';
const branchA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const branchB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId='22222222-2222-4222-8222-222222222222';
const activeBranches=[
  {id:branchA,business_id:businessId,name:'A',status:'active',is_primary:true},
  {id:branchB,business_id:businessId,name:'B',status:'active',is_primary:false},
];

function fetcher(assignments=[]){
  return async path=>path.startsWith('dabbir_business_branches?')?activeBranches:assignments;
}

test('owner defaults to all branches and may select a branch',async()=>{
  const membership={business_id:businessId,role:'owner',permissions:[]};
  const all=await resolveBranchScope({businessId,membership,userId,fetchRows:fetcher()});
  assert.equal(all.mode,'all');
  assert.deepEqual(all.branch_ids,[branchA,branchB]);
  const selected=await resolveBranchScope({businessId,membership,userId,requestedBranch:branchB,fetchRows:fetcher()});
  assert.equal(selected.mode,'selected');
  assert.equal(selected.branch_id,branchB);
  assert.equal(branchFilter(selected),'&branch_id=eq.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(branchWrite(selected),branchB);
});

test('restricted employee defaults to sole assigned branch',async()=>{
  const membership={business_id:businessId,role:'employee',permissions:[]};
  const assignments=[{business_id:businessId,user_id:userId,branch_id:branchA}];
  const scope=await resolveBranchScope({businessId,membership,userId,fetchRows:fetcher(assignments)});
  assert.equal(scope.mode,'selected');
  assert.equal(scope.branch_id,branchA);
});

test('restricted employee cannot request all branches or an unassigned branch',async()=>{
  const membership={business_id:businessId,role:'employee',permissions:[]};
  const assignments=[{business_id:businessId,user_id:userId,branch_id:branchA}];
  await assert.rejects(
    resolveBranchScope({businessId,membership,userId,requestedBranch:'all',fetchRows:fetcher(assignments)}),
    error=>error.message==='ALL_BRANCHES_ACCESS_DENIED'&&error.status===403,
  );
  await assert.rejects(
    resolveBranchScope({businessId,membership,userId,requestedBranch:branchB,fetchRows:fetcher(assignments)}),
    error=>error.message==='BRANCH_ACCESS_DENIED'&&error.status===403,
  );
});

test('multi-assigned restricted employee must choose a branch explicitly',async()=>{
  const membership={business_id:businessId,role:'employee',permissions:[]};
  const assignments=[
    {business_id:businessId,user_id:userId,branch_id:branchA},
    {business_id:businessId,user_id:userId,branch_id:branchB},
  ];
  await assert.rejects(
    resolveBranchScope({businessId,membership,userId,fetchRows:fetcher(assignments)}),
    error=>error.message==='BRANCH_SELECTION_REQUIRED'&&error.status===409,
  );
});

test('selected write is mandatory for branch-owned operational records',()=>{
  assert.throws(()=>branchWrite({mode:'all',branch_id:null}),/SELECTED_BRANCH_REQUIRED/);
});
