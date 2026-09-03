import brandUiHandler from './brand-ui.js';
import { publicMarketProfiles } from './_market-core.js';

const serializedMarkets=JSON.stringify(publicMarketProfiles()).replace(/</g,'\\u003c');
const script=String.raw`(()=>{
  if(window.__dabbirGccReadinessLoaded)return;
  window.__dabbirGccReadinessLoaded=true;

  const GCC=Object.freeze(${serializedMarkets});
  const baseFetch=window.fetch.bind(window);
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase()!=='en';
  const selectedCountry=()=>{
    const select=document.querySelector('#businessCountry');
    const value=String(select?.value||localStorage.getItem('dabbir_country')||'AE').toUpperCase();
    return GCC[value]?value:'AE';
  };
  const profileFor=code=>GCC[String(code||'').toUpperCase()]||GCC.AE;
  const localeFor=(code,language)=>String(language||'').toLowerCase().startsWith('en')?'en-'+code:'ar-'+code;

  function copy(){return ar()?{
    country:'الدولة',currency:'العملة',derived:'تُحدد العملة تلقائيًا حسب الدولة ولا يمكن اختيارها بشكل منفصل.',profile:'إعدادات الدولة',timezone:'المنطقة الزمنية',phone:'مفتاح الهاتف'
  }:{
    country:'Country',currency:'Currency',derived:'Currency is set automatically from the selected country and cannot be chosen separately.',profile:'Country settings',timezone:'Time zone',phone:'Phone prefix'
  }}

  function refreshCountryField(){
    const select=document.querySelector('#businessCountry');
    if(!select)return;
    const c=copy();
    const label=document.querySelector('#businessCountryLabel');if(label)label.textContent=c.country;
    [...select.options].forEach(option=>{const p=GCC[option.value];if(p)option.textContent=ar()?p.ar:p.en});
    const code=selectedCountry();const p=GCC[code];
    const derived=document.querySelector('#businessCurrencyDerived');
    if(derived)derived.textContent=c.currency+': '+p.currency+' · '+p.timezone+' · '+p.prefix;
    const hint=document.querySelector('#businessCurrencyHint');if(hint)hint.textContent=c.derived;
  }

  function ensureOnboarding(){
    const form=document.querySelector('#businessForm');
    if(!form||document.querySelector('#businessCountry')){refreshCountryField();return}
    const submit=document.querySelector('#setupSubmit');
    const field=document.createElement('div');field.className='field';field.id='businessCountryField';
    const label=document.createElement('label');label.id='businessCountryLabel';label.htmlFor='businessCountry';
    const select=document.createElement('select');select.id='businessCountry';select.required=true;select.autocomplete='country';
    for(const code of Object.keys(GCC)){const option=document.createElement('option');option.value=code;select.append(option)}
    const saved=String(localStorage.getItem('dabbir_country')||'AE').toUpperCase();select.value=GCC[saved]?saved:'AE';
    const derived=document.createElement('div');derived.id='businessCurrencyDerived';derived.className='muted';derived.style.cssText='font-size:12px;margin-top:7px;font-weight:800';
    const hint=document.createElement('div');hint.id='businessCurrencyHint';hint.className='muted';hint.style.cssText='font-size:11px;line-height:1.5;margin-top:3px';
    field.append(label,select,derived,hint);
    if(submit)form.insertBefore(field,submit);else form.append(field);
    select.addEventListener('change',()=>{localStorage.setItem('dabbir_country',selectedCountry());refreshCountryField()});
    refreshCountryField();
  }

  async function enrichRuntimeResponse(response){
    if(!response?.ok)return response;
    let payload;try{payload=await response.clone().json()}catch{return response}
    const businessId=payload?.business?.id;
    if(!businessId)return response;
    try{
      const profileResponse=await baseFetch('/api/gcc-business-profile?business_id='+encodeURIComponent(businessId),{cache:'no-store',headers:{accept:'application/json'}});
      const profilePayload=await profileResponse.json().catch(()=>null);
      if(!profileResponse.ok||!profilePayload?.profile)return response;
      payload.business={...payload.business,...profilePayload.profile};
      const headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/json; charset=utf-8');
      return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
    }catch{return response}
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(method==='POST'&&url.startsWith('/api/dabbir-runtime')){
      let body=null;try{body=typeof init?.body==='string'?JSON.parse(init.body):null}catch{}
      if(body?.action==='create_business'){
        const code=selectedCountry();
        localStorage.setItem('dabbir_country',code);
        const next={...body,country_code:code,locale:localeFor(code,body.locale)};
        return baseFetch('/api/gcc-create-business',{...init,body:JSON.stringify(next)});
      }
    }
    const response=await baseFetch(input,init);
    if(method==='GET'&&url.startsWith('/api/dabbir-runtime'))return enrichRuntimeResponse(response);
    return response;
  };

  function currentBusiness(){try{return typeof workspace!=='undefined'&&workspace?.business?workspace.business:null}catch{return null}}
  function currentGeo(){const b=currentBusiness();const code=String(b?.country_code||'AE').toUpperCase();const base=profileFor(code);return {...base,...b,country_code:code,currency:b?.currency_code||base.currency,timezone:b?.timezone||base.timezone,prefix:b?.phone_country_prefix||base.prefix}}
  function runtimeLocale(){const g=currentGeo();return (ar()?'ar-':'en-')+g.country_code}
  function formatTime(value){
    if(!value)return '—';
    const g=currentGeo();
    try{return new Intl.DateTimeFormat(runtimeLocale(),{dateStyle:'medium',timeStyle:'short',timeZone:g.timezone}).format(new Date(value))}catch{return String(value)}
  }
  function localTimeToIso(value){
    const raw=String(value||'').trim();if(!raw)return null;
    if(/[zZ]$|[+-]\\d\\d:\\d\\d$/.test(raw)){const d=new Date(raw);return Number.isNaN(d.getTime())?null:d.toISOString()}
    const normalized=raw.length===16?raw+':00':raw;const d=new Date(normalized+currentGeo().offset);return Number.isNaN(d.getTime())?null:d.toISOString();
  }
  function money(value){
    const g=currentGeo();const n=Number(value||0);
    try{return new Intl.NumberFormat(runtimeLocale(),{style:'currency',currency:g.currency,maximumFractionDigits:Number(g.minorUnits??3)}).format(n)}catch{return n.toFixed(Number(g.minorUnits??2))+' '+g.currency}
  }

  function reassertAuthorities(){
    const g=currentGeo();
    window.__dabbirTimeZone=g.timezone;window.dabbirFormatTime=formatTime;window.dabbirLocalTimeToIso=localTimeToIso;window.dabbirFormatMoney=money;
    try{fmt=formatTime}catch{}
    document.documentElement.dataset.dabbirCountry=g.country_code;
    document.documentElement.dataset.dabbirCurrency=g.currency;
    document.documentElement.dataset.dabbirTimezone=g.timezone;

    const selectors=['#adaptiveApptFields label','.dk-payments-help','.dk-payment-option','.ownerOperations label','.serviceOperations label'];
    document.querySelectorAll(selectors.join(',')).forEach(node=>{
      if(node.closest?.('.messages'))return;
      let text=String(node.textContent||'');
      text=text.replace(/AED/g,g.currency);
      if(ar()&&g.country_code!=='AE')text=text.replace(/درهم/g,g.moneyAr);
      if(text!==node.textContent)node.textContent=text;
    });

    const settings=document.querySelector('#settingsList');
    if(settings&&currentBusiness()){
      let row=document.querySelector('#dabbirGccProfileSummary');
      if(!row){row=document.createElement('div');row.id='dabbirGccProfileSummary';row.className='item';settings.prepend(row)}
      const c=copy();const countryName=ar()?profileFor(g.country_code).ar:profileFor(g.country_code).en;
      row.innerHTML='<div class="grow"><b>'+c.profile+'</b><small>'+countryName+' · '+g.currency+' · '+g.timezone+' · '+g.prefix+'</small></div><span class="badge green">'+g.country_code+'</span>';
    }
  }

  ensureOnboarding();
  new MutationObserver(()=>{refreshCountryField();reassertAuthorities()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const lifecycle=window.__dabbirUiLifecycle;
  if(lifecycle?.on){
    lifecycle.on('afterRender','gcc-readiness-v1',()=>{reassertAuthorities()});
    lifecycle.on('afterNavigate','gcc-readiness-v1',()=>{reassertAuthorities()});
  }
  document.addEventListener('click',event=>{if(event.target?.closest?.('#newApptBtn,#quickAppt,[data-screen="settings"]'))setTimeout(reassertAuthorities,0)},true);
  setTimeout(()=>{ensureOnboarding();reassertAuthorities()},0);
})();`;

