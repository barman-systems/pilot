import {runTurnUnderstandingShadowV3,v3ShadowSummary} from './_dabbir-turn-understanding-v3.js';

const clean=(v,n=160)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
const SHADOW_MODES=new Set(['shadow','canary','active']);

function shadowNow(context){
  const raw=context?.batch?.last_message_at||context?.batch_messages?.at(-1)?.created_at;
  const at=raw?new Date(raw):new Date();
  return Number.isNaN(at.getTime())?new Date():at;
}

export function createV3ShadowObserver({context,rpc,logger=console}){
  let firstLoad=null,observedProposal=null;
  const captureProposal=proposal=>{observedProposal=proposal||null;return proposal;};
  const wrappedRpc=async(name,args)=>{
    if(name==='dabbir_semantic_load_v2'){
      const result=await rpc(name,args);
      if(!firstLoad)firstLoad=result;
      return result;
    }
    if(name==='dabbir_semantic_commit_v2'&&SHADOW_MODES.has(firstLoad?.cognitive_policy?.mode)){
      // Every Phase-1 shadow error is real and observable, but none is allowed
      // to alter the visible legacy response or block its commit.
      try{
        const shadow=runTurnUnderstandingShadowV3({
          context:{...context,...(firstLoad||{})},
          previousState:firstLoad?.semantic_state||{},
          legacyState:args?.p_state||{},
          proposal:observedProposal,
          now:shadowNow(context),
        });
        const summary=v3ShadowSummary(shadow);
        const record={event:'DABBIR_V3_TURN_SHADOW',stage:'PRECOMMIT',version:1,rollout_mode:firstLoad?.cognitive_policy?.mode||null,batch_id:clean(context?.batch?.id||args?.p_batch_id,80),ok:summary.ok===true,...summary};
        if(summary.ok===true)logger.info?.(JSON.stringify(record));
        else logger.error?.(JSON.stringify(record));
      }catch(error){
        try{logger.error?.(JSON.stringify({event:'DABBIR_V3_TURN_SHADOW',stage:'PRECOMMIT',version:1,rollout_mode:firstLoad?.cognitive_policy?.mode||null,batch_id:clean(context?.batch?.id||args?.p_batch_id,80),ok:false,retention_ok:false,error:{code:clean(error?.code||error?.message||'V3_SHADOW_OBSERVER_ERROR',120)}}));}catch{}
      }
    }
    return rpc(name,args);
  };
  return {rpc:wrappedRpc,captureProposal};
}
