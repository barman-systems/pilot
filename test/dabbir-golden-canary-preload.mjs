import './dabbir-protected-full-journey-preload.mjs';

const PROJECT_REF=String(process.env.SUPABASE_PROJECT_REF||'fphpoysqdsceniwduxjq').trim();
const LEGACY_QA=`https://${PROJECT_REF}.supabase.co/functions/v1/barman-qa-suite-runner`;
const CANARY_QA=`https://${PROJECT_REF}.supabase.co/functions/v1/dabbir-golden-canary-qa`;
const nativeFetch=globalThis.fetch.bind(globalThis);

globalThis.fetch=(input,init)=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:String(input?.url||input);
  if(raw===LEGACY_QA||raw.startsWith(`${LEGACY_QA}?`)){
    const rewritten=raw.replace(LEGACY_QA,CANARY_QA);
    return nativeFetch(rewritten,init);
  }
  return nativeFetch(input,init);
};

console.log('DABBIR_GOLDEN_CANARY_QA_CONTROL=isolated');
