const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const EXECUTIVE_CHAT_URL='https://dabbir.bmalman.com/api/barman-executive-chat';
const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store'};
const sbHeaders=()=>({'apikey':SERVICE_KEY,'authorization':`Bearer ${SERVICE_KEY}`,'content-type':'application/json'});
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
async function rpc(name:string,body:any={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:sbHeaders(),body:JSON.stringify(body)});const p=await r.json().catch(()=>null);if(!r.ok)throw new Error(`${name}:${r.status}`);return p}
async function tgCfg(){const c=await rpc('barman_telegram_config_v1',{});return {bot_token:String(c?.bot_token||''),webhook_secret:String(c?.webhook_secret||'')}}
async function sha256(s:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function hmac(key:string,value:string){const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(value)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function tg(token:string,method:string,payload:any){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const p=await r.json().catch(()=>null);if(!r.ok||p?.ok===false)throw new Error(`telegram:${method}:${r.status}`);return p}
async function send(token:string,chatId:number,text:string){return tg(token,'sendMessage',{chat_id:chatId,text:text.length>3900?text.slice(0,3890)+'…':text})}
function commands(data:any){return Array.isArray(data)?data:(Array.isArray(data?.commands)?data.commands:[])}
function compactCommands(arr:any[]){return arr.slice(0,8).map((c:any)=>({id:String(c?.id||''),status:String(c?.status||''),priority:String(c?.priority||''),command_text:String(c?.command_text||'').slice(0,1200),result_summary:c?.result_summary||null,blocked_reason:c?.blocked_reason||null,actions:Array.isArray(c?.actions)?c.actions.slice(0,10):[]}))}
function localDecision(text:string){
 if(/^(هل نفذت|هل تم|وين وصلت|ما الحالة|الحالة|حاله|status)[؟?]?$/i.test(text))return {kind:'status',reply:'',command_text:'',priority:'P1',brain_state:'LOCAL_STATUS'};
 if(/^(وينك|مرحبا|هلا|السلام|شكرا|شكراً|من انت|من أنت)[؟?]?$/i.test(text))return {kind:'chat',reply:'أنا BARMAN Executive OS. أتابع التنفيذ الفعلي والأدلة، لا مجرد تسجيل الرسائل.',command_text:'',priority:'P2',brain_state:'LOCAL_CHAT'};
 if(/(نفذ|نفّذ|أصلح|اصلح|ابن|ابدأ|ابدا|غيّر|غير|انشر|اربط|راجع|افحص|أنشئ|انشئ|جهز|طوّر|طور)/i.test(text))return {kind:'command',reply:'استلمت الهدف التنفيذي.',command_text:text,priority:/عاجل|حرج|p0/i.test(text)?'P0':'P1',brain_state:'LOCAL_COMMAND'};
 return {kind:'chat',reply:'فهمت رسالتك. سأتحدث معك طبيعيًا، ولن أحولها إلى مهمة إلا إذا طلبت إجراءً واضحًا.',command_text:'',priority:'P2',brain_state:'LOCAL_CHAT'};
}
async function decide(text:string,memory:any[],recent:any[]){
 const body=JSON.stringify({text,memory:Array.isArray(memory)?memory.slice(-16):[],commands:compactCommands(recent)});
 const ts=String(Math.floor(Date.now()/1000)),signature=await hmac(SERVICE_KEY,`${ts}.${body}`);
 try{
  const r=await fetch(EXECUTIVE_CHAT_URL,{method:'POST',headers:{'content-type':'application/json','x-barman-timestamp':ts,'x-barman-signature':signature},body,signal:AbortSignal.timeout(15000)});
  const p=await r.json().catch(()=>null);
  if(!r.ok||p?.ok!==true||!p?.decision)throw new Error(`executive-chat:${r.status}`);
  return p.decision;
 }catch(error){console.error('executive_chat_fallback',String(error));return localDecision(text)}
}
async function remember(userId:number,chatId:number,role:'user'|'assistant',content:string,metadata:any={}){try{await rpc('barman_telegram_memory_append_v1',{p_user_id:userId,p_chat_id:chatId,p_role:role,p_content:content,p_metadata:metadata})}catch(error){console.error('memory',String(error))}}
function statusReply(data:any){const arr=commands(data);return arr.length?arr.map((c:any,i:number)=>{const result=String(c.result_summary||c.blocked_reason||'').replace(/\s+/g,' ').slice(0,240);return `${i+1}) ${String(c.status||'UNKNOWN')} — ${String(c.command_text||'').replace(/\s+/g,' ').slice(0,180)}${result?`\n${result}`:''}`}).join('\n\n'):'لا توجد مهام مسجلة.'}

Deno.serve(async(req:Request)=>{try{
 if(req.method!=='POST')return json(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 const {bot_token,webhook_secret}=await tgCfg();if(!bot_token||!webhook_secret)return json(503,{ok:false,error:'TELEGRAM_NOT_CONFIGURED'});
 if(req.headers.get('x-telegram-bot-api-secret-token')!==webhook_secret)return json(403,{ok:false,error:'INVALID_WEBHOOK_SECRET'});
 const update=await req.json().catch(()=>null),m=update?.message;if(!m?.chat?.id||!m?.from?.id)return json(200,{ok:true,ignored:true});
 if(m.chat.type&&m.chat.type!=='private')return json(200,{ok:true,ignored:true,reason:'PRIVATE_ONLY'});
 const chatId=Number(m.chat.id),userId=Number(m.from.id),updateId=Number(update?.update_id||0),username=String(m.from.username||''),text=String(m.text||'').trim();
 if(!text){await send(bot_token,chatId,'حالياً المحادثة النصية مفعلة.');return json(200,{ok:true})}
 const auth=await rpc('barman_telegram_authorize_v1',{p_user_id:userId,p_chat_id:chatId});
 if(text==='/start'){await send(bot_token,chatId,auth===true?'BARMAN Executive OS متصل: محادثة AI، ذاكرة، وطابور تنفيذ موثق.':'أرسل /claim متبوعاً برمز الربط لإثبات المالك.');return json(200,{ok:true})}
 if(text.startsWith('/claim ')){const result=await rpc('barman_telegram_claim_v1',{p_user_id:userId,p_chat_id:chatId,p_username:username,p_claim_hash:await sha256(text.slice(7).trim())});await send(bot_token,chatId,result?.ok===true?'تم توثيقك كمالك BARMAN Executive OS.':'رمز الربط غير صحيح أو الهوية مثبتة مسبقًا.');return json(200,{ok:true})}
 if(auth!==true){await send(bot_token,chatId,'غير مصرح لهذا الحساب.');return json(200,{ok:true})}
 if(text==='/help'){await send(bot_token,chatId,'تحدث معي طبيعيًا. /status يعرض الحقيقة. استخدم /p0 إلى /p3 فقط لفرض أولوية أمر واضح.');return json(200,{ok:true})}
 if(text==='/status'){const s=await rpc('barman_telegram_status_v1',{p_user_id:userId,p_chat_id:chatId,p_limit:5});await send(bot_token,chatId,statusReply(s));return json(200,{ok:true,status:true})}
 await remember(userId,chatId,'user',text,{update_id:updateId});
 const memory=await rpc('barman_telegram_memory_recent_v1',{p_user_id:userId,p_chat_id:chatId,p_limit:18});
 const status=await rpc('barman_telegram_status_v1',{p_user_id:userId,p_chat_id:chatId,p_limit:8});
 let userText=text,forcedPriority:string|null=null;const match=text.match(/^\/(p[0-3])\s+([\s\S]+)/i);if(match){forcedPriority=match[1].toUpperCase();userText=match[2].trim()}
 const decision=forcedPriority?{kind:'command',reply:'استلمت الأمر الصريح.',command_text:userText,priority:forcedPriority,brain_state:'FORCED_COMMAND'}:await decide(userText,Array.isArray(memory)?memory:[],commands(status));
 const kind=['chat','status','command'].includes(String(decision?.kind))?String(decision.kind):'chat';
 let reply=String(decision?.reply||'').trim()||'وصلت.';
 if(kind==='status')reply=statusReply(status);
 if(kind==='command'){
  const commandText=String(decision?.command_text||userText).trim(),priority=/^P[0-3]$/.test(String(decision?.priority||'').toUpperCase())?String(decision.priority).toUpperCase():'P1';
  const queued=await rpc('barman_telegram_enqueue_v1',{p_update_id:updateId,p_user_id:userId,p_chat_id:chatId,p_text:commandText,p_priority:priority});
  if(queued?.ok===true){const command=queued.command||{},id=String(command.id||command.command_id||queued.command_id||'').slice(0,12);reply=`${reply}\n\nالمهمة ${priority} مسجلة${id?` (${id})`:''}. سيطالب بها عامل التنفيذ؛ QUEUED لا تعني أنها نُفذت.`}
  else reply=`لم أستطع تسجيل المهمة: ${String(queued?.reason||'UNKNOWN')}`;
 }
 await remember(userId,chatId,'assistant',reply,{kind,brain_state:decision?.brain_state||'UNKNOWN',model:decision?.model||null});
 await send(bot_token,chatId,reply);return json(200,{ok:true,kind,brain_state:decision?.brain_state||'UNKNOWN'});
}catch(error){console.error(String((error as any)?.stack||error));return json(500,{ok:false,error:'INTERNAL_ERROR'})}});
