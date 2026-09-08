import { createHmac } from 'node:crypto';
import baseHandler,{verifyMetaSignature} from './dabbir-whatsapp-webhook.js';
import { extractCoexistenceEvents,persistCoexistenceEvent } from './_whatsapp-coexistence.js';
import { parseBookingFlowReply,persistBookingFlowReply } from './_dabbir-whatsapp-flows.js';

export const config={api:{bodyParser:false}};
const firstEnv=(...names)=>{for(const name of names){const value=String(process.env[name]||'').trim();if(value)return value;}return '';};
async function rawBody(req){
  if(Buffer.isBuffer(req.rawBody))return req.rawBody;
  if(typeof req.rawBody==='string')return Buffer.from(req.rawBody);
  if(Buffer.isBuffer(req.body))return req.body;
  if(typeof req.body==='string')return Buffer.from(req.body);
  const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return chunks.length?Buffer.concat(chunks):Buffer.alloc(0);
}
function isUnlinked(error){return String(error?.code||error?.message||'').includes('WHATSAPP_TENANT_CONNECTION_NOT_FOUND');}
function terminalFlowError(error){
  const code=String(error?.code||error?.message||'');
  return ['WHATSAPP_FLOW_SESSION_NOT_FOUND','WHATSAPP_FLOW_TOKEN_ALREADY_USED','WHATSAPP_FLOW_SESSION_NOT_ACTIVE','WHATSAPP_FLOW_SESSION_EXPIRED','WHATSAPP_FLOW_CONNECTION_SCOPE_INVALID','WHATSAPP_FLOW_CONVERSATION_SCOPE_INVALID','WHATSAPP_FLOW_SENDER_SCOPE_INVALID','WHATSAPP_FLOW_SERVICE_SCOPE_INVALID','WHATSAPP_FLOW_REQUIRED_FIELD_MISSING'].some(x=>code.includes(x));
}
function canonicalizeFlowForBase(payload,secret){
  let changed=false;
  for(const entry of payload.entry||[])for(const change of entry.changes||[]){
    if(change?.field!=='messages'||!Array.isArray(change?.value?.messages))continue;
    const before=change.value.messages.length;
    change.value.messages=change.value.messages.filter(message=>message?.interactive?.type!=='nfm_reply');
    if(change.value.messages.length!==before)changed=true;
  }
  if(!changed)return null;
  const raw=Buffer.from(JSON.stringify(payload));
  return {raw,signature:`sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`};
}

export default async function handler(req,res){
  if(req.method!=='POST')return baseHandler(req,res);
  let raw;
  try{raw=await rawBody(req);}catch{return res.status(400).json({ok:false,error:'raw_body_unavailable'});}
  req.rawBody=raw;
  const secret=firstEnv('DABBIR_WHATSAPP_APP_SECRET','PILOT_WHATSAPP_APP_SECRET');
  const signature=verifyMetaSignature(raw,req.headers||{},secret);
  if(!signature.ok)return baseHandler(req,res);
  let payload;
  try{payload=JSON.parse(raw.toString('utf8'));}catch{return baseHandler(req,res);}
  if(payload?.object!=='whatsapp_business_account')return baseHandler(req,res);

  let applied=0,duplicates=0,queued=0,unlinked=0,flowApplied=0,flowDuplicates=0,flowInvalid=0;
  try{
    for(const entry of payload.entry||[]){
      for(const change of entry.changes||[]){
        for(const event of extractCoexistenceEvents(change)){
          try{
            const result=await persistCoexistenceEvent(event);
            if(result.applied)applied++;
            if(result.duplicate)duplicates++;
            if(result.queued)queued++;
          }catch(error){
            if(isUnlinked(error)){unlinked++;continue;}
            throw error;
          }
        }
        if(change?.field==='messages'){
          const phoneNumberId=change?.value?.metadata?.phone_number_id||change?.value?.phone_number_id||null;
          for(const message of change?.value?.messages||[]){
            const flowReply=parseBookingFlowReply(message);if(!flowReply)continue;
            if(!flowReply.valid){flowInvalid++;continue;}
            const event={messageId:message.id||null,from:message.from||null,timestamp:message.timestamp||null,phoneNumberId,flowReply};
            try{
              const result=await persistBookingFlowReply(event);if(result.persisted)flowApplied++;if(result.duplicate)flowDuplicates++;
            }catch(error){
              if(terminalFlowError(error)){flowInvalid++;continue;}
              throw error;
            }
          }
        }
      }
    }
  }catch(error){
    console.error('dabbir_whatsapp_extension_persistence_failed',{error:String(error?.code||error?.message||'WHATSAPP_EXTENSION_PERSISTENCE_FAILED').slice(0,160)});
    return res.status(Number(error?.status||502)).setHeader('cache-control','no-store').json({ok:false,service:'dabbir-whatsapp-webhook',state:'WHATSAPP_EXTENSION_PERSISTENCE_FAILED',retryable:true});
  }

  // The outer gate verified Meta's original signature. Flow replies have already
  // been consumed (or rejected terminally) above, so remove them from the internal
  // copy before the canonical webhook path handles unrelated messages/statuses.
  // Re-sign only this server-created copy; no external signature is ever bypassed.
  const canonical=canonicalizeFlowForBase(payload,secret);
  if(canonical){req.rawBody=canonical.raw;req.headers['x-hub-signature-256']=canonical.signature;}

  const originalJson=typeof res.json==='function'?res.json.bind(res):null;
  if(originalJson){
    res.json=body=>originalJson(body&&typeof body==='object'?{...body,coexistence_applied:applied,coexistence_duplicates:duplicates,coexistence_queued_mutations:queued,coexistence_unlinked:unlinked,booking_flow_applied:flowApplied,booking_flow_duplicates:flowDuplicates,booking_flow_invalid:flowInvalid}:body);
  }
  return baseHandler(req,res);
}
