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
const UI_BUNDLE_VERSION = '20260831-settings-mobile-v4';
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
  setInterval(()=>{if(document.querySelector('#appointmentModal.open'))syncMin()},30000);
  setTimeout(syncMin,0);
})();
</script>`;

const SETTINGS_MOBILE_REDESIGN = `<style id="dabbir-settings-mobile-v4">
@media (max-width:700px){
  #screen-settings.active{
    padding-inline:10px!important;
    padding-bottom:112px!important;
  }
  #screen-settings .dabbir-knowledge-card{
    margin:8px 0 0!important;
    padding:0!important;
    border:0!important;
    border-radius:0!important;
    background:transparent!important;
    box-shadow:none!important;
    overflow:visible!important;
  }
  #screen-settings .dk-head{
    padding:10px 4px 12px!important;
    margin-bottom:8px!important;
    border:0!important;
    border-bottom:1px solid #242a31!important;
    background:transparent!important;
    align-items:center!important;
  }
  #screen-settings .dk-head h2{
    font-size:16px!important;
    letter-spacing:0!important;
  }
  #screen-settings .dk-head p{
    display:none!important;
  }
  #screen-settings .dk-state{
    padding:5px 8px!important;
    font-size:9px!important;
  }
  #screen-settings .dk-form{
    padding:0!important;
  }
  #screen-settings .dk-sections{
    gap:10px!important;
  }
  #screen-settings .dk-section{
    padding:13px 12px!important;
    border:1px solid #293039!important;
    border-radius:16px!important;
    background:#101419!important;
    box-shadow:0 1px 0 rgba(255,255,255,.02) inset!important;
  }
  #screen-settings .dk-section-head{
    margin-bottom:10px!important;
  }
  #screen-settings .dk-section-head h3{
    font-size:14px!important;
    font-weight:850!important;
    color:#f2f4f7!important;
  }
  #screen-settings .dk-section-head span{
    font-size:9px!important;
  }
  #screen-settings .dk-grid{
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:10px!important;
  }
  #screen-settings .dk-field{
    gap:5px!important;
  }
  #screen-settings .dk-field.wide,
  #screen-settings .dk-field[data-key="about_business"],
  #screen-settings .dk-field[data-key="business_hours"],
  #screen-settings .dk-field[data-key="business_location"],
  #screen-settings .dk-field[data-key="contact_email"],
  #screen-settings .dk-field[data-key="payment_methods"],
  #screen-settings .dk-field[data-key="delivery_policy"],
  #screen-settings .dk-field[data-key="return_policy"],
  #screen-settings .dk-field[data-key="booking_policy"]{
    grid-column:1/-1!important;
  }
  #screen-settings .dk-field>label{
    font-size:11px!important;
    font-weight:800!important;
    color:#bcc6d2!important;
  }
  #screen-settings .dk-field>input,
  #screen-settings .dk-field>textarea{
    min-height:44px!important;
    padding:9px 11px!important;
    border-radius:11px!important;
    border-color:#303842!important;
    background:#171c22!important;
    font-size:16px!important;
  }
  #screen-settings .dk-field>textarea{
    min-height:66px!important;
  }
  #screen-settings .dk-field[data-key="about_business"]>textarea{
    min-height:72px!important;
  }
  #screen-settings .dk-field[data-key="delivery_policy"]>textarea,
  #screen-settings .dk-field[data-key="return_policy"]>textarea,
  #screen-settings .dk-field[data-key="booking_policy"]>textarea{
    min-height:64px!important;
  }
  #screen-settings .dk-hours-wrap,
  #screen-settings .dk-payments-wrap{
    padding:0!important;
    border:0!important;
    background:transparent!important;
    border-radius:0!important;
  }
  #screen-settings .dk-hours-help,
  #screen-settings .dk-payments-help{
    margin:0 0 8px!important;
    font-size:10px!important;
    line-height:1.55!important;
    color:#77818d!important;
  }
  #screen-settings .dk-hours-tools{
    gap:6px!important;
    margin-bottom:8px!important;
  }
  #screen-settings .dk-hours-tools button{
    min-height:32px!important;
    padding:5px 9px!important;
    border-radius:9px!important;
    font-size:10px!important;
  }
  #screen-settings .dk-hours-list{
    gap:6px!important;
  }
  #screen-settings .dk-hours-row{
    grid-template-columns:minmax(96px,.85fr) minmax(0,1fr) minmax(0,1fr)!important;
    gap:6px!important;
    align-items:end!important;
    min-height:48px!important;
    padding:6px 7px!important;
    border-radius:11px!important;
    background:#151a20!important;
    border-color:#27303a!important;
  }
  #screen-settings .dk-hours-row:not(.is-open){
    grid-template-columns:1fr!important;
    min-height:44px!important;
  }
  #screen-settings .dk-hours-row:not(.is-open) .dk-time{
    display:none!important;
  }
  #screen-settings .dk-day-toggle{
    grid-column:auto!important;
    min-height:36px!important;
    gap:7px!important;
    align-items:center!important;
    font-size:11px!important;
  }
  #screen-settings .dk-field .dk-day-toggle input{
    width:34px!important;
    min-width:34px!important;
    max-width:34px!important;
    height:20px!important;
    min-height:20px!important;
    max-height:20px!important;
    padding:0!important;
    border-radius:999px!important;
    flex:0 0 34px!important;
  }
  #screen-settings .dk-time{
    display:flex!important;
    flex-direction:column!important;
    gap:3px!important;
    min-width:0!important;
  }
  #screen-settings .dk-time span{
    font-size:8px!important;
    line-height:1!important;
  }
  #screen-settings .dk-field .dk-time input{
    width:100%!important;
    min-width:0!important;
    height:36px!important;
    min-height:36px!important;
    max-height:36px!important;
    padding:3px 5px!important;
    border-radius:9px!important;
    font-size:13px!important;
    direction:ltr!important;
  }
  #screen-settings .dk-payment-options{
    display:grid!important;
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:7px!important;
  }
  #screen-settings .dk-payment-option{
    width:100%!important;
    min-height:38px!important;
    padding:7px 9px!important;
    border-radius:11px!important;
    font-size:11px!important;
    line-height:1.25!important;
    text-align:center!important;
  }
  #screen-settings .dk-actions{
    gap:7px!important;
    padding-top:10px!important;
  }
  #screen-settings .dk-actions .primary{
    min-height:46px!important;
    border-radius:12px!important;
  }
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
        ? body.replace('</body>', `<script src="/dabbir-ui-critical.js?v=${UI_BUNDLE_VERSION}"></script>\n` + OWNER_FIRST_UI_BOOTSTRAP + '\n' + UI_BUNDLE_LOADER + '\n' + BOOKING_TIME_GUARD + '\n' + SETTINGS_MOBILE_REDESIGN + '\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}