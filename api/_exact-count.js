export function exactCount(response){
  const value=response.headers?.get?.('content-range');
  const match=/^(?:\d+-\d+|\*)\/(\d+)$/.exec(String(value||''));
  if(!match)return null;
  const count=Number(match[1]);
  return Number.isSafeInteger(count)&&count>=0?count:null;
}
