import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PROVIDER_HOSTS=[
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.cloudflare.com',
  'ai-gateway.vercel.sh',
];
const DIRECT_CALL_PATTERNS=[
  /\b(?:fetch|fetchImpl|fetchBounded)\s*\(\s*(?:GATEWAY_ENDPOINT|GEMINI_ENDPOINT|GROQ_ENDPOINT|provider\.endpoint|config\.endpoint|endpoint)\b/,
  /\b(?:fetch|fetchImpl|fetchBounded)\s*\(\s*[`'\"]https:\/\/(?:generativelanguage\.googleapis\.com|api\.groq\.com|api\.cloudflare\.com|ai-gateway\.vercel\.sh)/,
];
const normalize=value=>String(value).split(path.sep).join('/');

function walk(dir){
  const out=[];
  if(!fs.existsSync(dir))return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else if(entry.isFile()&&/\.(?:js|mjs)$/.test(entry.name))out.push(full);
  }
  return out;
}

export function detectDirectProviderTransport(source=''){
  const text=String(source);
  if(!PROVIDER_HOSTS.some(host=>text.includes(host)))return false;
  return DIRECT_CALL_PATTERNS.some(pattern=>pattern.test(text));
}

function importSpecifiers(source,target){
  const escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const result=[];
  const re=new RegExp(`import\\s+([\\s\\S]*?)\\s+from\\s+['\"]${escaped}['\"]`,'g');
  for(const match of source.matchAll(re))result.push(match[1]);
  return result;
}

function requireContains(errors,root,file,needles){
  const full=path.join(root,file);
  const source=fs.existsSync(full)?fs.readFileSync(full,'utf8'):'';
  if(!source){errors.push(`${file}: missing protected source`);return;}
  for(const needle of needles)if(!source.includes(needle))errors.push(`${file}: missing authority marker ${needle}`);
}

export function checkProviderAuthority(root=ROOT){
  const registryPath=path.join(root,'config/ai-provider-authority-registry.json');
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const errors=[];
  const allowedDirect=new Set([
    ...Object.keys(registry.delegated_transport_cores||{}),
    ...Object.keys(registry.diagnostic_exemptions||{}),
  ]);
  const apiRoot=path.join(root,'api');
  const apiFiles=walk(apiRoot);
  for(const full of apiFiles){
    const rel=normalize(path.relative(root,full));
    const source=fs.readFileSync(full,'utf8');
    if(detectDirectProviderTransport(source)&&!allowedDirect.has(rel)){
      errors.push(`${rel}: direct AI provider transport bypasses ${registry.authority}`);
    }
  }

  // Delegated cores are intentionally behavior-only legacy cores. Production imports
  // must go through their authority adapters; tests may import cores directly.
  const dailyTarget='./_dabbir-daily-operator-core.js';
  const voiceTarget='./_dabbir-whatsapp-voice.js';
  for(const full of apiFiles){
    const rel=normalize(path.relative(root,full));
    const source=fs.readFileSync(full,'utf8');
    for(const spec of importSpecifiers(source,dailyTarget)){
      if(rel!=='api/_dabbir-daily-operator-reliable.js')errors.push(`${rel}: imports raw daily operator provider core (${spec.trim()})`);
    }
    for(const spec of importSpecifiers(source,voiceTarget)){
      if(rel==='api/_dabbir-whatsapp-voice-reliable.js')continue;
      if(rel==='api/dabbir-whatsapp-webhook.js'&&/\bpersistSignedVoiceInbound\b/.test(spec)&&!/\b(?:transcribeWhatsAppVoiceAudio|processWhatsAppVoiceDispatchToken|processWhatsAppVoiceRecovery)\b/.test(spec))continue;
      errors.push(`${rel}: imports raw voice provider core (${spec.trim()})`);
    }
  }

  requireContains(errors,root,'api/_ai-core.js',['reliableAiProviderFetch','createSupabaseProviderHealthStore','provider_reliability']);
  requireContains(errors,root,'api/_dabbir-whatsapp-ai-meter.js',['provider_reliability','skipped_attempts']);
  const meter=fs.readFileSync(path.join(root,'api/_dabbir-whatsapp-ai-meter.js'),'utf8');
  if(/providerCooldowns|provider429Strikes|armProviderCooldown|cooldownKey/.test(meter))errors.push('api/_dabbir-whatsapp-ai-meter.js: process-local provider circuit reintroduced');
  requireContains(errors,root,'api/_dabbir-knowledge-rag.js',['createAiProviderAuthorityFetch','authorityFetch(config.endpoint']);
  requireContains(errors,root,'api/_barman-executive-core.js',['createAiProviderAuthorityFetch','authorityFetch(GATEWAY_ENDPOINT']);
  requireContains(errors,root,'api/_barman-executive-automation.js',['createAiProviderAuthorityFetch','authorityFetch(GATEWAY_ENDPOINT']);
  requireContains(errors,root,'api/barman-tool-agent-broker.js',['createAiProviderAuthorityFetch','authorityFetch(GATEWAY_ENDPOINT']);
  requireContains(errors,root,'api/dabbir-daily-operator-cron.js',["./_dabbir-daily-operator-reliable.js"]);
  requireContains(errors,root,'api/dabbir-whatsapp-voice-worker.js',["./_dabbir-whatsapp-voice-reliable.js"]);
  requireContains(errors,root,'api/dabbir-whatsapp-ai-cron.js',["./_dabbir-whatsapp-voice-reliable.js"]);

  for(const [file,entry] of Object.entries(registry.diagnostic_exemptions||{})){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    if(!/PRODUCTION_FORBIDDEN/.test(source))errors.push(`${file}: diagnostic exemption lacks a production-forbidden guard`);
    if(!fs.existsSync(path.join(root,entry.entrypoint)))errors.push(`${file}: diagnostic entrypoint missing`);
    if(!fs.existsSync(path.join(root,entry.workflow)))errors.push(`${file}: diagnostic workflow missing`);
  }

  return {ok:errors.length===0,errors,scanned_api_files:apiFiles.length,registry_version:registry.version};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=checkProviderAuthority(ROOT);
  if(!result.ok){for(const error of result.errors)console.error(`AI_PROVIDER_AUTHORITY_VIOLATION: ${error}`);process.exit(1);}
  console.log(`AI provider authority guard passed (${result.scanned_api_files} api files, ${result.registry_version}).`);
}
