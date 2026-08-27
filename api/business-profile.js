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

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);

const FIELDS={
  about_business:{type:'fact',max:1200},
  business_hours:{type:'fact',max:800},
  contact_phone:{type:'contact',max:120},
  contact_whatsapp:{type:'contact',max:120},
  contact_email:{type:'contact',max:180},
  business_location:{type:'fact',max:500},
  delivery_policy:{type:'policy',max:1200},
  return_policy:{type:'policy',max:1200},
  payment_methods:{type:'policy',max:600},
  booking_policy:{type:'policy',max:1200},
};
const FIELD_KEYS=Object.keys(FIELDS);

async function parse(response,fallback){
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=null}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=data?.message||data?.code||null;throw error}
  return data;
}

async function context(req,res){
  const token=accessTokenFromRequest(req);
  if(!token){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  const [user,memberships]=await Promise.all([getVerifiedUser(token).catch(()=>null),getBusinessMemberships(token).catch(()=>[])]);
  if(!user){json(res,401,{ok:false,error:'AUTH_REQUIRED'});return null}
  return {token,user,memberships};
}

function membershipFor(rows,businessId){return rows.find(row=>row.business_id===businessId)||null}
function unwrapValue(value){
  if(value==null)return '';
  if(typeof value==='string')return value;
  if(typeof value==='object'&&typeof value.text==='string')return value.text;
  return JSON.stringify(value);
}

async function readProfile(token,businessId){
  const rows=await supabaseRest(`dabbir_business_knowledge?select=knowledge_key,knowledge_type,value,source,status,updated_at&business_id=eq.${businessId}&order=updated_at.desc&limit=80`,token).then(r=>parse(r,'BUSINESS_PROFILE_READ_FAILED'));
  const facts={};
  const metadata={};
  for(const row of rows||[]){
    if(!FIELD_KEYS.includes(row.knowledge_key))continue;
    facts[row.knowledge_key]=unwrapValue(row.value);
    metadata[row.knowledge_key]={status:row.status,source:row.source,updated_at:row.updated_at};
  }
  for(const key of FIELD_KEYS)if(!(key in facts))facts[key]='';
  return {facts,metadata};
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  if(req.method==='POST'&&!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const ctx=await context(req,res);
  if(!ctx)return;

  try{
    const body=req.method==='POST'?await readJsonBody(req):null;
    const businessId=safeId(req.method==='GET'?singleQueryValue(req,'business_id'):body?.business_id);
    if(!businessId)return json(res,400,{ok:false,error:'BUSINESS_ID_REQUIRED'});
    if(!membershipFor(ctx.memberships,businessId))return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});

    if(req.method==='GET'){
      const profile=await readProfile(ctx.token,businessId);
      return json(res,200,{ok:true,business_id:businessId,...profile,truth:{source:'owner_approved_business_knowledge',ai_grounding_enabled:true}});
    }

    const input=body?.facts&&typeof body.facts==='object'?body.facts:{};
    const submitted=FIELD_KEYS.filter(key=>Object.prototype.hasOwnProperty.call(input,key));
    if(!submitted.length)return json(res,400,{ok:false,error:'PROFILE_FACTS_REQUIRED'});

    const upserts=[];
    const deletes=[];
    for(const key of submitted){
      const spec=FIELDS[key];
      const value=clean(input[key],spec.max);
      if(!value){deletes.push(key);continue}
      upserts.push({
        business_id:businessId,
        knowledge_key:key,
        knowledge_type:spec.type,
        value:{text:value},
        source:'owner_approved',
        confidence:1,
        status:'approved',
        updated_at:new Date().toISOString(),
      });
    }

    if(upserts.length){
      await supabaseRest(`dabbir_business_knowledge?on_conflict=business_id,knowledge_key`,ctx.token,{
        method:'POST',
        headers:{prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(upserts),
      }).then(r=>parse(r,'BUSINESS_PROFILE_SAVE_FAILED'));
    }
    for(const key of deletes){
      await supabaseRest(`dabbir_business_knowledge?business_id=eq.${businessId}&knowledge_key=eq.${encodeURIComponent(key)}`,ctx.token,{
        method:'DELETE',headers:{prefer:'return=minimal'},
      }).then(r=>parse(r,'BUSINESS_PROFILE_DELETE_FAILED'));
    }

    const profile=await readProfile(ctx.token,businessId);
    return json(res,200,{ok:true,business_id:businessId,saved:upserts.length,removed:deletes.length,...profile,ai_grounding_enabled:true});
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413].includes(status)?status:500;
    console.error('dabbir_business_profile_failed',{status:safe,error:String(error?.message||'BUSINESS_PROFILE_FAILED').slice(0,140)});
    return json(res,safe,{ok:false,error:String(error?.message||'BUSINESS_PROFILE_FAILED').slice(0,140),detail:error?.detail||undefined});
  }
}
