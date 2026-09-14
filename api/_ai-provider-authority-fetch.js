import { createSupabaseProviderHealthStore, providerForAiEndpoint, reliableAiProviderFetch } from './_ai-provider-reliability.js';

const clean=(value,max=160)=>String(value??'').trim().slice(0,max);

export function modelForAiRequest(url,options={}){
  if(options?.body){
    try{
      const parsed=JSON.parse(String(options.body));
      const model=clean(parsed?.model,160);
      if(model)return model;
    }catch{}
  }
  try{
    const parsed=new URL(String(url));
    const gemini=parsed.pathname.match(/\/models\/([^/:]+)(?::|\/|$)/);
    if(gemini?.[1])return clean(decodeURIComponent(gemini[1]),160);
    const cloudflare=parsed.pathname.match(/\/ai\/run\/(.+)$/);
    if(cloudflare?.[1])return clean(decodeURIComponent(cloudflare[1]),160);
  }catch{}
  return 'unknown';
}

export function createAiProviderAuthorityFetch({env=process.env,fetchImpl=globalThis.fetch,healthStore,trace=[]}={}){
  const sharedStore=healthStore===undefined?createSupabaseProviderHealthStore({env}):healthStore;
  return async function aiProviderAuthorityFetch(url,options={}){
    const provider=providerForAiEndpoint(url);
    if(!provider)return fetchImpl(url,options);
    return reliableAiProviderFetch(url,options,{provider,model:modelForAiRequest(url,options),env,fetchImpl,healthStore:sharedStore,trace});
  };
}
