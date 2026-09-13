import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";

const OWNER_SLUG='nd56cm4j5v-3619s-projects';
const OWNER_ID='team_pwfKq8jHuyW1XFVSZirAJiId';
const PROJECT_NAME='dabbir';
const PROJECT_ID='prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq';
const EXPECTED_AUDIENCE=`https://vercel.com/${OWNER_SLUG}`;
const EXPECTED_SUBJECT=`owner:${OWNER_SLUG}:project:${PROJECT_NAME}:environment:production`;
const ALLOWED_ISSUERS=new Set([
 'https://oidc.vercel.com',
 `https://oidc.vercel.com/${OWNER_SLUG}`,
]);
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store'};
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const serviceKeyIsJwt=()=>SERVICE_KEY.split('.').length===3;
const sbHeaders=()=>{const h:Record<string,string>={'apikey':SERVICE_KEY,'content-type':'application/json'};if(serviceKeyIsJwt())h.authorization=`Bearer ${SERVICE_KEY}`;return h};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
async function sha(v:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))))}
async function otpHash(id:string,otp:string){return sha(`${SERVICE_KEY}:dabbir-owner-otp:${id}:${otp}`)}
function randomToken(bytes=36){const d=new Uint8Array(bytes);crypto.getRandomValues(d);return btoa(String.fromCharCode(...d)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomOtp(){const x=new Uint32Array(1);crypto.getRandomValues(x);return String(x[0]%1000000).padStart(6,'0')}
function clean(v:unknown,max=4000){return String(v??'').trim().slice(0,max)}
async function sb(path:string,init:RequestInit={}){return fetch(`${SUPABASE_URL}${path}`,{...init,headers:{...sbHeaders(),...(init.headers||{})}})}
async function rpc(name:string,params:Record<string,unknown>={}){const r=await sb(`/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify(params)});const p=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,payload:p}}

function bearer(req:Request){const value=req.headers.get('authorization')||'';return value.startsWith('Bearer ')?value.slice(7).trim():''}
async function verifyVercelIdentity(token:string){
 if(!token)throw new Error('OIDC_REQUIRED');
 const decoded=decodeJwt(token),issuer=String(decoded.iss||'');
 if(!ALLOWED_ISSUERS.has(issuer))throw new Error('OIDC_ISSUER_REJECTED');
 const jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
 const {payload}=await jwtVerify(token,jwks,{issuer,audience:EXPECTED_AUDIENCE,subject:EXPECTED_SUBJECT});
 if(payload.owner_id!==OWNER_ID||payload.project_id!==PROJECT_ID||payload.project!==PROJECT_NAME||payload.environment!=='production')throw new Error('OIDC_IDENTITY_REJECTED');
 return payload;
}
function resendFrom(){const configured=clean(Deno.env.get('DABBIR_RESEND_FROM'),320);return configured&&!configured.toLowerCase().includes('@resend.dev')?configured:'DABBIR <no-reply@auth.bmalman.com>'}
async function sendEmail(key:string,to:string,otp:string){
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','user-agent':'DABBIR-owner-otp-mailer/4'},body:JSON.stringify({from:resendFrom(),to:[to],subject:'DABBIR verification code',text:`رمز دخول دبّر: ${otp}\n\nينتهي الرمز خلال 10 دقائق.\nDABBIR verification code: ${otp}\nExpires in 10 minutes.`})});
 if(!r.ok){const p:any=await r.json().catch(()=>null);console.error('DABBIR_OWNER_EMAIL_DELIVERY_FAILED',JSON.stringify({status:r.status,code:clean(p?.name||p?.code||p?.type,80)||'UNKNOWN',sender_mode:'verified_auth_domain'}))}
 return r.ok;
}

async function requestOtp(body:any,resendKey:string){
 const login=clean(body?.login||body?.identifier||body?.username||'__root__',254).toLowerCase();
 const identity=await rpc('dabbir_platform_login_identity_v1',{p_login:login});
 if(!identity.ok||!identity.payload?.user_id||!identity.payload?.email)return reply(404,{ok:false,error:'PLATFORM_IDENTITY_NOT_FOUND'});
 const userId=String(identity.payload.user_id),email=String(identity.payload.email),invitationId=identity.payload.invitation_id||null;
 const invitationGeneration=invitationId?Number(identity.payload.invitation_generation):null;
 if(invitationId&&(!UUID_RE.test(String(invitationId))||!Number.isInteger(invitationGeneration)||Number(invitationGeneration)<1))return reply(503,{ok:false,error:'INVITATION_IDENTITY_INVALID'});
 const since=new Date(Date.now()-10*60*1000).toISOString();
 const c=await sb(`/rest/v1/dabbir_owner_otp_challenges?actor_user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(since)}&select=id`,{headers:{prefer:'count=exact'}});
 if(c.ok){const total=Number((c.headers.get('content-range')||'').split('/')[1]);if(Number.isFinite(total)&&total>=3)return reply(429,{ok:false,error:'OTP_RATE_LIMITED'})}
 const id=crypto.randomUUID(),otp=randomOtp(),expires=new Date(Date.now()+10*60*1000).toISOString();
 const ins=await sb('/rest/v1/dabbir_owner_otp_challenges',{method:'POST',headers:{prefer:'return=minimal'},body:JSON.stringify({id,actor_user_id:userId,invitation_id:invitationId,invitation_generation:invitationId?invitationGeneration:null,otp_hash:await otpHash(id,otp),token_hash:await sha(`${SERVICE_KEY}:challenge:${id}:${randomToken(18)}`),expires_at:expires,attempts:0})});
 if(!ins.ok)return reply(503,{ok:false,error:'OWNER_AUTH_UNAVAILABLE'});
 const sent=await sendEmail(resendKey,email,otp);
 if(!sent){await sb(`/rest/v1/dabbir_owner_otp_challenges?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});return reply(503,{ok:false,error:'OWNER_OTP_DELIVERY_FAILED'})}
 return reply(200,{ok:true,challenge_id:id,otp_required:true});
}

Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!SUPABASE_URL||!SERVICE_KEY)return reply(503,{ok:false,error:'OWNER_MAILER_NOT_CONFIGURED'});
 try{await verifyVercelIdentity(bearer(req))}catch(error){console.warn('DABBIR_OWNER_MAILER_OIDC_REJECTED',{error:clean(error instanceof Error?error.message:error,120)});return reply(401,{ok:false,error:'OWNER_MAILER_OIDC_REQUIRED'})}
 let body:any;try{body=await req.json()}catch{return reply(400,{ok:false,error:'INVALID_JSON'})}
 const resendKey=clean(body?.resend_key,500);if(!resendKey)return reply(503,{ok:false,error:'OWNER_OTP_NOT_CONFIGURED'});
 if(clean(body?.action,60).toLowerCase()!=='owner_otp_request')return reply(400,{ok:false,error:'UNKNOWN_ACTION'});
 try{return await requestOtp(body,resendKey)}catch(error){console.error('DABBIR_OWNER_MAILER_UNAVAILABLE',error instanceof Error?error.message:'unknown');return reply(503,{ok:false,error:'OWNER_MAILER_UNAVAILABLE'})}
});
