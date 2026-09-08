import { timingSafeEqual } from 'node:crypto';

export const COMPOSIO_GOOGLE_SHEETS_READ_TOOLS = Object.freeze([
  'GOOGLESHEETS_GET_SPREADSHEET_INFO',
  'GOOGLESHEETS_GET_SHEET_NAMES',
  'GOOGLESHEETS_VALUES_GET',
  'GOOGLESHEETS_BATCH_GET',
]);

const EXPECTED_SCHEDULE='*/5 * * * *';
const BASE_URL='https://backend.composio.dev/api/v3.1';
const TOOLKIT='googlesheets';
const AUTH_CONFIG_RE=/^ac_[A-Za-z0-9_-]{6,160}$/;
const clean=(value,max=4000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
const sameSecret=(left,right)=>{const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)};

export function cronAuthMode(req,env=process.env){
  const secret=clean(env.CRON_SECRET,4096),authorization=clean(req.headers?.authorization,8192);
  if(secret)return sameSecret(authorization,`Bearer ${secret}`)?'secret':null;
  const production=clean(env.VERCEL_ENV,32)==='production';
  const userAgent=clean(req.headers?.['user-agent'],120).toLowerCase();
  const schedule=clean(req.headers?.['x-vercel-cron-schedule'],120);
  return production&&userAgent==='vercel-cron/1.0'&&schedule===EXPECTED_SCHEDULE?'vercel_schedule':null;
}

function fail(code,status=503,extra={}){return Object.assign(new Error(code),{code,status,...extra})}
function exactTools(value){
  if(!Array.isArray(value))return false;
  const left=[...new Set(value.map(v=>clean(v,180).toUpperCase()).filter(Boolean))].sort();
  const right=[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS].sort();
  return left.length===right.length&&left.every((tool,index)=>tool===right[index]);
}
function validManagedConfig(item){
  return Boolean(
    item&&AUTH_CONFIG_RE.test(clean(item.id,180))&&
    clean(item.toolkit?.slug,80).toLowerCase()===TOOLKIT&&
    item.is_composio_managed===true&&clean(item.status,40).toUpperCase()==='ENABLED'&&
    item.is_enabled_for_tool_router!==false&&exactTools(item.restrict_to_following_tools)
  );
}
async function request(path,{env=process.env,fetchImpl=fetch,method='GET',body}={}){
  const key=clean(env.COMPOSIO_API_KEY,4096);
  if(key.length<20)throw fail('COMPOSIO_API_KEY_MISSING');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetchImpl(`${BASE_URL}${path}`,{
      method,cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{'x-api-key':key,accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const text=await response.text();let payload={};
    if(text){try{payload=JSON.parse(text)}catch{throw fail('COMPOSIO_RESPONSE_INVALID',502)}}
    if(!response.ok)throw fail(`COMPOSIO_HTTP_${response.status}`,response.status===401||response.status===403?503:response.status===429||response.status>=500?503:502,{providerStatus:response.status});
    return payload;
  }catch(error){if(error?.name==='AbortError')throw fail('COMPOSIO_TIMEOUT',503);throw error}
  finally{clearTimeout(timer)}
}

export async function ensureGoogleSheetsReadOnlyAuthConfig(options={}){
  const query=new URLSearchParams({toolkit_slug:TOOLKIT,is_composio_managed:'true',show_disabled:'false',limit:'50'});
  const listed=await request(`/auth_configs?${query}`,options);
  const exact=(Array.isArray(listed?.items)?listed.items:[]).filter(validManagedConfig);
  if(exact.length>1)throw fail('COMPOSIO_AUTH_CONFIG_AMBIGUOUS',503);
  if(exact.length===1)return {id:exact[0].id,source:'existing',toolkit:TOOLKIT,toolCount:COMPOSIO_GOOGLE_SHEETS_READ_TOOLS.length};

  const created=await request('/auth_configs',{
    ...options,method:'POST',body:{
      toolkit:{slug:TOOLKIT},
      auth_config:{type:'use_composio_managed_auth',credentials:{},restrict_to_following_tools:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS]},
    },
  });
  const auth=created?.auth_config;
  if(!auth||!AUTH_CONFIG_RE.test(clean(auth.id,180))||auth.is_composio_managed!==true||!exactTools(auth.restrict_to_following_tools))throw fail('COMPOSIO_AUTH_CONFIG_UNVERIFIED',502);
  return {id:auth.id,source:'created',toolkit:TOOLKIT,toolCount:COMPOSIO_GOOGLE_SHEETS_READ_TOOLS.length};
}

function json(res,status,body){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body))}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(!cronAuthMode(req))return json(res,401,{ok:false,error:'UNAUTHORIZED'});
  try{
    const result=await ensureGoogleSheetsReadOnlyAuthConfig();
    console.log('dabbir_composio_bootstrap_ready',{toolkit:result.toolkit,mode:'read_only',source:result.source,tool_count:result.toolCount});
    return json(res,200,{ok:true,toolkit:result.toolkit,mode:'read_only',auth_config_ready:true,source:result.source,tool_count:result.toolCount});
  }catch(error){
    const code=clean(error?.code||error?.message||'COMPOSIO_BOOTSTRAP_FAILED',120);
    console.error('dabbir_composio_bootstrap_failed',{code,provider_status:Number(error?.providerStatus)||null});
    return json(res,Number(error?.status)||503,{ok:false,error:code});
  }
}
