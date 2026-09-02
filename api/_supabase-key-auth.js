export function isLegacySupabaseJwtKey(value){
  const key=String(value||'').trim();
  return key.split('.').length===3;
}

export function supabaseKeyHeaders(value,extra={}){
  const key=String(value||'').trim();
  const headers={apikey:key,...extra};
  if(isLegacySupabaseJwtKey(key)&&!headers.authorization)headers.authorization=`Bearer ${key}`;
  return headers;
}

export function applySupabaseKeyHeaders(headers,value){
  const key=String(value||'').trim();
  headers.set('apikey',key);
  if(isLegacySupabaseJwtKey(key))headers.set('authorization',`Bearer ${key}`);
  else headers.delete('authorization');
  return headers;
}
