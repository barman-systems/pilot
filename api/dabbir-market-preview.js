import { readFileSync } from 'node:fs';

const PREVIEW_HTML=readFileSync(new URL('../try.html',import.meta.url),'utf8')
  .replace('299 AED','39.99 AED')
  .replace('/ رقم أو موقع شهريًا','/ النشاط الأساسي شهريًا')
  .replace('<li>14 يومًا بلا بطاقة</li>','<li>14 يومًا بلا بطاقة</li><li>إضافة نشاط: 29.99 AED/شهر</li><li>إضافة فرع: 19.99 AED/شهر</li>');

const HEADERS={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
};

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'}));
  }
  for(const [key,value] of Object.entries(HEADERS))res.setHeader(key,value);
  res.setHeader('x-dabbir-market-preview','car-wash-killer-job-v3-pricing');
  res.statusCode=200;
  return res.end(PREVIEW_HTML);
}
