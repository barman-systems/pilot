import { readFileSync } from 'node:fs';

const BOOKING_HTML=readFileSync(new URL('../booking.html', import.meta.url), 'utf8');
const GCC_PUBLIC_BOOKING_SCRIPT='<script src="/api/gcc-public-booking-ui" defer></script>';
const BOOKING_PAGE=BOOKING_HTML.replace('</body>',`${GCC_PUBLIC_BOOKING_SCRIPT}</body>`);
const HEADERS={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'permissions-policy':'camera=(self), geolocation=(self), microphone=(), payment=()',
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
  res.setHeader('x-dabbir-booking-page','public-v1.2-gcc-authority');
  res.statusCode=200;
  return res.end(BOOKING_PAGE);
}
