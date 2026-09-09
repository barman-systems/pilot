import {randomUUID} from 'node:crypto';
import {supabaseRest,supabaseRpc} from './_auth-core.js';
import {logEvent,classifyFailure} from './_observability.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=v=>UUID.test(String(v||''))?v:null;
const fault=(code,status=409)=>Object.assign(new Error(code),{status});
async function read(response){
 const data=await response.json().catch(()=>null);
 if(!response.ok){const code=String(data?.message||'');throw Object.assign(fault(/^(?:OWNER_REQUIRED|OWNER_BOOKING_[A-Z_]+|ACTIVITY_[A-Z_]+(?::[a-z_]+)?|ACTION_SLOT_UNAVAILABLE|BUSINESS_PROFILE_UNVERIFIED|VALID_IDEMPOTENCY_KEY_REQUIRED|IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BOOKING)$/.test(code)?code:'OWNER_BOOKING_REQUEST_FAILED',response.status===403?403:409),{database_error_code:/^[0-9A-Z]{5}$/.test(String(data?.code||''))?data.code:null});}
 if(!data)throw fault('OWNER_BOOKING_RESULT_UNVERIFIED',502);
 return data;
}
export function ownerBookingRequest(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw fault('OWNER_BOOKING_CONTEXT_REQUIRED');
 const request={};
 for(const field of ['branch_id','customer_id','service_id']){if(!id(value[field]))throw fault('OWNER_BOOKING_CONTEXT_REQUIRED');request[field]=value[field];}
 if(value.worker_id){if(!id(value.worker_id))throw fault('ACTIVITY_WORKER_SCOPE_INVALID');request.worker_id=value.worker_id;}
 if(value.location_receipt_id){if(!id(value.location_receipt_id))throw fault('ACTIVITY_LOCATION_RECEIPT_UNVERIFIED');request.location_receipt_id=value.location_receipt_id;}
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(String(value.local_start||'')))throw fault('OWNER_BOOKING_TIME_REQUIRED');
 request.local_start=value.local_start;
 if(!/^[A-Z_]{2,24}$/.test(String(value.delivery_mode||'')))throw fault('ACTIVITY_DELIVERY_MODE_UNRESOLVED');
 request.delivery_mode=value.delivery_mode;
 request.facts={};
 // These are owner-entered values; authority, enum membership and requirements
 // are validated from the database contract. Client-supplied provenance is ignored.
 for(const [key,val] of Object.entries(value.facts||{})){
  if(!/^[a-z_]{2,40}$/.test(key)||typeof val!=='string'||val.trim().length>300)throw fault('OWNER_BOOKING_FACT_INVALID');
  request.facts[key]=val.trim();
 }
 return request;
}
export function approvedOwnerBooking(payload){
 if(!/^[0-9a-f]{32}$/.test(String(payload?.quote_hash||''))||!/^owner-ai:[A-Za-z0-9_-]{16,100}$/.test(String(payload?.idempotency_key||'')))throw fault('OWNER_BOOKING_CONTEXT_REQUIRED');
 return {action:'book_available_appointment',booking_request:ownerBookingRequest(payload.booking_request),quote_hash:payload.quote_hash,idempotency_key:payload.idempotency_key};
}
async function bookingRpc(token,businessId,parameters,traceId){
 const started=Date.now(),base={operation:parameters.p_execute?'owner_booking_execute':'owner_booking_quote',correlation_id:traceId||randomUUID(),business_id:businessId,branch_id:parameters.p_request.branch_id,service_id:parameters.p_request.service_id,tool:'book_available_appointment'};
 try{const result=await read(await supabaseRpc('dabbir_owner_activity_booking_v1',token,{p_business_id:businessId,...parameters}));logEvent('info',{...base,outcome:'DATABASE_RETURNED',verified_by_database:result.verified===true,state:result.state||null,activity_type:result.quote?.activity_type||result.activity_intelligence?.activity_type,appointment_id:result.appointment_id||null,idempotent_replay:result.idempotent_replay===true,latency_ms:Date.now()-started});return result;}
 catch(error){logEvent('warn',{...base,outcome:'FAILED',failure_class:classifyFailure(error,'DATA'),error_code:/^[A-Z_]+(?::[a-z_]+)?$/.test(error.message)?error.message:'OWNER_BOOKING_REQUEST_FAILED',database_error_code:error.database_error_code||null,latency_ms:Date.now()-started});throw error;}
}
export async function prepareOwnerBooking(token,businessId,input,language='ar',traceId){
 const request=ownerBookingRequest(input);
 const prepared=await bookingRpc(token,businessId,{p_request:request,p_execute:false},traceId);
 const q=prepared.quote;
 if(prepared.ok!==true||prepared.state!=='awaiting_approval'||q?.business_id!==businessId||q.branch_id!==request.branch_id||q.customer_id!==request.customer_id||q.service_id!==request.service_id||!q.contract_version||!q.activity_type||!Number.isFinite(q.price)||!Number.isInteger(q.duration_minutes)||!/^[0-9a-f]{32}$/.test(String(prepared.quote_hash||'')))throw fault('OWNER_BOOKING_RESULT_UNVERIFIED',502);
 const when=new Intl.DateTimeFormat(language==='ar'?'ar-AE':'en-GB',{timeZone:q.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(q.starts_at));
 const summary=language==='ar'?`حجز ${q.service_name} للعميل ${q.customer_name} — ${when}، المدة ${q.duration_minutes} دقيقة، السعر ${q.price} ${q.currency_code}.`:`Book ${q.service_name} for ${q.customer_name} — ${when}, ${q.duration_minutes} minutes, ${q.price} ${q.currency_code}.`;
 const raw={action:'book_available_appointment',booking_request:request,quote_hash:prepared.quote_hash,idempotency_key:'owner-ai:'+randomUUID(),step:1,reason:summary};
 return {raw,quote:q,approval:[{step:1,tool:raw.action,summary}]};
}
export async function executeOwnerBooking(token,businessId,payload,traceId){
 const approved=approvedOwnerBooking(payload);
 const result=await bookingRpc(token,businessId,{p_request:approved.booking_request,p_execute:true,p_quote_hash:approved.quote_hash,p_operation_key:approved.idempotency_key},traceId);
 const r=approved.booking_request;
 if(result.ok!==true||result.verified!==true||!id(result.appointment_id)||result.business_id!==businessId||result.branch_id!==r.branch_id||result.customer_id!==r.customer_id||result.service_id!==r.service_id||result.activity_intelligence?.source!=='owner_ai')throw fault('OWNER_BOOKING_RESULT_UNVERIFIED',502);
 return result;
}
export async function loadOwnerBookingContext(token,businessId,branchId,customerId){
 const branches=await read(await supabaseRest(`dabbir_business_branches?business_id=eq.${businessId}&status=eq.active&select=id,name,timezone&order=name&limit=100`,token));
 const customers=await read(await supabaseRest(`dabbir_customers?business_id=eq.${businessId}&select=id,display_name&order=display_name&limit=100`,token));
 if(!Array.isArray(branches)||!Array.isArray(customers))throw fault('OWNER_BOOKING_RESULT_UNVERIFIED',502);
 if(!branchId)return {ok:true,branches,customers};
 if(!id(branchId)||!branches.some(b=>b.id===branchId))throw fault('ACTIVITY_BRANCH_SCOPE_INVALID');
 const profile=await read(await supabaseRpc('dabbir_activity_profile_v1',token,{p_business_id:businessId,p_branch_id:branchId}));
 if(profile.business_id!==businessId||profile.branch_id!==branchId||profile.source!=='DATABASE_FACT')throw fault('OWNER_BOOKING_RESULT_UNVERIFIED',502);
 const workers=await read(await supabaseRest(`dabbir_workers?business_id=eq.${businessId}&status=eq.active&select=id,display_name&limit=100`,token));
 let locations=[];
 if(customerId){
  if(!id(customerId)||!customers.some(c=>c.id===customerId))throw fault('ACTIVITY_CUSTOMER_SCOPE_INVALID');
  locations=await read(await supabaseRpc('dabbir_owner_booking_locations_v1',token,{p_business_id:businessId,p_branch_id:branchId,p_customer_id:customerId}));
 }
 return {ok:true,branches,customers,profile,workers:Array.isArray(workers)?workers.filter(w=>profile.workers?.some(x=>x.id===w.id)):[],locations};
}
