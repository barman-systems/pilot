const EMBEDDING_DIMENSIONS=768;
const DEFAULT_MODEL='gemini-embedding-2';
const DEFAULT_ENDPOINT='https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max=16000)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,max);
const ragEnabled=env=>['1','true'].includes(String(env?.DABBIR_KNOWLEDGE_RAG_ENABLED||'').trim().toLowerCase());
function failureCode(error){
  const code=String(error?.code||error?.message||'');
  if(/^(?:EMBEDDING_PROVIDER_[45][0-9]{2}|EMBEDDING_CONTRACT_INVALID|EMBEDDING_TEXT_EMPTY|EMBEDDING_MODEL_UNAPPROVED|GEMINI_API_KEY_MISSING|KNOWLEDGE_ID_INVALID|KNOWLEDGE_SCOPE_INVALID|DABBIR_KNOWLEDGE_HASH_MISMATCH|KNOWLEDGE_UPSERT_UNVERIFIED)$/.test(code))return code;
  if(['AbortError','TimeoutError'].includes(error?.name))return 'RAG_TIMEOUT';
  return 'RAG_DEPENDENCY_FAILED';
}

export function knowledgeDocumentInstruction({title,content}={}){
  return `title: ${clean(title,220)||'none'} | text: ${clean(content,15000)}`;
}
export function knowledgeQueryInstruction(query){return `task: search result | query: ${clean(query,1200)}`}
export function embeddingConfiguration(env=process.env){
  const key=clean(env.GEMINI_API_KEY,8192),model=clean(env.DABBIR_EMBEDDING_MODEL||DEFAULT_MODEL,120);
  if(!key)return {ok:false,reason:'GEMINI_API_KEY_MISSING'};
  if(model!==DEFAULT_MODEL)return {ok:false,reason:'EMBEDDING_MODEL_UNAPPROVED'};
  return {ok:true,key,model,endpoint:DEFAULT_ENDPOINT,dimensions:EMBEDDING_DIMENSIONS};
}
function vectorFromPayload(payload){
  const values=payload?.embedding?.values||payload?.embeddings?.[0]?.values;
  if(!Array.isArray(values)||values.length!==EMBEDDING_DIMENSIONS)return null;
  const vector=values.map(Number);return vector.every(Number.isFinite)?vector:null;
}
export async function embedKnowledgeText(text,{env=process.env,fetchImpl=fetch,timeoutMs=12000}={}){
  const config=embeddingConfiguration(env);if(!config.ok)throw Object.assign(new Error(config.reason),{code:config.reason});
  const content=clean(text,16000);if(!content)throw Object.assign(new Error('EMBEDDING_TEXT_EMPTY'),{code:'EMBEDDING_TEXT_EMPTY'});
  const response=await fetchImpl(config.endpoint,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':config.key},
    body:JSON.stringify({content:{parts:[{text:content}]},output_dimensionality:EMBEDDING_DIMENSIONS}),signal:AbortSignal.timeout(Math.min(20000,Math.max(1000,timeoutMs)))});
  const raw=await response.text();let payload=null;try{payload=raw?JSON.parse(raw):null}catch{}
  if(!response.ok)throw Object.assign(new Error(`EMBEDDING_PROVIDER_${response.status}`),{code:`EMBEDDING_PROVIDER_${response.status}`,status:response.status});
  const vector=vectorFromPayload(payload);if(!vector)throw Object.assign(new Error('EMBEDDING_CONTRACT_INVALID'),{code:'EMBEDDING_CONTRACT_INVALID'});
  return vector;
}
export function vectorSqlText(vector){
  if(!Array.isArray(vector)||vector.length!==EMBEDDING_DIMENSIONS||!vector.every(Number.isFinite))throw new Error('EMBEDDING_VECTOR_INVALID');
  return `[${vector.map(value=>Number(value).toString()).join(',')}]`;
}
export async function retrieveDabbirKnowledge({businessId,query,rpc,env=process.env,fetchImpl=fetch,limit=5}={}){
  if(!UUID.test(String(businessId||''))||typeof rpc!=='function'||!clean(query,1200))return [];
  if(!ragEnabled(env))return [];
  const started=Date.now();
  const diagnose=code=>console.warn('dabbir_knowledge_retrieval_failed',{business_id:businessId,code,provider:'gemini',model:DEFAULT_MODEL,latency_ms:Date.now()-started});
  const config=embeddingConfiguration(env);if(!config.ok){diagnose(config.reason);return []}
  try{
    const vector=await embedKnowledgeText(knowledgeQueryInstruction(query),{env,fetchImpl,timeoutMs:2500});
    const rows=await rpc('dabbir_knowledge_hybrid_search_v1',{p_business_id:businessId,p_query:clean(query,1200),p_embedding_text:vectorSqlText(vector),p_limit:Math.min(8,Math.max(1,Number(limit)||5))});
    return (Array.isArray(rows)?rows:[]).slice(0,8).map(row=>({
      knowledge_key:clean(row?.knowledge_key,180),knowledge_type:clean(row?.knowledge_type,80),content:clean(row?.content,1400),
      score:Number.isFinite(Number(row?.score))?Number(row.score):0,
    })).filter(row=>row.content&&row.score>=0);
  }catch(error){diagnose(failureCode(error));return []}
}
export async function indexApprovedKnowledge({rpc,env=process.env,fetchImpl=fetch,limit=12}={}){
  if(typeof rpc!=='function')throw new Error('RAG_RPC_REQUIRED');
  if(!ragEnabled(env))return {ok:false,state:'SKIPPED',reason:'DISABLED',indexed:0,failed:0};
  const config=embeddingConfiguration(env);if(!config.ok)return {ok:false,state:'SKIPPED',reason:config.reason,indexed:0,failed:0};
  const queue=await rpc('dabbir_knowledge_embedding_queue_v1',{p_limit:Math.min(30,Math.max(1,Number(limit)||12))});
  const rows=Array.isArray(queue)?queue:[];let indexed=0,failed=0;const error_codes={};
  for(const row of rows){
    try{
      if(!UUID.test(String(row?.knowledge_id||'')))throw new Error('KNOWLEDGE_ID_INVALID');
      if(!UUID.test(String(row?.business_id||'')))throw new Error('KNOWLEDGE_SCOPE_INVALID');
      const instruction=knowledgeDocumentInstruction({title:row?.title,content:row?.content});
      const vector=await embedKnowledgeText(instruction,{env,fetchImpl});
      // The queue hashes the original database content. Normalizing whitespace here
      // changes those bytes and makes the database reject every multiline document.
      const saved=await rpc('dabbir_knowledge_embedding_upsert_v1',{p_knowledge_id:row.knowledge_id,p_content:row.content,p_content_hash:row.content_hash,p_embedding_text:vectorSqlText(vector),p_model:DEFAULT_MODEL});
      if(saved?.ok!==true||saved.knowledge_id!==row.knowledge_id||saved.business_id!==row.business_id||saved.content_hash!==row.content_hash)throw new Error('KNOWLEDGE_UPSERT_UNVERIFIED');
      indexed++;
    }catch(error){failed++;const code=failureCode(error);error_codes[code]=(error_codes[code]||0)+1;}
  }
  return {ok:failed===0,state:failed?'PARTIAL':'COMPLETE',queued:rows.length,indexed,failed,error_codes,model:DEFAULT_MODEL,dimensions:EMBEDDING_DIMENSIONS};
}
