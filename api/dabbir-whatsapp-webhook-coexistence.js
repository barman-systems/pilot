import baseHandler,{verifyMetaSignature} from './dabbir-whatsapp-webhook.js';
import { extractCoexistenceEvents,persistCoexistenceEvent } from './_whatsapp-coexistence.js';

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

  let applied=0,duplicates=0,queued=0,unlinked=0;
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
      }
    }
  }catch(error){
    console.error('dabbir_whatsapp_coexistence_persistence_failed',{error:String(error?.code||error?.message||'COEXISTENCE_PERSISTENCE_FAILED').slice(0,160)});
    return res.status(Number(error?.status||502)).setHeader('cache-control','no-store').json({ok:false,service:'dabbir-whatsapp-webhook',state:'COEXISTENCE_PERSISTENCE_FAILED',retryable:true});
  }

  const originalJson=typeof res.json==='function'?res.json.bind(res):null;
  if(originalJson){
    res.json=body=>originalJson(body&&typeof body==='object'?{...body,coexistence_applied:applied,coexistence_duplicates:duplicates,coexistence_queued_mutations:queued,coexistence_unlinked:unlinked}:body);
  }
  return baseHandler(req,res);
}
