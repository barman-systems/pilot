import {runTurnUnderstandingShadowV3,v3ShadowSummary} from './_dabbir-turn-understanding-v3.js';

const clean=(v,n=160)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);

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
    if(name==='dabbir_semantic_commit_v2'){
      // Shadow failure is a real V3 error but must not change the currently
      // visible legacy response in Phase 1. It is recorded before the legacy
      // commit and the production path continues unchanged.
      const shadow=runTurnUnderstandingShadowV3({
        context:{...context,...(firstLoad||{})},
        previousState:firstLoad?.semantic_state||{},
        legacyState:args?.p_state||{},
        proposal:observedProposal,
        now:shadowNow(context),
      });
      const summary=v3ShadowSummary(shadow);
      const record={event:'DABBIR_V3_TURN_SHADOW',version:1,batch_id:clean(context?.batch?.id||args?.p_batch_id,80),ok:summary.ok===true,...summary};
      if(summary.ok===true)logger.info?.(JSON.stringify(record));
      else logger.error?.(JSON.stringify(record));
    }
    return rpc(name,args);
  };
  return {rpc:wrappedRpc,captureProposal};
}
