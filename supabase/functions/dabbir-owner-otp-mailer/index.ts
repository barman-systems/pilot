const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store'};

const serviceKeyIsJwt=()=>SERVICE_KEY.split('.').length===3;
const sbHeaders=()=>{const h:Record<string,string>={'apikey':SERVICE_KEY,'content-type':'application/json'};if(serviceKeyIsJwt())h.authorization=`Bearer ${SERVICE_KEY}`;return h};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
async function sha(v:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))))}
async function otpHash(id:string,otp:string){return sha(`${SERVICE_KEY}:dabbir-owner-otp:${id}:${otp}`)}
function randomToken(bytes=36){const d=new Uint8Array(bytes);crypto.getRandomValues(d);return btoa(String.fromCharCode(...d)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomOtp(){const x=new Uint32Array(1);crypto.getRandomValues(x);return String(x[0]%1000000).padStart(6,'0')}
function clean(v:unknown,max=4000){return String(v??'').trim().slice(0,max)}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let o=0;for(let i=0;i<a.length;i++)o|=a.charCodeAt(i)^b.charCodeAt(i);return o===0}
async function sb(path:string,init:RequestInit={}){return fetch(`${SUPABASE_URL}${path}`,{...init,headers:{...sbHeaders(),...(init.headers||{})}})}
async function rpc(name:string,params:Record<string,unknown>={}){const r=await sb(`/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify(params)});const p=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,payload:p}}

async function validMailerSignature(req:Request,resendKey:string){
 const provided=clean(req.headers.get('x-dabbir-owner-mailer-auth'),128);if(!provided||!resendKey)return false;
 return safeEqual(provided,await sha(`${resendKey}:dabbir-owner-otp-mailer-v2`));
}
function resendFrom(){const configured=clean(Deno.env.get('DABBIR_RESEND_FROM'),320);return configured&&!configured.toLowerCase().includes('@resend.dev')?configured:'DABBIR <no-reply@auth.bmalman.com>'}
async function sendEmail(key:string,to:string,otp:string){
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','user-agent':'DABBIR-owner-otp-mailer/3'},body:JSON.stringify({from:resendFrom(),to:[to],subject:'DABBIR verification code',text:`رمز دخول دبّر: ${otp}\n\nينتهي الرمز خلال 10 دقائق.\nDABBIR verification code: ${otp}\nExpires in 10 minutes.`})});
 if(!r.ok){const p:any=await r.json().catch(()=>null);console.error('DABBIR_OWNER_EMAIL_DELIVERY_FAILED',JSON.stringify({status:r.status,code:clean(p?.name||p?.code||p?.type,80)||'UNKNOWN',sender_mode:'verified_auth_domain'}))}
 return r.ok;
}

async function requestOtp(body:any,resendKey:string){
 const login=clean(body?.login||body?.identifier||body?.username||'__root__',254).toLowerCase();
 const identity=await rpc('dabbir_platform_login_identity_v1',{p_login:login});
 if(!identity.ok||!identity.payload?.user_id||!identity.payload?.email)return reply(404,{ok:false,error:'PLATFORM_IDENTITY_NOT_FOUND'});
 const userId=String(identity.payload.user_id),email=String(identity.payload.email),invitationId=identity.payload.invitation_id||null;
 const since=new Date(Date.now()-10*60*1000).toISOString();
 const c=await sb(`/rest/v1/dabbir_owner_otp_challenges?actor_user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(since)}&select=id`,{headers:{prefer:'count=exact'}});
 if(c.ok){const total=Number((c.headers.get('content-range')||'').split('/')[1]);if(Number.isFinite(total)&&total>=3)return reply(429,{ok:false,error:'OTP_RATE_LIMITED'})}
 const id=crypto.randomUUID(),otp=randomOtp(),expires=new Date(Date.now()+10*60*1000).toISOString();
 const ins=await sb('/rest/v1/dabbir_owner_otp_challenges',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({id,actor_user_id:userId,invitation_id:invitationId,otp_hash:await otpHash(id,otp),token_hash:await sha(`${SERVICE_KEY}:challenge:${id}:${randomToken(18)}`),expires_at:expires,attempts:0})});
 if(!ins.ok)return reply(503,{ok:false,error:'OWNER_AUTH_UNAVAILABLE'});
 const sent=await sendEmail(resendKey,email,otp);
 if(!sent){await sb(`/rest/v1/dabbir_owner_otp_challenges?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});return reply(503,{ok:false,error:'OWNER_OTP_DELIVERY_FAILED'})}
 return reply(200,{ok:true,challenge_id:id,otp_required:true});
}

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!SUPABASE_URL||!SERVICE_KEY)return reply(503,{ok:false,error:'OWNER_MAILER_NOT_CONFIGURED'});
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_JSON'})}
 const resendKey=clean(body?.resend_key,500);if(!resendKey)return reply(503,{ok:false,error:'OWNER_OTP_NOT_CONFIGURED'});
 if(!await validMailerSignature(req,resendKey))return reply(401,{ok:false,error:'OWNER_MAILER_UNAUTHORIZED'});
 if(clean(body?.action,60).toLowerCase()!=='owner_otp_request')return reply(400,{ok:false,error:'UNKNOWN_ACTION'});
 try{return await requestOtp(body,resendKey)}catch(error){console.error('DABBIR_OWNER_MAILER_UNAVAILABLE',error instanceof Error?error.message:'unknown');return reply(503,{ok:false,error:'OWNER_MAILER_UNAVAILABLE'})}
});
