// A deliberately bounded owner-only mapping grammar, not free-form learning.
// Raw correction text never leaves this process; only alias + verified target
// enter the existing inactive proposal/audit lifecycle. Approval is separate.
const fold=value=>String(value||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').toLowerCase().replace(/\s+/g,' ').trim();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbidden=/(?:^|\s)(?:لا|ليس|ليست|مب|مو|مش|not|never|ignore|instructions?|secret|password|token|انس|تعليمات|بيانات)(?:\s|$)/iu;
function phrase(value,max){
  let text=value.trim();
  for(const [left,right] of [['"','"'],["'","'"],['«','»'],['“','”']]){
    if(text.startsWith(left)&&text.endsWith(right))text=text.slice(1,-1).trim();
  }
  if(!text||text.length>max||!/[\p{L}\p{N}]/u.test(text)||!/^[\p{L}\p{M}\p{N} _+&()\-]+$/u.test(text)||forbidden.test(fold(text)))return null;
  return text;
}
export function parseOwnerServiceCorrection(value){
  if(typeof value!=='string'||value.length>400||/[\p{Cc}\p{Cf}]/u.test(value))return null;
  const text=value.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g,'').trim().replace(/\s+/g,' ');
  const patterns=[
    /^(?:إذا|اذا|لو) قال العميل (.+?) (?:ف?نحن نقصد|ف?نقصد) (.+)$/u,
    /^(.+?) (?:يعني|تعني|المقصود به) (.+)$/u,
    /^(?:when|if) (?:a |the )?customer says (.+?),? (?:we mean|it means) (.+)$/iu,
    /^(.+?) means (.+)$/iu,
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);if(!match)continue;
    const alias=phrase(match[1],80),serviceName=phrase(match[2],160);
    // Multiple mappings/negation cannot be folded into one proposed alias.
    if(!alias||!serviceName||/(?:^|\s)(?:يعني|تعني|نقصد|means)(?:\s|$)/iu.test(alias+' '+serviceName))return null;
    return {alias,serviceName};
  }
  return null;
}
export function groundOwnerServiceCorrection(parsed,services){
  if(!parsed)return {error:'CORRECTION_FORMAT_REQUIRED'};
  // Request 201 rows to detect a truncated catalog. A prefix is not evidence
  // that a name is unique. Large catalogs use the explicit service picker.
  if(!Array.isArray(services))return {error:'KNOWLEDGE_REQUEST_FAILED'};
  if(services.length>200)return {error:'CORRECTION_USE_SERVICE_PICKER'};
  const matches=services.filter(s=>s.active===true&&UUID.test(s.id)&&fold(s.name)===fold(parsed.serviceName));
  if(matches.length!==1)return {error:matches.length?'CORRECTION_SERVICE_AMBIGUOUS':'CORRECTION_SERVICE_NOT_FOUND'};
  return {alias:parsed.alias,targetId:matches[0].id};
}
