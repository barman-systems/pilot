const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store'};
const serviceKeyIsJwt=()=>SERVICE_KEY.split('.').length===3;
const sbHeaders=()=>{const h:Record<string,string>={'apikey':SERVICE_KEY,'content-type':'application/json'};if(serviceKeyIsJwt())h.authorization=`Bearer ${SERVICE_KEY}`;return h};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const bytesToHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function sha(value:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
async function tokenHash(token:string){return sha(`${SERVICE_KEY}:dabbir-owner-session:${token}`)}
async function sb(path:string,init:RequestInit={}){return fetch(`${SUPABASE_URL}${path}`,{...init,headers:{...sbHeaders(),...(init.headers||{})}})}
async function verifySession(token:string){
 if(!token||token.length<24||token.length>256)return null;
 const r=await sb('/rest/v1/rpc/dabbir_owner_session_verify_v1',{method:'POST',body:JSON.stringify({p_token_hash:await tokenHash(token)})});
 if(!r.ok)return null;
 const p=await r.json().catch(()=>null);
 return p?.authenticated===true&&p?.role==='platform_owner'&&p?.actor_user_id?p:null;
}
async function recent(limit=20){
 const r=await sb('/rest/v1/rpc/dabbir_ceo_commands_recent_v1',{method:'POST',body:JSON.stringify({p_limit:Math.max(1,Math.min(Number(limit)||20,50))})});
 if(!r.ok)return null;
 const p=await r.json().catch(()=>null);
 return Array.isArray(p)?p:[];
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!SUPABASE_URL||!SERVICE_KEY)return reply(503,{ok:false,error:'CEO_COMMAND_SERVICE_NOT_CONFIGURED'});
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_JSON'})}
 const session=await verifySession(String(body?.session_token||''));
 if(!session)return reply(401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 const action=String(body?.action||'list').trim().toLowerCase();
 if(action==='list'){
  const commands=await recent(body?.limit);
  if(commands===null)return reply(503,{ok:false,error:'CEO_COMMAND_READ_FAILED'});
  return reply(200,{ok:true,commands});
 }
 if(action==='create'){
  const commandText=String(body?.command_text||'').trim();
  const priority=String(body?.priority||'P1').trim().toUpperCase();
  if(commandText.length<4||commandText.length>4000)return reply(400,{ok:false,error:'COMMAND_TEXT_INVALID'});
  if(!['P0','P1','P2','P3'].includes(priority))return reply(400,{ok:false,error:'PRIORITY_INVALID'});
  const r=await sb('/rest/v1/rpc/dabbir_ceo_command_create_v1',{method:'POST',body:JSON.stringify({p_created_by:session.actor_user_id,p_command_text:commandText,p_priority:priority})});
  if(!r.ok)return reply(503,{ok:false,error:'CEO_COMMAND_CREATE_FAILED'});
  const command=await r.json().catch(()=>null);
  const commands=await recent(body?.limit);
  return reply(200,{ok:true,command,commands:Array.isArray(commands)?commands:[]});
 }
 return reply(400,{ok:false,error:'UNKNOWN_ACTION'});
});