import appHandler from './app.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://*.facebook.com https://*.fbcdn.net; font-src 'self' data:; connect-src 'self' https://graph.facebook.com https://www.facebook.com https://web.facebook.com; frame-src https://www.facebook.com https://web.facebook.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://connect.facebook.net",
};

// The source-module order remains explicit for architecture and regression tests.
// Runtime delivery is now two static bundles: critical auth UI, then deferred workspace UI.
// Change this release token whenever generated bundle behavior changes so browsers
// can keep long-lived asset caching without serving a previous UI after deployment.
const UI_BUNDLE_VERSION = '20260831-safari-mutation-loop-v2';
const UI_MODULE_ORDER = [
  '/api/brand-ui',
  '/api/dabbir-whatsapp-embedded-ui',
  '/api/dabbir-whatsapp-connect-guard-ui',
  '/api/timezone-ui',
  '/api/auth/recovery-ui',
  '/api/chat-human-ui',
  '/api/translation-ui',
  '/api/owner-operations-ui',
  '/api/service-operations-ui',
  '/api/activity-profile-ui',
  '/api/owner-action-center-ui',
  '/api/dabbir-owner-away-ui',
  '/api/dabbir-owner-decision-memory-ui',
  '/api/business-profile-ui',
  '/api/dabbir-customer-number-ui',
  '/api/dabbir-billing-ui',
  '/api/platform-customers-ui',
  '/api/platform-customer-support-ui',
  '/api/platform-recovery-reconciliation-ui',
  '/api/dabbir-owner-first-ui',
  '/api/verified-metrics-ui',
  '/api/customer-activation-ui',
  '/api/owner-copilot-ui',
  '/api/dabbir-contextual-navigation-ui',
  '/api/auth-session-stability-ui',
];

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
  setInterval(()=>{if(document.querySelector('#appointmentModal.open'))syncMin()},30000);
  setTimeout(syncMin,0);
})();
</script>`;

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
        ? body.replace('</body>', `<script src="/dabbir-ui-critical.js?v=${UI_BUNDLE_VERSION}"></script>\n` + UI_BUNDLE_LOADER + '\n' + BOOKING_TIME_GUARD + '\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}