function captureBrandUi(req){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const proxy={
      statusCode:200,
      setHeader(){},
      end(body=''){
        if(settled)return;
        settled=true;
        if(this.statusCode!==200)return reject(Object.assign(new Error('BRAND_UI_COMPOSITION_FAILED'),{status:this.statusCode}));
        resolve(String(body||''));
      },
    };
    Promise.resolve(brandUiHandler(req,proxy)).then(()=>{if(!settled){settled=true;reject(new Error('BRAND_UI_EMPTY_RESPONSE'))}}).catch(reject);
  });
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;res.setHeader('allow','GET');return res.end('Method Not Allowed');
  }
  try{
    const brandScript=await captureBrandUi(req);
    res.statusCode=200;
    res.setHeader('content-type','application/javascript; charset=utf-8');
    res.setHeader('cache-control','no-store');
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('x-dabbir-gcc-readiness','market-registry-v2-composed-brand-slot');
    return res.end(brandScript+'\n'+script);
  }catch(error){
    res.statusCode=Number(error?.status||500);
    res.setHeader('content-type','application/javascript; charset=utf-8');
    res.setHeader('cache-control','no-store');
    return res.end('throw new Error("DABBIR_GCC_CRITICAL_UI_COMPOSITION_FAILED")');
  }
}
