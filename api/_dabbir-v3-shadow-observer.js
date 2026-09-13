import {runTurnUnderstandingShadowV3,v3ShadowSummary} from './_dabbir-turn-understanding-v3.js';
import {runConversationV3Shadow,v3DialogueShadowSummary} from './_dabbir-conversation-v3-pipeline.js';

const clean=(v,n=160)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
const SHADOW_MODES=new Set(['shadow','canary','active']);

function shadowNow(context){
  const raw=context?.batch?.last_message_at||context?.batch_messages?.at(-1)?.created_at;
  const at=raw?new Date(raw):new Date();
  return Number.isNaN(at.getTime())?new Date():at;
}
function logRecord(logger,record){try{(record.ok===true?logger.info:logger.error)?.(JSON.stringify(record));}catch{}}
function canPersistShadow(legacyState,shadowState){
  try{return Buffer.byteLength(JSON.stringify({...legacyState,v3_shadow:shadowState}),'utf8')<=30000;}catch{return false;}
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
      const mergedContext={...context,...(firstLoad||{})};
      // Phase 1 evidence remains stable and directly comparable with the legacy commit.
      try{
        const shadow=runTurnUnderstandingShadowV3({context:mergedContext,previousState:firstLoad?.semantic_state||{},legacyState:args?.p_state||{},proposal:observedProposal,now:shadowNow(context)});
        const summary=v3ShadowSummary(shadow);
        logRecord(logger,{event:'DABBIR_V3_TURN_SHADOW',stage:'PRECOMMIT',version:1,rollout_mode:firstLoad?.cognitive_policy?.mode||null,batch_id:clean(context?.batch?.id||args?.p_batch_id,80),ok:summary.ok===true,...summary});
      }catch(error){
        logRecord(logger,{event:'DABBIR_V3_TURN_SHADOW',stage:'PRECOMMIT',version:1,rollout_mode:firstLoad?.cognitive_policy?.mode||null,batch_id:clean(context?.batch?.id||args?.p_batch_id,80),ok:false,retention_ok:false,error:{code:clean(error?.code||error?.message||'V3_SHADOW_OBSERVER_ERROR',120)}});
      }

      let commitArgs=args;
      try{
        const dialogue=runConversationV3Shadow({context:mergedContext,canonicalState:firstLoad?.semantic_state||{},previousShadow:firstLoad?.semantic_state?.v3_shadow||null,proposal:observedProposal,now:shadowNow(context)});
        const summary=v3DialogueShadowSummary(dialogue,args?.p_state||{});
        let statePersisted=false;
        if(dialogue.ok===true&&canPersistShadow(args?.p_state||{},dialogue.state)){
          commitArgs={...args,p_state:{...(args?.p_state||{}),v3_shadow:dialogue.state}};
          statePersisted=true;
        }
        logRecord(logger,{event:'DABBIR_V3_DIALOGUE_SHADOW',stage:'PRECOMMIT',version:2,rollout_mode:firstLoad?.cognitive_policy?.mode||null,batch_id:clean(context?.batch?.id||args?.p_batch_id,80),ok:summary.ok===true,state_persisted:statePersisted,...summary});
      }catch(error){
        logRecord(logger,{event:'DABBIR_V3_DIALOGUE_SHADOW',stage:'PRECOMMIT',version:2,rollout_mode:firstLoad?.cognitive_policy?.mode||null,batch_id:clean(context?.batch?.id||args?.p_batch_id,80),ok:false,state_persisted:false,error:{code:clean(error?.code||error?.message||'V3_DIALOGUE_SHADOW_OBSERVER_ERROR',120)}});
      }
      return rpc(name,commitArgs);
    }
    return rpc(name,args);
  };
  return {rpc:wrappedRpc,captureProposal};
}
