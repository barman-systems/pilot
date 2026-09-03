import appHandler from './app.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://*.facebook.com https://*.fbcdn.net; font-src 'self' data:; connect-src 'self' https://graph.facebook.com https://www.facebook.com https://web.facebook.com; frame-src https://www.facebook.com https://web.facebook.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://connect.facebook.net",
};

// config/dabbir-ui-bundles.json is the single source of truth for module order.
// Do not duplicate that list here: a stale second list previously allowed architecture
// tests and the browser-delivered bundle to describe different UI compositions.
// Change this token whenever shell or generated-bundle behavior changes so Safari
// cannot reuse a previous presentation layer after deployment.
const UI_BUNDLE_VERSION = '20260903-interface-hardening-v1';

// The auth gate is visible before #appShell. Its owner-first presentation layer must
// therefore load independently of the workspace-only deferred bundle; otherwise
// mobile WebKit can observe an uninitialised authority during first paint.
const OWNER_FIRST_UI_BOOTSTRAP = `<script src="/api/dabbir-owner-first-ui?v=${UI_BUNDLE_VERSION}"></script>`;

const UI_BUNDLE_LOADER = `<script>
(()=>{
  window.__dabbirCriticalUiReady=true;
  const load=()=>{
    if(!window.__dabbirCriticalUiReady||window.__dabbirDeferredUiRequested)return;
    window.__dabbirDeferredUiRequested=true;
    const script=document.createElement('script');
    script.src='/dabbir-ui-deferred.js?v=${UI_BUNDLE_VERSION}';
    script.async=false;
    script.dataset.dabbirDeferredUi='true';
    script.onload=()=>{window.__dabbirDeferredUiReady=true};
    document.body.appendChild(script);
  };
  window.__dabbirLoadDeferredUi=load;
  if(document.querySelector('#appShell:not(.hidden)')) load();
})();
</script>`;

const BOOKING_TIME_GUARD = `<script>
(()=>{
  if(window.__dabbirBookingTimeGuard)return;
  window.__dabbirBookingTimeGuard=true;
  const TZ='Asia/Dubai';
  const OFFSET='+04:00';

  function copy(){
    const ar=String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
    return ar
      ? {past:'لا يمكن إنشاء حجز في وقت مضى. اختر الوقت الحالي أو وقتًا لاحقًا.'}
      : {past:'Bookings cannot be created in the past. Choose the current time or a later time.'};
  }

  function dubaiMinute(date=new Date()){
    const fmt=new Intl.DateTimeFormat('en-CA',{
      timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    });
    const parts=Object.fromEntries(fmt.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
  }

  function selectedMs(value){
    const raw=String(value||'').trim();
    if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/.test(raw))return NaN;
    return new Date(raw.slice(0,16)+':00'+OFFSET).getTime();
  }

  function currentMinuteMs(){return Math.floor(Date.now()/60000)*60000}

  function syncMin(){
    const input=document.querySelector('#apptTime');
    if(!input)return;
    const min=dubaiMinute();
    if(input.min!==min)input.min=min;
    if(input.value&&selectedMs(input.value)<currentMinuteMs())input.value='';
    input.setCustomValidity('');
  }

  function rejectPast(event){
    const input=document.querySelector('#apptTime');
    if(!input)return;
    syncMin();
    if(!input.value)return;
    if(selectedMs(input.value)>=currentMinuteMs())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const message=copy().past;
    input.setCustomValidity(message);
    try{input.reportValidity()}catch{}
    try{if(typeof toast==='function')toast(message)}catch{}
    setTimeout(()=>input.setCustomValidity(''),50);
  }

  document.addEventListener('focusin',event=>{if(event.target?.id==='apptTime')syncMin()},true);
  document.addEventListener('click',event=>{
    if(event.target?.id==='newApptBtn'||event.target?.id==='apptTime'||event.target?.id==='crmNewBooking')setTimeout(syncMin,0);
  },true);
  document.addEventListener('submit',event=>{if(event.target?.id==='appointmentForm')rejectPast(event)},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncMin()});
  setTimeout(syncMin,0);
})();
</script>`;

// Shell-level usability invariants only. Feature layout remains owned by its existing
// UI authority; this layer prevents unreadable text/tap targets and iOS zoom regressions.
const INTERFACE_HARDENING = `<style id="dabbir-interface-hardening-v1">
button,[role="button"],.navBtn,#bottomNav button,#bottomNav a{touch-action:manipulation}
.side>.brand small,.workspace span,.statusChip,.hero p,.metric span,.truth,.integration p,.chatContact span,.d4-sender,.authMsg,.authCard p{font-size:12px!important;line-height:1.5!important}
.dac-brief{font-size:13px!important;line-height:1.65!important}
@media(max-width:700px){
  input:not([type="checkbox"]):not([type="radio"]),select,textarea{font-size:16px!important}
  button,[role="button"],.navBtn,#bottomNav button,#bottomNav a,.lang button{min-height:44px!important}
  .content,.screen,.card,.integration,.chatGrid,.grid2,.cards{min-width:0;max-width:100%}
  .table{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .bottomNav,#bottomNav{padding-bottom:calc(8px + env(safe-area-inset-bottom))!important}
  body.dabbir-settings-approved .dsa-open-state small,
  body.dabbir-settings-approved .dk-hours-help,
  body.dabbir-settings-approved .dk-payments-help,
  body.dabbir-settings-approved .dk-msg,
  body.dabbir-settings-approved #bottomNav>button,
  body.dabbir-settings-approved #bottomNav>a{font-size:12px!important;line-height:1.45!important}
  body.dabbir-settings-approved .dk-hours-tools button{min-height:44px!important;font-size:12px!important}
  body.dabbir-settings-approved .dk-day-toggle{min-height:44px!important;font-size:13px!important}
  body.dabbir-settings-approved .dk-time input{min-height:44px!important;height:44px!important;font-size:16px!important}
  body.dabbir-settings-approved .dk-payment-option{min-height:48px!important;font-size:13px!important}
  body.dabbir-settings-approved .dk-actions .primary{min-height:48px!important}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}
</style>`;

function forwardHeaders(res, headers) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}

export default function handler(req, res) {
  let statusCode = 200;
  const headers = {};

  const proxy = {
    status(code) {
      statusCode = Number(code || 200);
      return proxy;
    },
    setHeader(key, value) {
      headers[String(key)] = value;
      return proxy;
    },
    end(body = '') {
      forwardHeaders(res, headers);
      res.setHeader('x-dabbir-shell-authority', 'owner-first-v4');
      res.setHeader('x-dabbir-owner-experience', 'verified-copilot-v1.3-workspace-compat');
      res.statusCode = statusCode;
      return res.end(body);
    },
    send(body = '') {
      forwardHeaders(res, headers);
      res.setHeader('x-dabbir-shell-authority', 'owner-first-v4');
      res.setHeader('x-dabbir-owner-experience', 'verified-copilot-v1.3-workspace-compat');
      res.statusCode = statusCode;
      const html = typeof body === 'string'
        ? body.replace('</body>', `<script src="/dabbir-ui-critical.js?v=${UI_BUNDLE_VERSION}"></script>\n` + OWNER_FIRST_UI_BOOTSTRAP + '\n' + UI_BUNDLE_LOADER + '\n' + BOOKING_TIME_GUARD + '\n' + INTERFACE_HARDENING + '\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}
