import appHandler from './app.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://*.facebook.com https://*.fbcdn.net; font-src 'self' data:; connect-src 'self' https://graph.facebook.com https://www.facebook.com https://web.facebook.com; frame-src https://www.facebook.com https://web.facebook.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://connect.facebook.net",
};

// Legacy logical authority order retained for source-level regression contracts.
// Runtime bundle composition is generated independently from config/dabbir-ui-bundles.json.
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

// Change this token whenever shell or generated-bundle behavior changes so Safari
// cannot reuse a previous presentation layer after deployment.
const UI_BUNDLE_VERSION = '20260903-chat-render-lifecycle-v3';

// One shell-level lifecycle authority owns final render/navigation/language/chat render entry points.
// Legacy modules may still wrap them during migration; reconcile() reasserts the
// outer authority without creating recursion, while older lifecycle wrappers become inert.
const UI_LIFECYCLE_BOOTSTRAP = `<script>
(()=>{
  if(window.__dabbirUiLifecycle?.version==='ui-lifecycle-v1'){
    window.__dabbirUiLifecycle.reconcile?.();
    return;
  }
  const hooks=new Map([
    ['afterRender',new Map()],
    ['afterNavigate',new Map()],
    ['afterLanguage',new Map()],
    ['afterChats',new Map()],
    ['afterMessages',new Map()]
  ]);
  const routes=new Map();
  let renderGeneration=0;
  let navigationGeneration=0;
  let languageGeneration=0;
  let chatsGeneration=0;
  let messagesGeneration=0;
  let renderWrapper=null;
  let navigationWrapper=null;
  let languageWrapper=null;
  let chatsWrapper=null;
  let messagesWrapper=null;
  let renderReconciliations=0;
  let navigationReconciliations=0;
  let languageReconciliations=0;
  let chatsReconciliations=0;
  let messagesReconciliations=0;

  function safeCurrent(){try{return typeof current==='undefined'?null:current}catch{return null}}
  function safeWorkspace(){try{return typeof workspace==='undefined'?null:workspace}catch{return null}}
  function safeLanguage(){try{return typeof lang==='undefined'?(document.documentElement.lang||null):lang}catch{return document.documentElement.lang||null}}
  function safeConversationId(){try{return typeof selectedConversationId==='undefined'?null:selectedConversationId}catch{return null}}
  function emit(event,payload){
    const group=hooks.get(event);
    if(!group)return;
    for(const [id,fn] of group){
      try{fn(payload)}catch(error){
        window.__dabbirLastUiLifecycleError={event,id,error:String(error?.message||error),at:new Date().toISOString()};
      }
    }
  }
  function resolve(requested){
    let target=String(requested||'').trim();
    for(const [id,fn] of routes){
      try{
        const next=fn(target,{requested:String(requested||''),target});
        if(next!==undefined&&next!==null&&String(next).trim())target=String(next).trim();
      }catch(error){
        window.__dabbirLastUiLifecycleError={event:'route',id,error:String(error?.message||error),at:new Date().toISOString()};
      }
    }
    return target;
  }
  function wrapRender(){
    if(typeof renderAll!=='function')return false;
    if(renderAll===renderWrapper)return true;
    const base=renderAll;
    const generation=++renderGeneration;
    const wrapper=function(){
      const result=base.apply(this,arguments);
      if(generation===renderGeneration)emit('afterRender',{current:safeCurrent(),workspace:safeWorkspace()});
      return result;
    };
    renderWrapper=wrapper;
    renderAll=wrapper;
    renderReconciliations++;
    return true;
  }
  function wrapNavigation(){
    if(typeof showScreen!=='function')return false;
    if(showScreen===navigationWrapper)return true;
    const base=showScreen;
    const generation=++navigationGeneration;
    const wrapper=function(name){
      if(generation!==navigationGeneration)return base.call(this,name);
      const requested=String(name||'').trim();
      const target=resolve(requested);
      const result=base.call(this,target);
      emit('afterNavigate',{requested,target,current:safeCurrent(),workspace:safeWorkspace()});
      return result;
    };
    navigationWrapper=wrapper;
    showScreen=wrapper;
    navigationReconciliations++;
    return true;
  }
  function wrapLanguage(){
    if(typeof applyLang!=='function')return false;
    if(applyLang===languageWrapper)return true;
    const base=applyLang;
    const generation=++languageGeneration;
    const wrapper=function(){
      const result=base.apply(this,arguments);
      if(generation===languageGeneration)emit('afterLanguage',{language:safeLanguage(),current:safeCurrent(),workspace:safeWorkspace()});
      return result;
    };
    languageWrapper=wrapper;
    applyLang=wrapper;
    languageReconciliations++;
    return true;
  }
  function wrapChats(){
    if(typeof renderChats!=='function')return false;
    if(renderChats===chatsWrapper)return true;
    const base=renderChats;
    const generation=++chatsGeneration;
    const wrapper=function(){
      const result=base.apply(this,arguments);
      if(generation===chatsGeneration)emit('afterChats',{current:safeCurrent(),workspace:safeWorkspace(),conversation_id:safeConversationId()});
      return result;
    };
    chatsWrapper=wrapper;
    renderChats=wrapper;
    chatsReconciliations++;
    return true;
  }
  function wrapMessages(){
    if(typeof renderMessages!=='function')return false;
    if(renderMessages===messagesWrapper)return true;
    const base=renderMessages;
    const generation=++messagesGeneration;
    const wrapper=function(){
      const result=base.apply(this,arguments);
      if(generation===messagesGeneration)emit('afterMessages',{current:safeCurrent(),workspace:safeWorkspace(),conversation_id:safeConversationId()});
      return result;
    };
    messagesWrapper=wrapper;
    renderMessages=wrapper;
    messagesReconciliations++;
    return true;
  }
  const api={
    version:'ui-lifecycle-v1',
    on(event,id,fn){
      if(!hooks.has(event)||!id||typeof fn!=='function')return()=>{};
      hooks.get(event).set(String(id),fn);
      return()=>hooks.get(event)?.delete(String(id));
    },
    route(id,fn){
      if(!id||typeof fn!=='function')return()=>{};
      routes.set(String(id),fn);
      return()=>routes.delete(String(id));
    },
    emit,
    resolve,
    reconcile(){
      const render=wrapRender();
      const navigation=wrapNavigation();
      const language=wrapLanguage();
      const chats=wrapChats();
      const messages=wrapMessages();
      return {render,navigation,language,chats,messages,render_reconciliations:renderReconciliations,navigation_reconciliations:navigationReconciliations,language_reconciliations:languageReconciliations,chats_reconciliations:chatsReconciliations,messages_reconciliations:messagesReconciliations};
    },
    status(){
      return {version:this.version,render_reconciliations:renderReconciliations,navigation_reconciliations:navigationReconciliations,language_reconciliations:languageReconciliations,chats_reconciliations:chatsReconciliations,messages_reconciliations:messagesReconciliations,render_hooks:hooks.get('afterRender').size,navigation_hooks:hooks.get('afterNavigate').size,language_hooks:hooks.get('afterLanguage').size,chats_hooks:hooks.get('afterChats').size,messages_hooks:hooks.get('afterMessages').size,route_resolvers:routes.size};
    }
  };
  window.__dabbirUiLifecycle=api;
  api.reconcile();
})();
</script>`;

