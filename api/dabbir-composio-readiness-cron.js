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
const READINESS_USER='dabbir_readiness_google_sheets_v1';
const SESSION_RE=/^trs_[A-Za-z0-9_-]{6,160}$/;
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
function enabledList(value){
  if(Array.isArray(value?.enabled))return value.enabled;
  if(Array.isArray(value?.enable))return value.enable;
  return [];
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

function assertReadOnlySession(payload,expectedSessionId=null){
  const sessionId=clean(payload?.session_id,180);
  if(!SESSION_RE.test(sessionId)||(expectedSessionId&&sessionId!==expectedSessionId))throw fail('COMPOSIO_SESSION_UNVERIFIED',502);
  const config=payload?.config;
  if(!config||clean(config.user_id,120)!==READINESS_USER)throw fail('COMPOSIO_SESSION_SCOPE_UNVERIFIED',502);
  const toolkits=enabledList(config.toolkits).map(v=>clean(v,80).toLowerCase());
  if(toolkits.length!==1||toolkits[0]!==TOOLKIT)throw fail('COMPOSIO_SESSION_TOOLKIT_SCOPE_UNVERIFIED',502);
  const tools=enabledList(config.tools?.[TOOLKIT]);
  if(!exactTools(tools))throw fail('COMPOSIO_SESSION_TOOL_SCOPE_UNVERIFIED',502);
  if(config.manage_connections?.enabled===true||config.manage_connections?.enable===true)throw fail('COMPOSIO_SESSION_CONNECTION_META_ENABLED',502);
  if(config.workbench?.enable===true||config.workbench?.proxy_execution_enabled===true||config.workbench?.enable_proxy_execution===true)throw fail('COMPOSIO_SESSION_WORKBENCH_ENABLED',502);
  if(config.execute?.enable_multi_execute===true)throw fail('COMPOSIO_SESSION_MULTI_EXECUTE_ENABLED',502);
  return sessionId;
}

export async function verifyGoogleSheetsReadOnlySession(options={}){
  const created=await request('/tool_router/session',{
    ...options,method:'POST',body:{
      user_id:READINESS_USER,
      toolkits:{enable:[TOOLKIT]},
      tools:{[TOOLKIT]:{enable:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS]}},
      manage_connections:{enable:false,enable_wait_for_connections:false,enable_connection_removal:false},
      workbench:{enable:false,enable_proxy_execution:false},
      multi_account:{enable:false,max_accounts_per_toolkit:1,require_explicit_selection:true},
      preload:{tools:[...COMPOSIO_GOOGLE_SHEETS_READ_TOOLS]},
      search:{enable:false},
      execute:{enable_multi_execute:false},
    },
  });
  const sessionId=assertReadOnlySession(created);
  const readback=await request(`/tool_router/session/${encodeURIComponent(sessionId)}`,options);
  assertReadOnlySession(readback,sessionId);
  return {toolkit:TOOLKIT,mode:'read_only',sessionVerified:true,toolCount:COMPOSIO_GOOGLE_SHEETS_READ_TOOLS.length};
}

function json(res,status,body){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body))}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(!cronAuthMode(req))return json(res,401,{ok:false,error:'UNAUTHORIZED'});
  try{
    const result=await verifyGoogleSheetsReadOnlySession();
    console.log('dabbir_composio_bootstrap_ready',{toolkit:result.toolkit,mode:result.mode,session_verified:true,tool_count:result.toolCount});
    return json(res,200,{ok:true,toolkit:result.toolkit,mode:result.mode,session_verified:true,tool_count:result.toolCount});
  }catch(error){
    const code=clean(error?.code||error?.message||'COMPOSIO_BOOTSTRAP_FAILED',120);
    console.error('dabbir_composio_bootstrap_failed',{code,provider_status:Number(error?.providerStatus)||null});
    return json(res,Number(error?.status)||503,{ok:false,error:code});
  }
}
