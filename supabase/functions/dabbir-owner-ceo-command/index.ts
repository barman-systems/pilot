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
async function rpc(name:string,params:Record<string,unknown>={}){
 const r=await sb(`/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify(params)});
 const p=await r.json().catch(()=>null);
 return {ok:r.ok,status:r.status,payload:p};
}
async function verifySession(token:string){
 if(!token||token.length<24||token.length>256)return null;
 const r=await rpc('dabbir_owner_session_verify_v1',{p_token_hash:await tokenHash(token)});
 const p=r.payload;
 return r.ok&&p?.authenticated===true&&p?.role==='platform_owner'&&p?.actor_user_id?p:null;
}
async function recent(session:any,limit=20){
 const r=await rpc('dabbir_ceo_commands_authorized_v1',{p_actor:session.actor_user_id,p_limit:Math.max(1,Math.min(Number(limit)||20,50))});
 if(!r.ok)return null;
 return Array.isArray(r.payload)?r.payload:[];
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!SUPABASE_URL||!SERVICE_KEY)return reply(503,{ok:false,error:'CEO_COMMAND_SERVICE_NOT_CONFIGURED'});
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_JSON'})}
 const session=await verifySession(String(body?.session_token||''));
 if(!session)return reply(401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 const action=String(body?.action||'list').trim().toLowerCase();
 if(action==='list'){
  const commands=await recent(session,body?.limit);
  if(commands===null)return reply(403,{ok:false,error:'CEO_COMMAND_READ_DENIED'});
  return reply(200,{ok:true,commands});
 }
 if(action==='create'){
  const commandText=String(body?.command_text||'').trim();
  const priority=String(body?.priority||'P1').trim().toUpperCase();
  if(commandText.length<4||commandText.length>4000)return reply(400,{ok:false,error:'COMMAND_TEXT_INVALID'});
  if(!['P0','P1','P2','P3'].includes(priority))return reply(400,{ok:false,error:'PRIORITY_INVALID'});
  const r=await rpc('dabbir_ceo_command_create_authorized_v1',{
   p_actor:session.actor_user_id,
   p_command_text:commandText,
   p_priority:priority,
   p_objective:null,
   p_acceptance_criteria:[],
   p_due_at:null,
  });
  if(!r.ok)return reply(403,{ok:false,error:'CEO_COMMAND_CREATE_DENIED'});
  const commands=await recent(session,body?.limit);
  return reply(200,{ok:true,command:r.payload,commands:Array.isArray(commands)?commands:[]});
 }
 return reply(400,{ok:false,error:'UNKNOWN_ACTION'});
});