// The auth gate is visible before #appShell. Its owner-first presentation layer must
// therefore load independently of the workspace-only deferred bundle; otherwise
// mobile WebKit can observe an uninitialised authority during first paint.
const OWNER_FIRST_UI_BOOTSTRAP = `<script src="/api/dabbir-owner-first-ui?v=${UI_BUNDLE_VERSION}"></script>`;

const UI_BUNDLE_LOADER = `<script>
(()=>{
  window.__dabbirCriticalUiReady=true;
  window.__dabbirUiLifecycle?.reconcile?.();
  const load=()=>{
    if(!window.__dabbirCriticalUiReady||window.__dabbirDeferredUiRequested)return;
    window.__dabbirDeferredUiRequested=true;
    const script=document.createElement('script');
    script.src='/dabbir-ui-deferred.js?v=${UI_BUNDLE_VERSION}';
    script.async=false;
    script.dataset.dabbirDeferredUi='true';
    script.onload=()=>{
      window.__dabbirDeferredUiReady=true;
      window.__dabbirUiLifecycle?.reconcile?.();
    };
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
  const GCC_OFFSETS={AE:'+04:00',SA:'+03:00',KW:'+03:00',QA:'+03:00',BH:'+03:00',OM:'+04:00'};

  function copy(){
    const ar=String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
    return ar
      ? {past:'لا يمكن إنشاء حجز في وقت مضى. اختر الوقت الحالي أو وقتًا لاحقًا.'}
      : {past:'Bookings cannot be created in the past. Choose the current time or a later time.'};
  }

  function businessTimeZone(){
    return String(document.documentElement.dataset.dabbirTimezone||window.__dabbirTimeZone||'Asia/Dubai');
  }

  function businessMinute(date=new Date()){
    const fmt=new Intl.DateTimeFormat('en-CA',{
      timeZone:businessTimeZone(),year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    });
    const parts=Object.fromEntries(fmt.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
  }

  function selectedMs(value){
    const raw=String(value||'').trim();
    if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/.test(raw))return NaN;
    try{
      if(typeof window.dabbirLocalTimeToIso==='function'){
        const iso=window.dabbirLocalTimeToIso(raw.slice(0,16));
        const ms=iso?new Date(iso).getTime():NaN;
        if(Number.isFinite(ms))return ms;
      }
    }catch{}
    const country=String(document.documentElement.dataset.dabbirCountry||'AE').toUpperCase();
    const offset=GCC_OFFSETS[country]||GCC_OFFSETS.AE;
    return new Date(raw.slice(0,16)+':00'+offset).getTime();
  }

  function currentMinuteMs(){return Math.floor(Date.now()/60000)*60000}

  function syncMin(){
    const input=document.querySelector('#apptTime');
    if(!input)return;
    const min=businessMinute();
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
  window.__dabbirUiLifecycle?.on?.('afterRender','booking-time-guard',syncMin);
  window.__dabbirUiLifecycle?.on?.('afterLanguage','booking-time-guard',syncMin);
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
        ? body.replace('</body>', UI_LIFECYCLE_BOOTSTRAP + `\n<script src="/dabbir-ui-critical.js?v=${UI_BUNDLE_VERSION}"></script>\n` + OWNER_FIRST_UI_BOOTSTRAP + '\n' + UI_BUNDLE_LOADER + '\n' + BOOKING_TIME_GUARD + '\n' + INTERFACE_HARDENING + '\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}
