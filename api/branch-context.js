import { singleQueryValue } from './_request-query.js';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRest,
} from './_auth-core.js';
import { canUseAllBranches } from './_branch-scope.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const enc=value=>encodeURIComponent(String(value));

async function readData(response,code){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok)throw Object.assign(new Error(code),{status:Number(response.status||500)});
  return Array.isArray(payload)?payload:[];
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const token=accessTokenFromRequest(req);
  if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});
  try{
    const businessId=safeId(singleQueryValue(req,'business_id'));
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
    const membership=(Array.isArray(memberships)?memberships:[]).find(row=>row.business_id===businessId&&row.status==='active');
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});

    const allAllowed=canUseAllBranches(membership);
    const branches=await readData(await supabaseRest(
      `dabbir_business_branches?select=id,business_id,name,status,is_primary,timezone,address_text&business_id=eq.${enc(businessId)}&status=eq.active&order=is_primary.desc,created_at.asc`,
      token,
    ),'BRANCH_LOOKUP_FAILED');
    let allowed=branches;
    if(!allAllowed){
      const assignments=await readData(await supabaseRest(
        `dabbir_membership_branches?select=business_id,user_id,branch_id&business_id=eq.${enc(businessId)}&user_id=eq.${enc(user.id)}`,
        token,
      ),'BRANCH_ASSIGNMENTS_LOOKUP_FAILED');
      const ids=new Set(assignments.filter(row=>row.business_id===businessId&&row.user_id===user.id).map(row=>row.branch_id));
      allowed=branches.filter(row=>ids.has(row.id));
    }
    if(!allowed.length)return json(res,403,{ok:false,error:'BRANCH_ASSIGNMENT_REQUIRED'});
    return json(res,200,{
      ok:true,
      business_id:businessId,
      role:membership.role,
      all_allowed:allAllowed,
      branches:allowed,
      default_scope:allAllowed?'all':allowed.length===1?allowed[0].id:null,
      selection_required:!allAllowed&&allowed.length>1,
      truth:{state:'VERIFIED',source:'SERVER_RLS_BRANCH_ASSIGNMENTS'},
    });
  }catch(error){
    const status=Number(error?.status||500);
    return json(res,[400,401,403,404,409,502,503].includes(status)?status:500,{ok:false,error:String(error?.message||'BRANCH_CONTEXT_FAILED')});
  }
}
