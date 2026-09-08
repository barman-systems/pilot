import { normalizeSemanticText } from './_dabbir-semantic-engine.js';

// Keep routine service discovery out of the model path. This is deliberately
// narrow: only a service-menu question is canonicalized; booking, pricing and
// mutation wording must continue through the semantic reducer unchanged.
export function isDeterministicServiceDiscovery(raw='') {
  const text=normalizeSemanticText(raw);
  if(!text||text.length>120)return false;
  if(/^(?:خدماتكم|الخدمات|services|service menu)$/.test(text))return true;
  if(/^(?:شوعندكم|وشعندكم|شو عندكم|وش عندكم)$/.test(text))return true;
  if(/^(?:شو|وش|شنو|ايش)\s+(?:تقدمون|توفرون)$/.test(text))return true;
  return /^(?:شو|وش|شنو|ايش)\s+(?:(?:هي|هيه)\s+)?(?:الخدمات|خدمات)(?:\s+(?:اللي|الي))?(?:\s+(?:عندكم|عندك+|تقدمون|توفرون))?$/.test(text)
    || /^(?:what services do you (?:have|offer)|what do you offer|what services are available)$/.test(text);
}

export function canonicalizeServiceDiscoveryMessage(message={}) {
  if(message?.catalog_service_id||!isDeterministicServiceDiscovery(message?.body))return message;
  return {...message,body:'شو عندكم'};
}
