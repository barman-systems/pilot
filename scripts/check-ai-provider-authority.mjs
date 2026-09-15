import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MODEL_ENDPOINT_HINTS=[
  'generativelanguage.googleapis.com',
  'api.groq.com',
  '/ai/v1/chat/completions',
  '/ai/run/',
  'ai-gateway.vercel.sh/v1/chat/completions',
];
const DIRECT_NAMED_PROVIDER_CALL=/\b(?:fetch|fetchImpl|fetchBounded)\s*\(\s*(?:GATEWAY_ENDPOINT|GEMINI_ENDPOINT|GROQ_ENDPOINT|provider\.endpoint|config\.endpoint)\b/;
const DIRECT_GENERIC_ENDPOINT_CALL=/\b(?:fetch|fetchImpl|fetchBounded)\s*\(\s*endpoint\b/;
const DIRECT_LITERAL_PROVIDER_CALL=/\b(?:fetch|fetchImpl|fetchBounded)\s*\(\s*[`'\"]https:\/\/(?:generativelanguage\.googleapis\.com\/(?:v1beta\/openai\/chat\/completions|v1beta\/models\/[^`'\"]+:(?:generateContent|embedContent))|api\.groq\.com\/openai\/v1\/chat\/completions|api\.cloudflare\.com\/client\/v4\/accounts\/[^`'\"]+\/ai\/(?:v1\/chat\/completions|run\/[^`'\"]+)|ai-gateway\.vercel\.sh\/v1\/chat\/completions)/;
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
  if(DIRECT_NAMED_PROVIDER_CALL.test(text)||DIRECT_LITERAL_PROVIDER_CALL.test(text))return true;
  return MODEL_ENDPOINT_HINTS.some(hint=>text.includes(hint))&&DIRECT_GENERIC_ENDPOINT_CALL.test(text);
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

function readSource(root,file){
  const full=path.join(root,String(file||''));
  return file&&fs.existsSync(full)?fs.readFileSync(full,'utf8'):'';
}

function validateCostAuthority(errors,costCapabilities,provider){
  const entries=costCapabilities[provider];
  if(!Array.isArray(entries)||entries.length<1){errors.push(`${provider}: provider has no AI Capability Registry cost authority`);return;}
  for(const key of entries)if(!/^ai\.provider\.[a-z0-9_.]+$/.test(String(key)))errors.push(`${provider}: invalid cost capability key ${key}`);
}

export function validateRoutingAuthorityContract(registry={},sources={}){
  const errors=[];
  const version=String(registry?.version||'');
  if(!/^DABBIR_AI_PROVIDER_RELIABILITY_AUTHORITY_V[1-9]\d*$/.test(version)){
    errors.push('registry: reliability authority version must use the canonical monotonic V<n> format');
  }

  const readinessAuthority=String(registry?.routing_readiness_authority||'');
  if(readinessAuthority!=='api/_ai-provider-readiness.js'){
    errors.push('registry: routing readiness authority must remain api/_ai-provider-readiness.js');
  }

  const routing=registry?.automatic_generation_routing||{};
  if(routing.primary!=='vercel-ai-gateway')errors.push('registry: Vercel AI Gateway must remain the automatic generation primary');
  if(routing.direct_recovery_readiness!==readinessAuthority){
    errors.push('registry: direct recovery readiness must delegate to the single routing readiness authority');
  }
  if(routing.diagnostic_credentials_do_not_imply_recovery!==true){
    errors.push('registry: diagnostic credentials must not imply automatic generation recovery');
  }
  if(routing.gemini_generation_recovery_production_state!=='RETIRED'){
    errors.push('registry: Gemini automatic generation recovery must remain retired in Production');
  }
  if(routing.gemini_diagnostic_capability_retained!==true){
    errors.push('registry: Gemini diagnostic/direct capability must remain explicitly retained');
  }
  if(registry?.invariants?.configured_credential_counts_as_automatic_recovery!==false){
    errors.push('registry: configured credentials cannot count as automatic recovery authority');
  }
  if(registry?.invariants?.health_readiness_uses_routing_readiness_authority!==true){
    errors.push('registry: public health/readiness must use the routing readiness authority');
  }

  const readinessSource=String(sources[readinessAuthority]||'');
  if(!readinessSource)errors.push(`${readinessAuthority||'routing readiness authority'}: missing protected source`);
  else{
    for(const marker of ['providerRoutingReadiness','configuredAutomaticRecoveryProviders','configuredDiagnosticDirectProviders','geminiAutomaticGenerationRecoveryEnabled','gatewayPrimaryConfigured','DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED','return !gatewayPrimaryConfigured(env);']){
      if(!readinessSource.includes(marker))errors.push(`${readinessAuthority}: missing routing contract marker ${marker}`);
    }
  }

  const coreSource=String(sources['api/_ai-core.js']||'');
  if(!coreSource)errors.push('api/_ai-core.js: missing protected source');
  else{
    for(const marker of ['geminiAutomaticGenerationRecoveryEnabled',"from './_ai-provider-readiness.js'",'delete recoveryEnv.GEMINI_API_KEY']){
      if(!coreSource.includes(marker))errors.push(`api/_ai-core.js: missing automatic recovery authority marker ${marker}`);
    }
    if(coreSource.includes('DABBIR_GEMINI_GENERATION_RECOVERY_ENABLED'))errors.push('api/_ai-core.js: Gemini recovery policy duplicated outside routing readiness authority');
    if(/function\s+geminiAutomaticRecoveryEnabled\s*\(/.test(coreSource))errors.push('api/_ai-core.js: legacy local Gemini recovery decision reintroduced');
  }

  const publicReadinessSource=String(sources['api/dabbir-ai.js']||'');
  if(!publicReadinessSource)errors.push('api/dabbir-ai.js: missing protected source');
  else{
    if(!publicReadinessSource.includes('providerRoutingReadiness'))errors.push('api/dabbir-ai.js: public readiness bypasses routing readiness authority');
    if(publicReadinessSource.includes('getDABBIRAiRedundancy'))errors.push('api/dabbir-ai.js: legacy credential-count redundancy authority reintroduced');
    for(const marker of ['automatic_recovery_providers','diagnostic_direct_providers']){
      if(!publicReadinessSource.includes(marker))errors.push(`api/dabbir-ai.js: missing truthful readiness marker ${marker}`);
    }
  }

  return errors;
}

export function checkProviderAuthority(root=ROOT){
  const registryPath=path.join(root,'config/ai-provider-authority-registry.json');
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const errors=[];

  const reliabilityProviders=registry.providers||[];
  const directProviders=registry.direct_providers||[];
  const gatewayProvider=String(registry.gateway_provider||'').trim();
  const costCapabilities=registry.cost_capabilities||{};
  if(registry.cost_registry_version!=='DABBIR_AI_PROVIDER_COST_REGISTRY_V1')errors.push('registry: cost registry version must remain V1');
  if(!reliabilityProviders.includes('vercel-ai-gateway'))errors.push('registry: Vercel AI Gateway must remain a reliability provider');
  if(directProviders.includes('vercel-ai-gateway'))errors.push('registry: Vercel AI Gateway must not be classified as a direct provider');
  for(const provider of directProviders)validateCostAuthority(errors,costCapabilities,provider);
  if(gatewayProvider!=='vercel-ai-gateway')errors.push('gateway_provider must remain vercel-ai-gateway');
  else validateCostAuthority(errors,costCapabilities,gatewayProvider);
  if(Number(registry?.cost_policy?.hard_monthly_budget_aed)!==300)errors.push('AI provider cost policy must retain the 300 AED hard monthly budget');
  if(registry?.cost_policy?.unpriced_direct_usage!=='FAIL_CLOSED_BEFORE_PAID_FALLBACK')errors.push('unpriced direct provider usage must fail closed before paid fallback');

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

  requireContains(errors,root,'api/_ai-provider-reliability.js',['AI_PROVIDER_ATTEMPT_TYPES','RECOVERY_PROBE_REQUIRED','attempt_type','customer_probe_network_attempts']);
  requireContains(errors,root,'api/_ai-provider-recovery.js',['RECOVERY_PROBE','Reply exactly OK.','max_tokens:4','reliableAiProviderFetch']);
  requireContains(errors,root,'api/dabbir-ai-provider-recovery-cron.js',["./_ai-provider-recovery.js",'CRON_AUTH_REQUIRED']);
  requireContains(errors,root,'api/_ai-core.js',['reliableAiProviderFetch','createSupabaseProviderHealthStore','provider_reliability']);
  requireContains(errors,root,'api/_dabbir-whatsapp-ai-meter.js',['provider_reliability','skipped_attempts','attempt_type','dabbir_record_ai_usage_v1','AI_USAGE_METER_UNVERIFIED','DIRECT_PROVIDER_RESULT_REJECTED']);
  requireContains(errors,root,'api/_dabbir-daily-operator-core.js',['dabbir_record_ai_usage_v1','DIRECT_PROVIDER_COST_UNPRICED']);
  requireContains(errors,root,'api/_dabbir-daily-operator-reliable.js',['recordDirectEnhancementUsage','FREE_DIRECT_METER_UNVERIFIED','AI_USAGE_METER_UNVERIFIED']);
  requireContains(errors,root,'api/_dabbir-whatsapp-voice.js',['dabbir_record_ai_usage_v1','DIRECT_PROVIDER_COST_UNPRICED','VOICE_USAGE_METER_UNVERIFIED']);
  requireContains(errors,root,'api/_dabbir-ai-budget.js',['directMonthlyExposureSpend','DIRECT_PROVIDER_SPEND_UNVERIFIED']);
  const meter=fs.readFileSync(path.join(root,'api/_dabbir-whatsapp-ai-meter.js'),'utf8');
  if(/providerCooldowns|provider429Strikes|armProviderCooldown|cooldownKey/.test(meter))errors.push('api/_dabbir-whatsapp-ai-meter.js: process-local provider circuit reintroduced');
  requireContains(errors,root,'api/_dabbir-knowledge-rag.js',['createAiProviderAuthorityFetch','authorityFetch(config.endpoint','dabbir_record_ai_usage_v1','EMBEDDING_USAGE_METER_UNVERIFIED']);
  requireContains(errors,root,'api/_barman-executive-core.js',['createAiProviderAuthorityFetch','authorityFetch(GATEWAY_ENDPOINT']);
  requireContains(errors,root,'api/_barman-executive-automation.js',['createAiProviderAuthorityFetch','authorityFetch(GATEWAY_ENDPOINT']);
  requireContains(errors,root,'api/barman-tool-agent-broker.js',['createAiProviderAuthorityFetch','authorityFetch(GATEWAY_ENDPOINT']);
  requireContains(errors,root,'api/dabbir-daily-operator-cron.js',["./_dabbir-daily-operator-reliable.js"]);
  requireContains(errors,root,'api/dabbir-whatsapp-voice-worker.js',["./_dabbir-whatsapp-voice-reliable.js"]);
  requireContains(errors,root,'api/dabbir-whatsapp-ai-cron.js',["./_dabbir-whatsapp-voice-reliable.js"]);

  if(registry.invariants?.customer_can_acquire_probe_lease!==false)errors.push('registry: customer probe lease must be forbidden');
  if(registry.invariants?.customer_network_probe_allowed!==false)errors.push('registry: customer network probes must be forbidden');
  if(registry.background_recovery?.attempt_type!=='RECOVERY_PROBE')errors.push('registry: background recovery attempt type must be RECOVERY_PROBE');
  if(registry.background_recovery?.required_successes_to_healthy!==2)errors.push('registry: recovery hysteresis must require two successful probes');

  const routingSources={
    [registry.routing_readiness_authority]:readSource(root,registry.routing_readiness_authority),
    'api/_ai-core.js':readSource(root,'api/_ai-core.js'),
    'api/dabbir-ai.js':readSource(root,'api/dabbir-ai.js'),
  };
  errors.push(...validateRoutingAuthorityContract(registry,routingSources));

  for(const [file,entry] of Object.entries(registry.diagnostic_exemptions||{})){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    if(!/PRODUCTION_FORBIDDEN/.test(source))errors.push(`${file}: diagnostic exemption lacks a production-forbidden guard`);
    if(!fs.existsSync(path.join(root,entry.entrypoint)))errors.push(`${file}: diagnostic entrypoint missing`);
    if(!fs.existsSync(path.join(root,entry.workflow)))errors.push(`${file}: diagnostic workflow missing`);
  }

  return {
    ok:errors.length===0,
    errors,
    scanned_api_files:apiFiles.length,
    registry_version:registry.version,
    cost_registry_version:registry.cost_registry_version,
    routing_contract:{
      readiness_authority:registry.routing_readiness_authority,
      primary:registry.automatic_generation_routing?.primary||null,
      gemini_generation_recovery_production_state:registry.automatic_generation_routing?.gemini_generation_recovery_production_state||null,
      diagnostic_credentials_do_not_imply_recovery:registry.automatic_generation_routing?.diagnostic_credentials_do_not_imply_recovery===true,
    },
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=checkProviderAuthority(ROOT);
  if(!result.ok){for(const error of result.errors)console.error(`AI_PROVIDER_AUTHORITY_VIOLATION: ${error}`);process.exit(1);}
  console.log(`AI provider authority guard passed (${result.scanned_api_files} api files, ${result.registry_version}, ${result.cost_registry_version}).`);
}
