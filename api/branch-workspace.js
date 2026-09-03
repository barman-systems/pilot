import { singleQueryValue } from './_request-query.js';
import {
  accessTokenFromRequest,
  getBusinessMemberships,
  getVerifiedUser,
  json,
  supabaseRest,
} from './_auth-core.js';
import { getDABBIRAiConfig } from './_ai-core.js';
import { branchFilter, resolveBranchScope } from './_branch-scope.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=value=>UUID_RE.test(String(value||'').trim())?String(value).trim():null;
const enc=value=>encodeURIComponent(String(value));

async function readData(response,fallback='DATA_REQUEST_FAILED'){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=Number(response.status||500);
    error.detail=payload?.code||payload?.message||null;
    throw error;
  }
  return payload;
}

const rest=(token,path,fallback)=>readData(supabaseRest(path,token),fallback);

async function identity(req){
  const token=accessTokenFromRequest(req);
  if(!token)return null;
  const [user,memberships]=await Promise.all([
    getVerifiedUser(token).catch(()=>null),
    getBusinessMemberships(token).catch(()=>[]),
  ]);
  if(!user)return null;
  return {token,user,memberships:Array.isArray(memberships)?memberships:[]};
}

function membershipFor(memberships,businessId){
  return memberships.find(row=>row.business_id===businessId&&row.status==='active')||null;
}

function idsFilter(ids){
  const clean=[...new Set(ids.map(safeId).filter(Boolean))];
  return clean.length?`(${clean.map(enc).join(',')})`:null;
}

async function workspace(req,ctx){
  const businessId=safeId(singleQueryValue(req,'business_id'));
  if(!businessId)throw Object.assign(new Error('BUSINESS_ID_REQUIRED'),{status:400});
  const membership=membershipFor(ctx.memberships,businessId);
  if(!membership)throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'),{status:403});

  const requestedBranch=singleQueryValue(req,'branch_id');
  const fetchRows=(path,code)=>rest(ctx.token,path,code);
  const scope=await resolveBranchScope({
    businessId,
    membership,
    userId:ctx.user.id,
    requestedBranch,
    fetchRows,
  });
  const suffix=branchFilter(scope);

  const [businessRows,conversations,appointments]=await Promise.all([
    rest(ctx.token,`dabbir_businesses?select=id,slug,name,business_type,locale,demo_mode,country_code,currency_code,timezone,phone_country_prefix,created_at,updated_at&id=eq.${enc(businessId)}&limit=1`,'BUSINESS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_conversations?select=id,branch_id,customer_id,channel_type,state,demo_mode,created_at,updated_at&business_id=eq.${enc(businessId)}${suffix}&channel_type=eq.web&order=updated_at.desc&limit=50`,'CONVERSATIONS_LOOKUP_FAILED'),
    rest(ctx.token,`dabbir_appointments?select=id,branch_id,customer_id,service_id,worker_id,starts_at,ends_at,status,simulated,created_at,updated_at&business_id=eq.${enc(businessId)}${suffix}&order=starts_at.desc&limit=100`,'APPOINTMENTS_LOOKUP_FAILED'),
  ]);
  const business=businessRows?.[0]||null;
  if(!business)throw Object.assign(new Error('BUSINESS_NOT_FOUND'),{status:404});

  const conversationIds=idsFilter((conversations||[]).map(row=>row.id));
  const customerIds=idsFilter([
    ...(conversations||[]).map(row=>row.customer_id),
    ...(appointments||[]).map(row=>row.customer_id),
  ]);
  const requestedConversation=safeId(singleQueryValue(req,'conversation_id'));
  let selectedConversationId=requestedConversation&&conversations?.some(row=>row.id===requestedConversation)?requestedConversation:null;
  if(!selectedConversationId)selectedConversationId=conversations?.[0]?.id||null;

  const [customers,handoffs,followups,messages]=await Promise.all([
    customerIds?rest(ctx.token,`dabbir_customers?select=id,display_name,phone_e164,lead_status,metadata,created_at,updated_at&business_id=eq.${enc(businessId)}&id=in.${customerIds}&order=updated_at.desc&limit=200`,'CUSTOMERS_LOOKUP_FAILED'):[],
    conversationIds?rest(ctx.token,`dabbir_handoffs?select=id,conversation_id,customer_id,route_class,reason,state,priority,summary,created_at,updated_at&business_id=eq.${enc(businessId)}&conversation_id=in.${conversationIds}&order=updated_at.desc&limit=100`,'HANDOFFS_LOOKUP_FAILED'):[],
    conversationIds?rest(ctx.token,`dabbir_followups?select=id,conversation_id,customer_id,channel_type,reason,status,due_at,recommended_message,blocked_reason,created_at,updated_at&business_id=eq.${enc(businessId)}&conversation_id=in.${conversationIds}&order=updated_at.desc&limit=100`,'FOLLOWUPS_LOOKUP_FAILED'):[],
    selectedConversationId?rest(ctx.token,`dabbir_messages?select=id,conversation_id,sender_type,body,intent,simulated,created_at&business_id=eq.${enc(businessId)}&conversation_id=eq.${enc(selectedConversationId)}&order=created_at.asc&limit=100`,'MESSAGES_LOOKUP_FAILED'):[],
  ]);

  const ai=getDABBIRAiConfig();
  return {
    ok:true,
    authenticated:true,
    user:ctx.user,
    needs_onboarding:false,
    operational_mode:'AUTHENTICATED_BRANCH_RUNTIME',
    truth_mode:'FAIL_CLOSED_BRANCH_SCOPED_READS',
    membership,
    memberships:ctx.memberships,
    business,
    branch_scope:{
      mode:scope.mode,
      branch_id:scope.branch_id,
      branch_ids:scope.branch_ids,
      branch:scope.branch,
      all_allowed:scope.all_allowed,
      source:'SERVER_RLS_BRANCH_SCOPE',
    },
    conversations:Array.isArray(conversations)?conversations:[],
    selected_conversation_id:selectedConversationId,
    messages:Array.isArray(messages)?messages:[],
    customers:Array.isArray(customers)?customers:[],
    appointments:Array.isArray(appointments)?appointments:[],
    handoffs:Array.isArray(handoffs)?handoffs:[],
    followups:Array.isArray(followups)?followups:[],
    ai:{
      provider:ai.provider,
      model:ai.model,
      configured:ai.configured,
      cost_mode:ai.cost_mode,
      state:ai.configured?'OPERATIONAL_PROVIDER_READY':'UNCONFIGURED',
    },
    whatsapp:{state:'NOT_OPERATIONAL',blocker:'META_AUTHORIZATION_NOT_COMPLETED'},
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{allow:'GET'});
  const ctx=await identity(req);
  if(!ctx)return json(res,401,{ok:false,authenticated:false,error:'AUTH_REQUIRED'});
  try{
    const payload=await workspace(req,ctx);
    res.setHeader('x-dabbir-branch-scope',payload.branch_scope?.mode||'unknown');
    return json(res,200,payload);
  }catch(error){
    const status=Number(error?.status||500);
    const safe=[400,401,403,404,409,429,502,503].includes(status)?status:500;
    return json(res,safe,{ok:false,error:String(error?.message||'BRANCH_WORKSPACE_FAILED'),detail:error?.detail||null});
  }
}
