const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store'};
const sbHeaders=()=>({'apikey':SERVICE_KEY,'authorization':`Bearer ${SERVICE_KEY}`,'content-type':'application/json'});
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const bytesToHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function sha(value:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
async function otpHash(id:string,otp:string){return sha(`${SERVICE_KEY}:dabbir-owner-otp:${id}:${otp}`)}
async function tokenHash(token:string){return sha(`${SERVICE_KEY}:dabbir-owner-session:${token}`)}
function randomToken(bytes=36){const data=new Uint8Array(bytes);crypto.getRandomValues(data);return btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomOtp(){const x=new Uint32Array(1);crypto.getRandomValues(x);return String(x[0]%1000000).padStart(6,'0')}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0}
async function sb(path:string,init:RequestInit={}){return fetch(`${SUPABASE_URL}${path}`,{...init,headers:{...sbHeaders(),...(init.headers||{})}})}
async function activeAdmin(){
 const r=await sb('/rest/v1/dabbir_platform_admins?active=eq.true&select=user_id&order=created_at.asc&limit=1');
 if(!r.ok)return null;const rows=await r.json().catch(()=>[]);return Array.isArray(rows)&&rows[0]?.user_id?String(rows[0].user_id):null;
}
async function adminEmail(userId:string){
 const r=await sb(`/auth/v1/admin/users/${encodeURIComponent(userId)}`);
 if(!r.ok)return null;const u=await r.json().catch(()=>null);return u?.email?String(u.email):null;
}
async function verifySession(token:string){
 if(!token||token.length<24||token.length>256)return null;
 const h=await tokenHash(token);
 const r=await sb('/rest/v1/rpc/dabbir_owner_session_verify_v1',{method:'POST',body:JSON.stringify({p_token_hash:h})});
 if(!r.ok)return null;const p=await r.json().catch(()=>null);return p?.authenticated===true&&p?.role==='platform_owner'&&p?.actor_user_id?p:null;
}
async function requestOtp(body:any){
 const resendKey=String(body?.resend_key||'').trim();
 if(!resendKey)return reply(503,{ok:false,error:'OWNER_OTP_NOT_CONFIGURED'});
 const since=new Date(Date.now()-10*60*1000).toISOString();
 const countRes=await sb(`/rest/v1/dabbir_owner_otp_challenges?created_at=gte.${encodeURIComponent(since)}&select=id`,{headers:{prefer:'count=exact'}});
 if(countRes.ok){const range=countRes.headers.get('content-range')||'';const total=Number(range.split('/')[1]);if(Number.isFinite(total)&&total>=3)return reply(429,{ok:false,error:'OTP_RATE_LIMITED'})}
 const actor=await activeAdmin();if(!actor)return reply(503,{ok:false,error:'PLATFORM_OWNER_NOT_CONFIGURED'});
 const email=await adminEmail(actor);if(!email)return reply(503,{ok:false,error:'PLATFORM_OWNER_EMAIL_NOT_CONFIGURED'});
 const id=crypto.randomUUID(),otp=randomOtp(),expires=new Date(Date.now()+10*60*1000).toISOString();
 const insert=await sb('/rest/v1/dabbir_owner_otp_challenges',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({id,otp_hash:await otpHash(id,otp),token_hash:await sha(`${SERVICE_KEY}:challenge:${id}:${randomToken(18)}`),expires_at:expires,attempts:0})});
 if(!insert.ok)return reply(503,{ok:false,error:'OWNER_AUTH_UNAVAILABLE'});
 const from=String(Deno.env.get('DABBIR_RESEND_FROM')||'DABBIR <onboarding@resend.dev>');
 const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${resendKey}`,'content-type':'application/json'},body:JSON.stringify({from,to:[email],subject:'DABBIR owner verification code',text:`رمز دخول مالك دبّر: ${otp}\n\nينتهي الرمز خلال 10 دقائق.\nDABBIR owner verification code: ${otp}\nExpires in 10 minutes.`})});
 if(!sent.ok){await sb(`/rest/v1/dabbir_owner_otp_challenges?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});return reply(503,{ok:false,error:'OWNER_OTP_DELIVERY_FAILED'})}
 return reply(200,{ok:true,challenge_id:id,otp_required:true});
}
async function verifyOtp(body:any){
 const id=String(body?.challenge_id||'').trim(),otp=String(body?.otp||'').trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^\d{6}$/.test(otp))return reply(401,{ok:false,error:'INVALID_OWNER_OTP'});
 const r=await sb(`/rest/v1/dabbir_owner_otp_challenges?id=eq.${encodeURIComponent(id)}&select=id,otp_hash,expires_at,attempts,consumed_at&limit=1`);
 if(!r.ok)return reply(503,{ok:false,error:'OWNER_AUTH_UNAVAILABLE'});const rows=await r.json().catch(()=>[]),row=Array.isArray(rows)?rows[0]:null;
 if(!row||row.consumed_at||new Date(row.expires_at).getTime()<=Date.now()||Number(row.attempts||0)>=5)return reply(401,{ok:false,error:'INVALID_OWNER_OTP'});
 const good=safeEqual(String(row.otp_hash||''),await otpHash(id,otp));
 if(!good){await sb(`/rest/v1/dabbir_owner_otp_challenges?id=eq.${encodeURIComponent(id)}&consumed_at=is.null`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({attempts:Number(row.attempts||0)+1})});return reply(401,{ok:false,error:'INVALID_OWNER_OTP'})}
 const actor=await activeAdmin();if(!actor)return reply(503,{ok:false,error:'PLATFORM_OWNER_NOT_CONFIGURED'});
 const sessionToken=randomToken(48),h=await tokenHash(sessionToken),expiresIn=43200,sessionExpires=new Date(Date.now()+expiresIn*1000).toISOString();
 const issue=await sb('/rest/v1/rpc/dabbir_owner_session_issue_v1',{method:'POST',body:JSON.stringify({p_actor_user_id:actor,p_token_hash:h,p_expires_at:sessionExpires})});
 if(!issue.ok)return reply(503,{ok:false,error:'OWNER_AUTH_UNAVAILABLE'});
 await sb(`/rest/v1/dabbir_owner_otp_challenges?id=eq.${encodeURIComponent(id)}&consumed_at=is.null`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({consumed_at:new Date().toISOString(),attempts:Number(row.attempts||0)+1})});
 return reply(200,{ok:true,authenticated:true,role:'platform_owner',session_token:sessionToken,expires_in:expiresIn});
}
async function ownerData(body:any){
 const session=await verifySession(String(body?.session_token||''));if(!session)return reply(401,{ok:false,error:'OWNER_SESSION_REQUIRED'});
 const action=String(body?.data_action||'overview').trim().toLowerCase();
 if(action==='overview'){
  const r=await sb('/rest/v1/rpc/dabbir_platform_owner_overview',{method:'POST',body:JSON.stringify({p_actor_user_id:session.actor_user_id})});
  if(!r.ok)return reply(503,{ok:false,error:'OWNER_DATA_FAILED'});const payload=await r.json().catch(()=>null);return reply(200,{ok:true,payload});
 }
 if(action==='search'){
  const q=String(body?.q||'').trim().slice(0,160);
  const r=await sb('/rest/v1/rpc/dabbir_platform_customer_search',{method:'POST',body:JSON.stringify({p_actor_user_id:session.actor_user_id,p_query:q,p_limit:50})});
  if(!r.ok)return reply(503,{ok:false,error:'OWNER_SEARCH_FAILED'});const rows=await r.json().catch(()=>[]);return reply(200,{ok:true,payload:{accounts:Array.isArray(rows)?rows:[]}});
 }
 return reply(400,{ok:false,error:'UNKNOWN_OWNER_DATA_ACTION'});
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!SUPABASE_URL||!SERVICE_KEY)return reply(503,{ok:false,error:'OWNER_BROKER_NOT_CONFIGURED'});
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_JSON'})}
 const action=String(body?.action||'').trim().toLowerCase();
 try{
  if(action==='owner_otp_request')return requestOtp(body);
  if(action==='owner_otp_verify')return verifyOtp(body);
  if(action==='owner_session_verify'){
   const session=await verifySession(String(body?.session_token||''));return session?reply(200,{ok:true,authenticated:true,role:'platform_owner',actor_user_id:session.actor_user_id,expires_at:session.expires_at}):reply(401,{ok:false,authenticated:false,error:'OWNER_SESSION_REQUIRED'});
  }
  if(action==='owner_data')return ownerData(body);
  return reply(400,{ok:false,error:'UNKNOWN_ACTION'});
 }catch{return reply(503,{ok:false,error:'OWNER_BROKER_UNAVAILABLE'})}
});