import { Readable } from 'node:stream';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  readJsonBody,
  requireSameOrigin,
  supabaseRest,
} from './_auth-core.js';
import chatSendHandler from './chat-send.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=v=>UUID_RE.test(String(v||'').trim())?String(v).trim():null;
const cleanText=(v,max=2000)=>String(v||'').trim().slice(0,max);

async function readData(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){const error=new Error(fallback);error.status=response.status;error.detail=payload?.message||payload?.code||null;throw error}
  return payload;
}

const rest=(token,path,options={},fallback='DATA_REQUEST_FAILED')=>supabaseRest(path,token,options).then(r=>readData(r,fallback));

function delegateRequest(req,body){
  const stream=Readable.from([Buffer.from(JSON.stringify(body),'utf8')]);
  stream.method='POST';
  stream.headers={...req.headers,'content-type':'application/json'};
  stream.url=req.url;
  return stream;
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
    const businessId=safeId(body.business_id);
    const conversationId=safeId(body.conversation_id);
    const message=cleanText(body.message,2000);
    if(!businessId||!conversationId||!message)return json(res,400,{ok:false,error:'MESSAGE_INPUT_REQUIRED'});
    if(!memberships.some(m=>m.business_id===businessId))return json(res,403,{ok:false,error:'BUSINESS_ACCESS_DENIED'});

    const conversations=await rest(token,`dabbir_conversations?select=id,state,channel_type,demo_mode&business_id=eq.${businessId}&id=eq.${conversationId}&limit=1`,{},'CONVERSATION_LOOKUP_FAILED');
    const conversation=conversations?.[0];
    if(!conversation)return json(res,404,{ok:false,error:'CONVERSATION_NOT_FOUND'});

    if(conversation.state==='human_active'){
      const rows=await rest(token,'dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at',{
        method:'POST',headers:{prefer:'return=representation'},
        body:JSON.stringify({business_id:businessId,conversation_id:conversationId,sender_type:'customer',body:message,intent:'GENERAL_INQUIRY',simulated:false}),
      },'CUSTOMER_MESSAGE_PERSIST_FAILED');
      await rest(token,`dabbir_conversations?business_id=eq.${businessId}&id=eq.${conversationId}`,{
        method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({state:'human_active',updated_at:new Date().toISOString()}),
      },'CONVERSATION_STATE_UPDATE_FAILED');
      return json(res,200,{ok:true,customer_message:rows?.[0]||null,ai_message:null,human_takeover:true,state:'human_active',external_side_effects:false});
    }

    return chatSendHandler(delegateRequest(req,body),res);
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,413,429,502,503].includes(status)?status:500;
    console.error('dabbir_customer_chat_failed',{error:cleanText(error?.message||'CUSTOMER_CHAT_FAILED',120),status:safe});
    return json(res,safe,{ok:false,error:cleanText(error?.message||'CUSTOMER_CHAT_FAILED',120),detail:error?.detail||undefined});
  }
}
