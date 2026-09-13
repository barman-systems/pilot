const TRANSIENT_PROVIDER_STATUSES=new Set([0,408,425,429,500,502,503,504]);

function providerRows(body){
  const direct=Array.isArray(body?.providers)?body.providers:[];
  const nested=Array.isArray(body?.results)?body.results.flatMap(row=>Array.isArray(row?.providers)?row.providers:[]):[];
  return [...direct,...nested];
}

function transientTelemetry(telemetry){
  const attempts=Array.isArray(telemetry?.attempts)?telemetry.attempts:[];
  return attempts.length>0&&attempts.every(attempt=>TRANSIENT_PROVIDER_STATUSES.has(Number(attempt?.status??0)));
}

export function classifyProviderNoise(response){
  const status=Number(response?.status||0),body=response?.json||{};
  if(status===0||status===429)return true;
  const rows=providerRows(body),errored=rows.filter(row=>row?.error);
  const transientProviderFailure=errored.length>0&&errored.every(row=>transientTelemetry(row?.telemetry));
  if(status===502&&body?.error==='AI_PLANNER_UNAVAILABLE')return true;
  if([502,503,504].includes(status)&&transientProviderFailure)return true;
  return false;
}

export function cognitiveCheckResult(response,{checkCount=null,expectedKeys=null,requireCognitiveProbe=false}={}){
  const body=response?.json||{},checks=body?.checks&&typeof body.checks==='object'?body.checks:{};
  const keys=Object.keys(checks),required=Array.isArray(expectedKeys)?expectedKeys:keys;
  const failedChecks=required.filter(key=>checks[key]!==true);
  const shapeOk=(checkCount==null||keys.length===checkCount)&&(!expectedKeys||expectedKeys.every(key=>Object.hasOwn(checks,key)));
  const pass=Boolean(response?.ok&&body?.ok===true&&body?.external_side_effects===false&&shapeOk&&failedChecks.length===0&&(!requireCognitiveProbe||body?.cognitive_probe===true));
  return {pass,failedChecks,checks};
}

export async function runCognitiveGate({request,scenario,checkCount=null,expectedKeys=null,requireCognitiveProbe=false,maxAttempts=3,repeatedFailureThreshold=2,sleepFn=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const attempts=[];let validFailures=0,lastResponse=null;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const response=await request(scenario);lastResponse=response;
    const noise=classifyProviderNoise(response),check=cognitiveCheckResult(response,{checkCount,expectedKeys,requireCognitiveProbe});
    attempts.push({attempt,http_status:response?.status??0,classification:noise?'PROVIDER_NOISE':check.pass?'PASS':'COGNITIVE_FAILURE',failed_checks:check.failedChecks,providers:providerRows(response?.json||{}).map(row=>({provider:row?.provider??null,model:row?.model??null,error:row?.error??null,telemetry:row?.telemetry??null}))});
    if(noise){if(attempt<maxAttempts)await sleepFn(1200*attempt);continue;}
    if(check.pass)return {classification:attempt===1?'PASS':'PASS_AFTER_RETRY',response,attempts,valid_failures:validFailures};
    validFailures++;
    if(validFailures>=repeatedFailureThreshold)return {classification:'COGNITIVE_FAILURE',response,attempts,valid_failures:validFailures};
    if(attempt<maxAttempts)await sleepFn(1200*attempt);
  }
  return {classification:validFailures>=repeatedFailureThreshold?'COGNITIVE_FAILURE':'PROVIDER_NOISE',response:lastResponse,attempts,valid_failures:validFailures};
}
