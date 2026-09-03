const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ALL_BRANCHES='all';

export function branchId(value){
  const raw=String(value??'').trim();
  return UUID_RE.test(raw)?raw:null;
}

function permissionsOf(membership){
  return Array.isArray(membership?.permissions)?membership.permissions.map(String):[];
}

export function canUseAllBranches(membership){
  const role=String(membership?.role||'').toLowerCase();
  if(role==='owner'||role==='admin')return true;
  const permissions=permissionsOf(membership);
  return permissions.includes('manage_business')||permissions.includes('manage_team');
}

/**
 * Resolve branch scope on the server using RLS-scoped branch and assignment rows.
 * Owners/admins may use all branches or any active branch. Restricted staff may
 * only use branches explicitly assigned to their own membership.
 */
export async function resolveBranchScope({businessId,membership,userId,requestedBranch,fetchRows}){
  if(!branchId(businessId)||!membership||membership.business_id!==businessId){
    throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'),{status:403});
  }
  const requested=String(requestedBranch??'').trim().toLowerCase();
  const allAllowed=canUseAllBranches(membership);

  const branches=await fetchRows(
    `dabbir_business_branches?select=id,business_id,name,status,is_primary,timezone&business_id=eq.${encodeURIComponent(businessId)}&status=eq.active&order=is_primary.desc,created_at.asc`,
    'BRANCH_LOOKUP_FAILED',
  );
  const active=(Array.isArray(branches)?branches:[]).filter(row=>row?.business_id===businessId&&branchId(row?.id));
  if(!active.length)throw Object.assign(new Error('ACTIVE_BRANCH_REQUIRED'),{status:409});

  if(requested===ALL_BRANCHES){
    if(!allAllowed)throw Object.assign(new Error('ALL_BRANCHES_ACCESS_DENIED'),{status:403});
    return {mode:'all',branch_id:null,branch_ids:active.map(row=>row.id),branch:null,all_allowed:true};
  }

  const requestedId=branchId(requestedBranch);
  if(requestedBranch!=null&&String(requestedBranch).trim()&&!requestedId){
    throw Object.assign(new Error('INVALID_BRANCH_ID'),{status:400});
  }

  if(allAllowed){
    if(!requestedId)return {mode:'all',branch_id:null,branch_ids:active.map(row=>row.id),branch:null,all_allowed:true};
    const selected=active.find(row=>row.id===requestedId);
    if(!selected)throw Object.assign(new Error('BRANCH_NOT_FOUND'),{status:404});
    return {mode:'selected',branch_id:selected.id,branch_ids:[selected.id],branch:selected,all_allowed:true};
  }

  const assignments=await fetchRows(
    `dabbir_membership_branches?select=business_id,user_id,branch_id&business_id=eq.${encodeURIComponent(businessId)}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`,
    'BRANCH_ASSIGNMENTS_LOOKUP_FAILED',
  );
  const assignedIds=new Set((Array.isArray(assignments)?assignments:[]).filter(row=>row?.business_id===businessId&&row?.user_id===userId).map(row=>row.branch_id));
  const allowed=active.filter(row=>assignedIds.has(row.id));
  if(!allowed.length)throw Object.assign(new Error('BRANCH_ASSIGNMENT_REQUIRED'),{status:403});

  if(requestedId){
    const selected=active.find(row=>row.id===requestedId);
    if(!selected)throw Object.assign(new Error('BRANCH_NOT_FOUND'),{status:404});
    if(!assignedIds.has(requestedId))throw Object.assign(new Error('BRANCH_ACCESS_DENIED'),{status:403});
    return {mode:'selected',branch_id:selected.id,branch_ids:[selected.id],branch:selected,all_allowed:false};
  }

  if(allowed.length!==1){
    throw Object.assign(new Error('BRANCH_SELECTION_REQUIRED'),{status:409,branches:allowed.map(row=>row.id)});
  }
  return {mode:'selected',branch_id:allowed[0].id,branch_ids:[allowed[0].id],branch:allowed[0],all_allowed:false};
}

export function branchFilter(scope,column='branch_id'){
  if(!scope||scope.mode==='all')return '';
  const id=branchId(scope.branch_id);
  if(!id)throw Object.assign(new Error('BRANCH_SCOPE_INVALID'),{status:500});
  return `&${encodeURIComponent(column)}=eq.${encodeURIComponent(id)}`;
}

export function branchWrite(scope){
  if(!scope||scope.mode!=='selected'||!branchId(scope.branch_id)){
    throw Object.assign(new Error('SELECTED_BRANCH_REQUIRED'),{status:409});
  }
  return scope.branch_id;
}
