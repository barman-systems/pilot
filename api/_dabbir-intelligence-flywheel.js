import { retrieveDabbirKnowledge } from './_dabbir-knowledge-rag.js';
import { resolveCapabilityShadow, capabilityShadowVerdict } from './_dabbir-capability-registry.js';

const clean=(value,max=1400)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
export function safeKnowledgeContext(rows=[]){return (Array.isArray(rows)?rows:[]).slice(0,5).map(row=>({knowledge_key:clean(row.knowledge_key,180),knowledge_type:clean(row.knowledge_type,80),content:clean(row.content,1200),score:Number(row.score)||0})).filter(x=>x.content)}
export async function plannerIntelligenceContext({businessId,query,intent,action,activityType,rpc,env=process.env,fetchImpl=fetch}={}){
  const [knowledge,capability]=await Promise.all([
    retrieveDabbirKnowledge({businessId,query,rpc,env,fetchImpl,limit:5}),
    resolveCapabilityShadow({rpc,intent,action,activityType}),
  ]);
  return {retrieved_business_knowledge:safeKnowledgeContext(knowledge),capability_shadow:capability};
}
export function evaluateCapabilityShadow(decision,capabilityResult){return capabilityShadowVerdict({decision,capabilities:capabilityResult?.capabilities||[]})}
export async function mineProductionFailures({rpc,since='7 days'}={}){
  if(typeof rpc!=='function')throw new Error('FLYWHEEL_RPC_REQUIRED');
  const result=await rpc('dabbir_ai_failure_mine_v1',{p_since:since});
  return result&&typeof result==='object'?result:{ok:false,error:'FLYWHEEL_RESULT_INVALID'};
}
