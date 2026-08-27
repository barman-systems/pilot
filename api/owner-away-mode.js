import { singleQueryValue } from './_request-query.js';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import { deriveOwnerAwayState } from './_owner-away-policy.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AWAY_MS=90*24*60*60*1000;

function safeId(value){
  const id=String(value||'').trim();
  return UUID_RE.test(id)?id:null;
}

function validTimezone(value){
  const timezone=String(value||'Asia/Dubai').trim().slice(0,64);
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(new Date());return timezone}catch{return null}
}

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=payload?.message||payload?.code||null;
    throw error;
  }
  return payload;
}

async function modeRow(token,businessId){
  const response=await supabaseRest(
    `dabbir_owner_modes?select=business_id,enabled,starts_at,ends_at,timezone,updated_by,created_at,updated_at&business_id=eq.${businessId}&limit=1`,
    token,
  );
  const rows=await readData(response,'OWNER_AWAY_LOOKUP_FAILED');
  return Array.isArray(rows)?rows[0]||null:null;
}

function membershipFor(memberships,businessId){
  return (memberships||[]).find(item=>item.business_id===businessId)||null;
}

export default async function handler(req,res){
  const token=accessTokenFromRequest(req);
  const user=await getVerifiedUser(token).catch(()=>null);
  if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  let memberships;
  try{memberships=await getBusinessMemberships(token)}
  catch{return json(res,503,{ok:false,error:'AUTH_VERIFICATION_UNAVAILABLE'})}

  if(req.method==='GET'){
    const businessId=safeId(singleQueryValue(req,'business_id'));
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const membership=membershipFor(memberships,businessId);
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    try{
      const row=await modeRow(token,businessId);
      return json(res,200,{ok:true,business_id:businessId,can_manage:membership.role==='owner',mode:deriveOwnerAwayState(row),configuration:row});
    }catch(error){
      const status=Number(error?.status||500);
      return json(res,status===404?404:503,{ok:false,error:'OWNER_AWAY_LOOKUP_FAILED'});
    }
  }

  if(req.method!=='PUT')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, PUT'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});

  try{
    const body=await readJsonBody(req);
    const businessId=safeId(body.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_REQUIRED'});
    const membership=membershipFor(memberships,businessId);
    if(!membership)return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});
    if(membership.role!=='owner')return json(res,403,{ok:false,error:'OWNER_REQUIRED'});

    const enabled=body.enabled===true;
    const timezone=validTimezone(body.timezone||'Asia/Dubai');
    if(!timezone)return json(res,400,{ok:false,error:'INVALID_TIMEZONE'});

    let startsAt=null;
    let endsAt=null;
    if(enabled){
      const startsMs=body.starts_at?Date.parse(body.starts_at):Date.now();
      const endsMs=body.ends_at?Date.parse(body.ends_at):NaN;
      if(!Number.isFinite(startsMs)||!Number.isFinite(endsMs)||endsMs<=startsMs){
        return json(res,400,{ok:false,error:'INVALID_AWAY_WINDOW'});
      }
      if(endsMs-startsMs>MAX_AWAY_MS)return json(res,400,{ok:false,error:'AWAY_WINDOW_TOO_LONG'});
      if(endsMs<=Date.now())return json(res,400,{ok:false,error:'AWAY_WINDOW_ALREADY_ENDED'});
      startsAt=new Date(startsMs).toISOString();
      endsAt=new Date(endsMs).toISOString();
    }

    const response=await supabaseRest('dabbir_owner_modes?on_conflict=business_id',token,{
      method:'POST',
      headers:{prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify({
        business_id:businessId,
        enabled,
        starts_at:startsAt,
        ends_at:endsAt,
        timezone,
        updated_by:user.id,
        updated_at:new Date().toISOString(),
      }),
    });
    const rows=await readData(response,'OWNER_AWAY_UPDATE_FAILED');
    const row=Array.isArray(rows)?rows[0]||null:null;
    if(!row)return json(res,502,{ok:false,error:'OWNER_AWAY_UPDATE_UNVERIFIED'});
    return json(res,200,{ok:true,business_id:businessId,mode:deriveOwnerAwayState(row),configuration:row,verified_persisted:true});
  }catch(error){
    if(error?.message==='INVALID_JSON')return json(res,400,{ok:false,error:'INVALID_JSON'});
    if(error?.message==='PAYLOAD_TOO_LARGE')return json(res,413,{ok:false,error:'PAYLOAD_TOO_LARGE'});
    const status=Number(error?.status||500);
    const code=status===401?'AUTH_REQUIRED':status===403?'OWNER_REQUIRED':'OWNER_AWAY_UPDATE_FAILED';
    return json(res,[401,403,409].includes(status)?status:503,{ok:false,error:code});
  }
}
