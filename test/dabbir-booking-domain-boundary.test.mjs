import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const branchOperations=read('api/branch-operations.js');
const bookingDomain=read('api/_dabbir-booking-domain.js');

test('branch channel keeps actor and branch authorization while delegating booking mutation semantics',()=>{
  assert.match(branchOperations,/import \{ createRequestedBooking \} from '\.\/_dabbir-booking-domain\.js'/);
  assert.match(branchOperations,/resolveBranchScope/);
  assert.match(branchOperations,/branchWrite\(scope\)/);
  assert.match(branchOperations,/createRequestedBooking\(\{[\s\S]*token:ctx\.token,[\s\S]*businessId,[\s\S]*branchId,/);
  assert.match(branchOperations,/customerSource:'dabbir_branch_appointment_runtime'/);
  assert.doesNotMatch(branchOperations,/dabbir_appointments\?select=id,business_id,branch_id,customer_id/);
  assert.doesNotMatch(branchOperations,/status:'requested',[\s\S]*simulated:false/);
});

test('booking domain owns requested appointment persistence and persisted-scope verification',()=>{
  assert.match(bookingDomain,/export async function createRequestedBooking/);
  assert.match(bookingDomain,/dabbir_appointments\?select=id,business_id,branch_id,customer_id/);
  assert.match(bookingDomain,/status:'requested'/);
  assert.match(bookingDomain,/simulated:false/);
  assert.match(bookingDomain,/appointment\.business_id!==business\|\|appointment\.customer_id!==customer/);
  assert.match(bookingDomain,/explicitBranch&&appointment\.branch_id!==explicitBranch/);
  assert.match(bookingDomain,/APPOINTMENT_SCOPE_UNVERIFIED/);
  assert.match(bookingDomain,/APPOINTMENT_BRANCH_UNVERIFIED/);
});

test('booking domain does not own authentication, tenant membership, branch discovery or service-role authority',()=>{
  assert.doesNotMatch(bookingDomain,/getVerifiedUser/);
  assert.doesNotMatch(bookingDomain,/getBusinessMemberships/);
  assert.doesNotMatch(bookingDomain,/resolveBranchScope/);
  assert.doesNotMatch(bookingDomain,/accessTokenFromRequest/);
  assert.doesNotMatch(bookingDomain,/service_role/);
  assert.doesNotMatch(bookingDomain,/auth\.uid/);
});

test('booking domain preserves database integrity boundaries instead of bypassing them',()=>{
  assert.match(bookingDomain,/supabaseRest/);
  assert.doesNotMatch(bookingDomain,/SUPABASE_SERVICE_ROLE/);
  assert.doesNotMatch(bookingDomain,/confirmation_gate\s*:/);
  assert.doesNotMatch(bookingDomain,/owner_approval_status\s*:/);
  assert.doesNotMatch(bookingDomain,/SET LOCAL row_security/);
});
