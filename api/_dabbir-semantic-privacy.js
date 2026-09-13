// Last-mile provider boundary. Operational identifiers and credentials are not
// useful for interpreting customer language, even when pasted into a message.
export function sanitizeSemanticText(value) {
  return String(value ?? '')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[REDACTED_KEY]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:sk-(?:proj-)?|sb_secret_|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{8,}/g, '[REDACTED_KEY]')
    .replace(/\b(?:access[_ -]?token|api[_ -]?key|password|secret|authorization)\s*[=:]\s*["']?[^\s,;"'}]+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[INTERNAL_REFERENCE]')
    .replace(/\[DABBIR_WHATSAPP_LOCATION[^\]]*\]/g, '[WHATSAPP_LOCATION]')
    .replace(/📍\s*موقع واتساب:[^\n]*/g, '[WHATSAPP_LOCATION]')
    .slice(0,4000);
}

export function sanitizeSemanticContext(value, depth=0) {
  if(depth>8)return null;
  if(typeof value==='string')return sanitizeSemanticText(value);
  if(value==null||typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value))return value.slice(0,20).map(x=>sanitizeSemanticContext(x,depth+1));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40)
    .filter(([key])=>!/(?:token|secret|password|api_key|authorization|latitude|longitude)/i.test(key))
    .map(([key,v])=>[key,sanitizeSemanticContext(v,depth+1)]));
  return null;
}
