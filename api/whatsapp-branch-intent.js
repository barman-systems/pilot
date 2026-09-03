import { json, readJsonBody, requireSameOrigin, supabaseRest } from './_auth-core.js';
import { ownerContext } from './_whatsapp-embedded-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;

async function readRows(response,code){
  const text=await response.text();
  let rows=null;
  try{rows=text?JSON.parse(text):null}catch{rows=null}
  if(!response.ok)throw Object.assign(new Error(code),{status:Number(response.status||502)});
  return Array.isArray(rows)?rows:[];
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'SAME_ORIGIN_REQUIRED'});
  try{
    const body=await readJsonBody(req,4096);
    const businessId=safeId(body?.business_id);
    const branchRaw=String(body?.branch_id||'').trim();
    const branchId=branchRaw?safeId(branchRaw):null;
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    if(branchRaw&&!branchId)return json(res,400,{ok:false,error:'VALID_BRANCH_REQUIRED'});
    const owner=await ownerContext(req,businessId);

    if(!branchId){
      const response=await supabaseRest(
        `dabbir_whatsapp_branch_intents?business_id=eq.${encodeURIComponent(businessId)}&user_id=eq.${encodeURIComponent(owner.user.id)}`,
        owner.accessToken,{method:'DELETE',headers:{prefer:'return=minimal'}},
      );
      if(!response.ok)throw Object.assign(new Error('WHATSAPP_BRANCH_INTENT_CLEAR_FAILED'),{status:Number(response.status||502)});
      return json(res,200,{ok:true,cleared:true,business_id:businessId,branch_id:null});
    }

    const branches=await readRows(await supabaseRest(
      `dabbir_business_branches?select=id,business_id,status&id=eq.${encodeURIComponent(branchId)}&business_id=eq.${encodeURIComponent(businessId)}&status=eq.active&limit=1`,
      owner.accessToken,
    ),'WHATSAPP_BRANCH_INTENT_BRANCH_LOOKUP_FAILED');
    if(!branches[0]?.id)return json(res,404,{ok:false,error:'ACTIVE_BRANCH_NOT_FOUND'});

    const expiresAt=new Date(Date.now()+10*60*1000).toISOString();
    const response=await supabaseRest(
      'dabbir_whatsapp_branch_intents?on_conflict=business_id,user_id&select=business_id,user_id,branch_id,expires_at,updated_at',
      owner.accessToken,{
        method:'POST',
        headers:{prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({
          business_id:businessId,
          user_id:owner.user.id,
          branch_id:branchId,
          expires_at:expiresAt,
          updated_at:new Date().toISOString(),
        }),
      },
    );
    const rows=await readRows(response,'WHATSAPP_BRANCH_INTENT_STORE_FAILED');
    const stored=rows[0]||null;
    if(!stored||stored.business_id!==businessId||stored.branch_id!==branchId||stored.user_id!==owner.user.id){
      throw Object.assign(new Error('WHATSAPP_BRANCH_INTENT_STORE_UNVERIFIED'),{status:502});
    }
    return json(res,200,{ok:true,business_id:businessId,branch_id:branchId,expires_at:stored.expires_at,truth:{state:'VERIFIED_PERSISTED',source:'SUPABASE_RLS_RETURN_REPRESENTATION'}});
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413,429,502,503,504].includes(status)?status:500;
    return json(res,safe,{ok:false,error:String(error?.message||'WHATSAPP_BRANCH_INTENT_FAILED').slice(0,180)});
  }
}
