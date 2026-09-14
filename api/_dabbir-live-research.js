import { gateway, generateText } from 'ai';

export const LIVE_RESEARCH_VERSION='vercel-gateway-exa-v1';
export const LIVE_RESEARCH_MODEL=process.env.DABBIR_LIVE_RESEARCH_MODEL||'openai/gpt-5.6-sol';
const MAX_QUERY=500;
const MAX_RESULTS=12;
const MAX_DOMAINS=8;

const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

function safeDomain(value){
  const raw=clean(value,180).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].split(':')[0];
  if(!raw||raw.length>180||!raw.includes('.')||!/^[a-z0-9.-]+$/.test(raw))return null;
  return raw;
}

export function normalizeResearchInput(input={}){
  const query=clean(input.query,MAX_QUERY);
  const numResults=Math.min(MAX_RESULTS,Math.max(1,Math.trunc(Number(input.num_results)||6)));
  const domains=Array.isArray(input.include_domains)?[...new Set(input.include_domains.map(safeDomain).filter(Boolean))].slice(0,MAX_DOMAINS):[];
  const category=['company','people','research paper','news','personal site','financial report'].includes(String(input.category||''))?String(input.category):undefined;
  return {query,numResults,domains,category};
}

function collectSources(value,acc=new Map(),depth=0){
  if(depth>7||value==null)return acc;
  if(Array.isArray(value)){for(const item of value)collectSources(item,acc,depth+1);return acc}
  if(typeof value!=='object')return acc;
  const url=clean(value.url||value.uri||value.href,2000);
  if(/^https:\/\//i.test(url)){
    const key=url.replace(/#.*$/,'').replace(/\/$/,'');
    if(!acc.has(key))acc.set(key,{url:key,title:clean(value.title||value.name,300)||null});
  }
  for(const nested of Object.values(value))collectSources(nested,acc,depth+1);
  return acc;
}

export function extractResearchSources(result){
  const found=new Map();
  collectSources(result?.sources,found);
  collectSources(result?.staticToolResults,found);
  collectSources(result?.steps,found);
  return [...found.values()].slice(0,20);
}

export async function runVercelLiveResearch(input={},deps={gateway,generateText}){
  const normalized=normalizeResearchInput(input);
  if(!normalized.query)throw Object.assign(new Error('RESEARCH_QUERY_REQUIRED'),{status:400});
  if(!deps?.gateway?.tools||typeof deps.gateway.tools.exaSearch!=='function')throw Object.assign(new Error('VERCEL_EXA_TOOL_UNAVAILABLE'),{status:503});

  const exaOptions={
    type:'fast',
    numResults:normalized.numResults,
    userLocation:'AE',
    contents:{highlights:true,maxAgeHours:1},
    ...(normalized.domains.length?{includeDomains:normalized.domains}:{}),
    ...(normalized.category?{category:normalized.category}:{}),
  };

  const result=await deps.generateText({
    model:LIVE_RESEARCH_MODEL,
    temperature:0,
    maxOutputTokens:700,
    prompt:[
      'You are DABBIR live research. You MUST call exa_search before answering.',
      'Use only the retrieved web evidence for factual claims. Never invent a source or URL.',
      'Return a concise evidence-first answer. Mention uncertainty when retrieved evidence is insufficient.',
      `Research query: ${normalized.query}`,
    ].join('\n'),
    tools:{exa_search:deps.gateway.tools.exaSearch(exaOptions)},
    toolChoice:{type:'tool',toolName:'exa_search'},
    providerOptions:{gateway:{disallowPromptTraining:true,tags:['feature:dabbir-live-research','source:exa']}},
  });

  const sources=extractResearchSources(result);
  if(!sources.length)throw Object.assign(new Error('LIVE_RESEARCH_NO_SOURCE_EVIDENCE'),{status:502});
  return {
    ok:true,
    state:'E2E_VERIFIED_READ',
    truth:'external_live_evidence',
    source:'vercel_ai_gateway_exa',
    version:LIVE_RESEARCH_VERSION,
    model:LIVE_RESEARCH_MODEL,
    query:normalized.query,
    answer:clean(result?.text,5000),
    sources,
    source_count:sources.length,
    provider_tool:'exa_search',
    values_exposed:false,
  };
}
