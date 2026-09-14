import {
  processWhatsAppVoiceDispatchToken as processCoreDispatchToken,
  processWhatsAppVoiceRecovery as processCoreRecovery,
  transcribeWhatsAppVoiceAudio as transcribeCoreAudio,
} from './_dabbir-whatsapp-voice.js';
import { createAiProviderAuthorityFetch } from './_ai-provider-authority-fetch.js';

export * from './_dabbir-whatsapp-voice.js';

function optionsWithAuthority(options={}){
  const env=options.env||process.env;
  const trace=[];
  const fetchImpl=createAiProviderAuthorityFetch({
    env,
    fetchImpl:options.fetchImpl||globalThis.fetch,
    healthStore:options.providerHealthStore,
    trace,
  });
  return {...options,env,fetchImpl};
}

export async function transcribeWhatsAppVoiceAudio(audioBuffer,mimeType,options={}){
  return transcribeCoreAudio(audioBuffer,mimeType,optionsWithAuthority(options));
}

export async function processWhatsAppVoiceDispatchToken(dispatchToken,options={}){
  return processCoreDispatchToken(dispatchToken,optionsWithAuthority(options));
}

export async function processWhatsAppVoiceRecovery(options={}){
  return processCoreRecovery(optionsWithAuthority(options));
}
