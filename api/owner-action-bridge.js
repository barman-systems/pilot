import { json, parseCookies, readJsonBody, requireSameOrigin } from './_auth-core.js';
import { singleQueryValue } from './_request-query.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://spohjzrsymsmzsseygtw.supabase.co').replace(/\/$/,'');
const BROKER_URL='https://spohjzrsymsmzsseygtw.supabase.co/functions/v1/bm-secret-broker';
const SESSION_COOKIE='__Host-dabbir_owner_session';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['set_inventory','set_product_active','cancel_pending_order']);
const safeId=v=>UUID_RE.test(String(v||'').trim())?String(v).trim():null;
const serviceKey=()=>{const k=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();return k&&!k.startsWith('sb_publishable_')?k:null};
async function verify(token){const r=await fetch(BROKER_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'owner_session_verify',session_token:token}),cache:'no-store'});const p=await r.json().catch(()=>null);return r.ok&&p?.authenticated===true&&p?.role==='platform_owner'}
async function service(path,key,opt={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opt,headers:{apikey:key,authorization:`Bearer ${key}`,accept:'application/json','content-type':'application/json',...(opt.headers||{})},cache:'no-store',signal:AbortSignal.timeout(10000)});const text=await r.text();let p=null;try{p=text?JSON.parse(text):null}catch{}if(!r.ok)throw Object.assign(new Error(String(p?.message||p?.error||'OWNER_ACTION_FAILED').slice(0,160)),{status:r.status});return p}
async function audit(businessId,key){const rows=await service(`dabbir_platform_owner_audit?select=id,business_id,action,entity_type,entity_id,reason,outcome,before_state,after_state,source,created_at&business_id=eq.${businessId}&order=created_at.desc&limit=50`,key);return Array.isArray(rows)?rows:[]}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  const token=parseCookies(req.headers.cookie||'')[SESSION_COOKIE];
  if(!token)return json(res,401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
  const key=serviceKey();if(!key)return json(res,503,{ok:false,error:'OWNER_ACTION_BRIDGE_NOT_CONFIGURED'});
  try{
    if(!(await verify(token)))return json(res,401,{ok:false,error:'OWNER_SESSION_INVALID'});
    if(req.method==='GET'){
      const businessId=safeId(singleQueryValue(req,'business_id'));
      if(!businessId)return json(res,400,{ok:false,error:'INVALID_BUSINESS_ID'});
      return json(res,200,{ok:true,business_id:businessId,mode:'platform_owner_audited_actions',actions:[...ACTIONS],audit:await audit(businessId,key)});
    }
    if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
    const body=await readJsonBody(req,8192);
    const businessId=safeId(body.business_id),entityId=safeId(body.entity_id),action=String(body.action||'').trim();
    const reason=String(body.reason||'').trim().slice(0,500),confirmation=String(body.confirmation||'').trim();
    if(!businessId||!entityId)return json(res,400,{ok:false,error:'INVALID_ID'});
    if(!ACTIONS.has(action))return json(res,400,{ok:false,error:'ACTION_NOT_ALLOWED'});
    if(reason.length<8)return json(res,400,{ok:false,error:'REASON_REQUIRED'});
    if(confirmation!=='EXECUTE')return json(res,400,{ok:false,error:'CONFIRMATION_REQUIRED'});
    const result=await service('rpc/dabbir_platform_owner_action_v1',key,{method:'POST',body:JSON.stringify({p_business_id:businessId,p_action:action,p_entity_id:entityId,p_reason:reason,p_confirmation:confirmation,p_payload:body.payload&&typeof body.payload==='object'?body.payload:{}})});
    return json(res,200,{ok:true,result,audit:await audit(businessId,key)});
  }catch(error){const status=Number(error?.status||500);return json(res,status>=400&&status<500?status:503,{ok:false,error:String(error?.message||'OWNER_ACTION_FAILED').slice(0,160)});}
}
