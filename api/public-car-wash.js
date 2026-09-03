import { supabaseKeyHeaders } from './_supabase-key-auth.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SLUG_RE=/^[a-z0-9][a-z0-9_-]{2,119}$/i;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(res,status,body,extra={}){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');for(const [k,v] of Object.entries(extra))res.setHeader(k,v);res.end(JSON.stringify(body));}
function sameOrigin(req){
  const origin=String(req.headers.origin||'').trim().toLowerCase();
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase();
  if(origin){try{return new URL(origin).host===host}catch{return false}}
  const site=String(req.headers['sec-fetch-site']||'').toLowerCase();
  if(site==='same-origin')return true;
  if(['cross-site','same-site','none'].includes(site))return false;
  const referer=String(req.headers.referer||'').trim();
  try{return referer?new URL(referer).host===host:false}catch{return false}
}
function query(req,name){try{return new URL(String(req.url||'/'),'https://dabbir.invalid').searchParams.get(name)||''}catch{return ''}}
function clean(value,max){return String(value??'').trim().slice(0,max)}
function slug(value){const v=clean(value,120);return SLUG_RE.test(v)?v:null}
function readBody(req,max=12000){return new Promise((resolve,reject)=>{let n=0;const parts=[];req.on('data',chunk=>{n+=chunk.length;if(n>max){reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'),{status:413}));req.destroy();return}parts.push(chunk)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')||'{}'))}catch{reject(Object.assign(new Error('INVALID_JSON'),{status:400}))}});req.on('error',reject)})}
function serviceRoleKey(){
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key||key.startsWith('sb_publishable_'))throw Object.assign(new Error('PUBLIC_BOOKING_STORAGE_NOT_CONFIGURED'),{status:503});
  return key;
}
async function rpc(name,params){
  const key=serviceRoleKey();
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',headers:supabaseKeyHeaders(key,{accept:'application/json','content-type':'application/json'}),body:JSON.stringify(params),cache:'no-store',signal:AbortSignal.timeout(12000)});
  const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null}catch{}
  if(!response.ok){const error=new Error(String(payload?.message||payload?.code||'PUBLIC_BOOKING_FAILED').slice(0,120));error.status=response.status;throw error}
  return payload;
}
function safeStatus(error){return [400,403,404,405,409,413,422,429,503].includes(Number(error?.status))?Number(error.status):500}

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const action=clean(query(req,'action')||'catalog',16).toLowerCase();
      const pSlug=slug(query(req,'slug'));
      if(!pSlug)return json(res,400,{ok:false,error:'VALID_BOOKING_LINK_REQUIRED'});
      if(action==='catalog'){
        const catalog=await rpc('dabbir_public_car_wash_catalog',{p_slug:pSlug});
        if(!catalog)return json(res,404,{ok:false,error:'BOOKING_NOT_AVAILABLE'});
        return json(res,200,{ok:true,catalog});
      }
      if(action==='slots'){
        const offer=clean(query(req,'offer_id'),80);
        const from=clean(query(req,'from_date'),10);
        const to=clean(query(req,'to_date'),10);
        if(!UUID_RE.test(offer)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from))return json(res,400,{ok:false,error:'VALID_SLOT_QUERY_REQUIRED'});
        const slots=await rpc('dabbir_public_car_wash_slots',{p_slug:pSlug,p_offer_id:offer,p_from_date:from,p_to_date:/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to)?to:null});
        return json(res,200,{ok:true,slots:Array.isArray(slots)?slots:[]});
      }
      return json(res,400,{ok:false,error:'UNSUPPORTED_BOOKING_ACTION'});
    }
    if(req.method==='POST'){
      if(!sameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
      const body=await readBody(req);
      const pSlug=slug(body.slug),offer=clean(body.offer_id,80),vehicle=clean(body.vehicle_type,16).toLowerCase();
      const starts=clean(body.starts_at,40),name=clean(body.customer_name,120),phone=clean(body.customer_phone,30),label=clean(body.location_label,240);
      const lat=Number(body.location_lat),lng=Number(body.location_lng);
      if(!pSlug||!UUID_RE.test(offer)||!['saloon','station'].includes(vehicle)||!/^.{2,120}$/.test(name)||!/^.{7,30}$/.test(phone)||!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lng)||lng<-180||lng>180||!starts)return json(res,400,{ok:false,error:'INVALID_BOOKING_INPUT'});
      const booking=await rpc('dabbir_public_car_wash_book',{p_slug:pSlug,p_offer_id:offer,p_vehicle_type:vehicle,p_starts_at:starts,p_customer_name:name,p_customer_phone:phone,p_location_lat:lat,p_location_lng:lng,p_location_label:label});
      return json(res,200,{ok:true,booking});
    }
    return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET, POST'});
  }catch(error){
    const status=safeStatus(error);console.error('dabbir_public_car_wash_failed',{error:String(error?.message||'PUBLIC_BOOKING_FAILED').slice(0,120),status});return json(res,status,{ok:false,error:String(error?.message||'PUBLIC_BOOKING_FAILED').slice(0,120)});
  }
}
