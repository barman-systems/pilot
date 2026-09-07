import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
  supabaseRpc,
} from './_auth-core.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=v=>UUID_RE.test(String(v||'').trim())?String(v).trim():null;
const cleanText=(v,max=2000)=>String(v||'').trim().slice(0,max);

async function readRpc(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=payload?.message||payload?.code||null;
    throw error;
  }
  return payload;
}

async function rpc(token,name,params,fallback){
  return readRpc(await supabaseRpc(name,token,params),fallback);
}

async function conversationChannel(token,businessId,conversationId){
  const response=await supabaseRest(
    `dabbir_conversations?select=id,channel_type&business_id=eq.${encodeURIComponent(businessId)}&id=eq.${encodeURIComponent(conversationId)}&limit=1`,
    token,
  );
  const rows=await readRpc(response,'CONVERSATION_LOOKUP_FAILED');
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row?.id){
    const error=new Error('CONVERSATION_NOT_FOUND');
    error.status=404;
    throw error;
  }
  return cleanText(row.channel_type,40).toLowerCase();
}

function requestOrigin(req){
  const forwarded=cleanText(req.headers?.['x-forwarded-proto'],20).split(',')[0]||'https';
  const host=cleanText(req.headers?.host,300);
  if(!host)return null;
  return `${forwarded}://${host}`;
}

function outboundKey(userId,conversationId){
  const entropy=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `human:${cleanText(userId,36)}:${cleanText(conversationId,36)}:${cleanText(entropy,48)}`.slice(0,160);
}

async function sendLiveWhatsApp(req,token,user,businessId,conversationId,message){
  const origin=requestOrigin(req);
  if(!origin){
    const error=new Error('WHATSAPP_REPLY_ORIGIN_UNAVAILABLE');
    error.status=503;
    throw error;
  }
  const browserCookie=cleanText(req.headers?.cookie,8192);
  if(!browserCookie){
    const error=new Error('WHATSAPP_REPLY_AUTH_COOKIE_UNAVAILABLE');
    error.status=401;
    throw error;
  }
  const response=await fetch(`${origin}/api/dabbir-whatsapp-reply`,{
    method:'POST',
    cache:'no-store',
    headers:{
      authorization:`Bearer ${token}`,
      cookie:browserCookie,
      origin,
      'content-type':'application/json',
      accept:'application/json',
      'x-dabbir-chat-control':'human-whatsapp-reply',
    },
    body:JSON.stringify({
      business_id:businessId,
      conversation_id:conversationId,
      message,
      idempotency_key:outboundKey(user.id,conversationId),
    }),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.ok){
    const error=new Error(cleanText(payload.error,160)||'WHATSAPP_LIVE_REPLY_FAILED');
    error.status=Number(response.status||500);
    error.detail=cleanText(payload.state||payload.provider_code||'',160)||null;
    throw error;
  }
  if(!payload.provider_accepted||!payload.message?.id){
    const error=new Error('WHATSAPP_LIVE_REPLY_UNVERIFIED');
    error.status=502;
    throw error;
  }
  return payload;
}

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req)) return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});

  const token=accessTokenFromRequest(req);
  if(!token) return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user) return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  try{
    const body=await readJsonBody(req);
    const action=cleanText(body.action,40);
    const businessId=safeId(body.business_id);
    const conversationId=safeId(body.conversation_id);
    if(!businessId||!conversationId) return json(res,400,{ok:false,error:'CONVERSATION_INPUT_REQUIRED'});
    if(!memberships.some(m=>m.business_id===businessId)) return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});

    let result;
    let externalSideEffects=false;
    if(action==='takeover'){
      result=await rpc(token,'dabbir_takeover_conversation',{p_business_id:businessId,p_conversation_id:conversationId},'TAKEOVER_FAILED');
    }else if(action==='return_to_ai'){
      result=await rpc(token,'dabbir_return_conversation_to_ai',{p_business_id:businessId,p_conversation_id:conversationId},'RETURN_TO_AI_FAILED');
    }else if(action==='human_message'){
      const message=cleanText(body.message,2000);
      if(!message) return json(res,400,{ok:false,error:'MESSAGE_REQUIRED'});
      const channel=await conversationChannel(token,businessId,conversationId);
      if(channel==='whatsapp'){
        const outbound=await sendLiveWhatsApp(req,token,user,businessId,conversationId,message);
        result={message:outbound.message,channel:'whatsapp',provider_accepted:true,state:outbound.state};
        externalSideEffects=true;
      }else{
        result=await rpc(token,'dabbir_send_human_message',{p_business_id:businessId,p_conversation_id:conversationId,p_body:message},'HUMAN_MESSAGE_FAILED');
      }
    }else{
      return json(res,400,{ok:false,error:'UNSUPPORTED_CHAT_CONTROL_ACTION'});
    }

    return json(res,200,{ok:true,action,result,external_side_effects:externalSideEffects});
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413,429,502,503,504].includes(status)?status:500;
    console.error('dabbir_chat_control_failed',{error:cleanText(error?.message||'CHAT_CONTROL_FAILED',120),detail:cleanText(error?.detail||'',160),status:safe});
    return json(res,safe,{ok:false,error:cleanText(error?.message||'CHAT_CONTROL_FAILED',120),detail:error?.detail||undefined});
  }
}
