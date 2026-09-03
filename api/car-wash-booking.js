import { readFileSync } from 'node:fs';

const BOOKING_HTML=readFileSync(new URL('../booking.html', import.meta.url), 'utf8');
const BOOKING_INTERFACE_HARDENING=`<style id="dabbir-public-booking-hardening-v1">
.eyebrow,.vehicle span,.offer p,.offer .duration,.day,.empty,.field label,.locationBox p,.summary span,.summary strong,.msg,.mapLink,.footer{font-size:12px!important;line-height:1.55}
.vehicle strong,.offer strong{font-size:15px!important}
.section>p,.hero p{font-size:13px!important}
.slot{min-height:44px!important;font-size:13px!important}
.lang button{min-height:44px!important}
button{touch-action:manipulation}
@media(max-width:650px){
  input,textarea{font-size:16px!important}
  .vehicle,.offer,.secondary,.primary{min-height:48px!important}
  .slots{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .wrap{padding-bottom:calc(40px + env(safe-area-inset-bottom))!important}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>`;
const BOOKING_PAGE=BOOKING_HTML.replace('</head>',`${BOOKING_INTERFACE_HARDENING}</head>`);
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
  res.setHeader('x-dabbir-booking-page','public-v1.1-interface-hardening');
  res.statusCode=200;
  return res.end(BOOKING_PAGE);
}
