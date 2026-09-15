import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import {serviceRpc} from './_whatsapp-live-core.js';
import {processClaimedWebAiBatch} from './_dabbir-conversation-web-transport.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=v=>UUID_RE.test(String(v||'').trim())?String(v).trim():null;
const cleanText=(v,max=2000)=>String(v||'').trim().slice(0,max);
const one=v=>Array.isArray(v)?v[0]??null:v??null;

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error}
  return payload;
}
const rest=(token,path,options={},fallback='DATA_REQUEST_FAILED')=>supabaseRest(path,token,options).then(r=>readData(r,fallback));

function safeStatus(error){
  const status=Number(error?.status||0);
  if([400,401,403,404,409,413,429,502,503,504].includes(status))return status;
  const code=String(error?.code||error?.message||'');
  if(code.includes('UNAVAILABLE')||code.includes('TIMEOUT')||code.includes('CAPACITY'))return 503;
  return 500;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'POST'});
  if(!requireSameOrigin(req))return json(res,403,{ok:false,error:'ORIGIN_REQUIRED'});
  const token=accessTokenFromRequest(req);
  if(!token)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});

  try{
    const body=await readJsonBody(req);
    const businessId=safeId(body.business_id),conversationId=safeId(body.conversation_id),message=cleanText(body.message,2000);
    if(!businessId||!conversationId||!message)return json(res,400,{ok:false,error:'MESSAGE_INPUT_REQUIRED'});
    if(!memberships.some(m=>m.business_id===businessId&&(!m.status||m.status==='active')))return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});

    const conversations=await rest(token,`dabbir_conversations?select=id,state,channel_type,demo_mode,customer_id&business_id=eq.${businessId}&id=eq.${conversationId}&limit=1`,{},'CONVERSATION_LOOKUP_FAILED');
    const conversation=conversations?.[0];
    if(!conversation)return json(res,404,{ok:false,error:'CONVERSATION_NOT_FOUND'});
    if(conversation.channel_type!=='web'||conversation.demo_mode===true)return json(res,409,{ok:false,error:'WEB_TEST_CONVERSATION_REQUIRED'});

    // Human takeover remains a transport/UI state and never invokes AI.
    if(conversation.state==='human_active'){
      const rows=await rest(token,'dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at',{
        method:'POST',headers:{prefer:'return=representation'},
        body:JSON.stringify({business_id:businessId,conversation_id:conversationId,sender_type:'customer',body:message,intent:'GENERAL_INQUIRY',simulated:false}),
      },'CUSTOMER_MESSAGE_PERSIST_FAILED');
      return json(res,200,{ok:true,customer_message:rows?.[0]||null,ai_message:null,human_takeover:true,state:'human_active',engine:null,external_side_effects:false});
    }

    // Customer ingress is persisted + enqueued atomically. From this point onward Web and
    // WhatsApp share the same message batch, semantic state, Conversation Brain and execution contract.
    const inbound=one(await serviceRpc('dabbir_web_ai_persist_inbound_v1',{
      p_business_id:businessId,p_conversation_id:conversationId,p_body:message,
    }));
    if(!inbound?.batch_id||!inbound?.dispatch_token||!inbound?.message?.id)throw Object.assign(new Error('WEB_AI_INGRESS_UNVERIFIED'),{status:502,code:'WEB_AI_INGRESS_UNVERIFIED'});

    const claim=one(await serviceRpc('dabbir_whatsapp_ai_claim_dispatch',{p_dispatch_token:inbound.dispatch_token}));
    if(claim?.state!=='CLAIMED'||!claim?.batch_id||!claim?.lock_token){
      const error=new Error(`WEB_AI_BATCH_${String(claim?.state||'UNCLAIMED')}`);error.status=503;error.code=error.message;throw error;
    }
    const processed=await processClaimedWebAiBatch(claim);
    return json(res,200,{
      ok:true,
      customer_message:inbound.message,
      ai_message:processed.ai_message||null,
      state:processed.state||'PROCESSED',
      action:processed.action||null,
      engine:processed.engine||null,
      response_source:processed.response_source||null,
      legacy_dialogue_called:processed.legacy_dialogue_called===true,
      canonical_conversation_brain:true,
      external_side_effects:['CREATE_BOOKING','HANDOFF'].includes(String(processed.action||'')),
    });
  }catch(error){
    const status=safeStatus(error);
    console.error('dabbir_customer_chat_failed',{error:cleanText(error?.code||error?.message||'CUSTOMER_CHAT_FAILED',160),status});
    return json(res,status,{ok:false,error:cleanText(error?.code||error?.message||'CUSTOMER_CHAT_FAILED',160),detail:error?.detail||undefined,canonical_conversation_brain:true});
  }
}
