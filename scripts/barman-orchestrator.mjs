const BROKER='https://dabbir.bmalman.com/api/barman-orchestrator-broker';
const AUDIENCE='barman-executive-orchestrator';
const clean=(v,max=4000)=>String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);

async function oidc(){
  const url=String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
  const token=String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||'');
  if(!url||!token)throw new Error('GITHUB_OIDC_UNAVAILABLE');
  const sep=url.includes('?')?'&':'?';
  const response=await fetch(`${url}${sep}audience=${encodeURIComponent(AUDIENCE)}`,{headers:{authorization:`bearer ${token}`},signal:AbortSignal.timeout(15000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.value)throw new Error(`GITHUB_OIDC_HTTP_${response.status}`);
  return payload.value;
}
async function broker(body){
  const response=await fetch(BROKER,{method:'POST',headers:{authorization:`Bearer ${await oidc()}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload?.ok!==true)throw new Error(`BROKER_${response.status}_${clean(payload?.error||'FAILED',300)}`);
  return payload;
}

async function processLane(lane){
  const claim=await broker({phase:'claim',lane});
  if(claim.claimed!==true)return false;
  const command=claim.command||{};
  const ids={command_id:String(command.id||''),run_id:String(claim.run_id||''),action_id:String(claim.action_id||'')};
  if(lane==='planner'){
    const result=await broker({phase:'plan',...ids,command:String(command.command_text||'')});
    console.log('PLANNED',JSON.stringify({command_id:ids.command_id,child_count:result?.tasks?.length||0,state:result?.delegated?.state||'UNKNOWN'}));
    return true;
  }
  if(lane==='read_only'){
    const result=await broker({phase:'read_data',...ids,command:String(command.command_text||'')});
    console.log('READ_DONE',JSON.stringify({command_id:ids.command_id,summary:clean(result?.summary,500)}));
    return true;
  }
  throw new Error('LANE_UNSUPPORTED');
}

try{
  let processed=0;
  for(let i=0;i<4;i++){
    const planned=await processLane('planner');
    if(planned){processed++;continue}
    const read=await processLane('read_only');
    if(read){processed++;continue}
    break;
  }
  console.log(`BARMAN orchestrator cycle complete. processed=${processed}`);
}catch(error){
  console.error('BARMAN_ORCHESTRATOR_FAILED',clean(error?.stack||error?.message||error,1800));
  process.exitCode=1;
}
