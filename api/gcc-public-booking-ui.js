const SCRIPT=String.raw`(()=>{
  if(window.__dabbirPublicBookingGccV1)return;
  window.__dabbirPublicBookingGccV1=true;

  const baseFetch=window.fetch.bind(window);
  const params=new URLSearchParams(location.search);
  const slug=String(params.get('slug')||params.get('booking')||'').trim();
  let profile=null;
  let profilePromise=null;

  function arabic(){return String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar')}
  function locale(){const code=String(profile?.country_code||'AE').toUpperCase();return (arabic()?'ar-':'en-')+code}
  function timezone(){return String(profile?.timezone||'Asia/Dubai')}
  function currency(){return String(profile?.currency_code||'AED')}
  function prefix(){return String(profile?.phone_country_prefix||'+971')}
  function money(value){
    const n=Number(value||0);
    try{return new Intl.NumberFormat(locale(),{style:'currency',currency:currency(),maximumFractionDigits:3}).format(n)}catch{return n.toFixed(2)+' '+currency()}
  }
  function day(value){
    try{return new Intl.DateTimeFormat(locale(),{weekday:'long',day:'numeric',month:'long',timeZone:timezone()}).format(new Date(value))}catch{return String(value)}
  }
  function time(value){
    try{return new Intl.DateTimeFormat(locale(),{hour:'numeric',minute:'2-digit',timeZone:timezone()}).format(new Date(value))}catch{return String(value)}
  }
  function dateKey(value){
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone(),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}catch{return ''}
  }

  async function ensureProfile(){
    if(profile)return profile;
    if(profilePromise)return profilePromise;
    if(!slug)return null;
    profilePromise=(async()=>{
      try{
        const response=await baseFetch('/api/public-car-wash?action=catalog&slug='+encodeURIComponent(slug),{cache:'no-store'});
        const payload=await response.json().catch(()=>null);
        const business=payload?.catalog?.business;
        if(response.ok&&payload?.ok&&business?.timezone&&business?.currency_code){
          profile=business;
          document.documentElement.dataset.dabbirCountry=String(business.country_code||'AE');
          document.documentElement.dataset.dabbirCurrency=String(business.currency_code||'AED');
          document.documentElement.dataset.dabbirTimezone=String(business.timezone||'Asia/Dubai');
          apply();
        }
      }catch{}
      return profile;
    })();
    return profilePromise;
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    if(url.includes('/api/public-car-wash')&&url.includes('action=slots')){
      await ensureProfile();
      if(profile){
        try{
          const parsed=new URL(url,location.origin);
          const now=new Date();
          parsed.searchParams.set('from_date',dateKey(now));
          parsed.searchParams.set('to_date',dateKey(new Date(now.getTime()+14*86400000)));
          const next=parsed.pathname+parsed.search;
          return baseFetch(next,init);
        }catch{}
      }
    }
    return baseFetch(input,init);
  };

  function selectedOffer(){
    const id=document.querySelector('[data-offer].selected')?.dataset?.offer;
    return profile?.offers?.find?.(row=>String(row.id)===String(id))||null;
  }
  function catalogPayload(){return window.__dabbirPublicBookingCatalog||null}
  function offerRows(){return catalogPayload()?.offers||[]}
  function currentOffer(){
    const id=document.querySelector('[data-offer].selected')?.dataset?.offer;
    return offerRows().find(row=>String(row.id)===String(id))||null;
  }
  function vehicle(){return document.querySelector('[data-vehicle].selected')?.dataset?.vehicle||null}

  function patchPrices(){
    const rows=offerRows();
    const type=vehicle();
    document.querySelectorAll('[data-offer]').forEach(button=>{
      const row=rows.find(item=>String(item.id)===String(button.dataset.offer));
      const box=button.querySelector('.price');
      if(!row||!box)return;
      const duration=box.querySelector('.duration');
      const amount=type?(type==='saloon'?row.saloon_price_aed:row.station_price_aed):null;
      [...box.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>node.remove());
      box.insertBefore(document.createTextNode(amount==null?'—':money(amount)),duration||null);
    });
    const summary=document.querySelector('#summaryOffer');
    const offer=currentOffer();
    if(summary&&offer){
      const name=arabic()?offer.name_ar:offer.name_en;
      const amount=type?(type==='saloon'?offer.saloon_price_aed:offer.station_price_aed):null;
      summary.textContent=String(name||'')+(amount==null?'':' · '+money(amount));
    }
  }

  function patchSlots(){
    const slots=document.querySelector('#slots');
    if(!slots)return;
    slots.querySelectorAll('[data-slot]').forEach(button=>{button.textContent=time(button.dataset.slot)});
    slots.querySelectorAll('.day').forEach(header=>{
      let node=header.nextElementSibling;
      while(node&&!node.matches('[data-slot]'))node=node.nextElementSibling;
      if(node?.dataset?.slot)header.textContent=day(node.dataset.slot);
    });
    const selected=slots.querySelector('[data-slot].selected')?.dataset?.slot;
    if(selected){
      const summary=document.querySelector('#summaryTime');
      if(summary)summary.textContent=day(selected)+' · '+time(selected);
      const success=document.querySelector('#successDetails .summary div:last-child strong');
      if(success)success.textContent=day(selected)+' · '+time(selected);
    }
  }

  function patchCopy(){
    const desc=document.querySelector('#slotDesc');
    if(desc)desc.textContent=arabic()
      ? 'نعرض لك الأوقات المتاحة فقط حسب المنطقة الزمنية للنشاط ('+timezone()+').'
      : 'Only available times are shown in the business time zone ('+timezone()+').';
    const phone=document.querySelector('#customerPhone');
    if(phone)phone.placeholder=prefix()+' …';
  }

  function apply(){if(!profile)return;patchCopy();patchPrices();patchSlots()}

  const originalJson=Response.prototype.json;
  Response.prototype.json=async function(){
    const payload=await originalJson.call(this);
    try{
      if(payload?.catalog?.business?.currency_code){
        window.__dabbirPublicBookingCatalog=payload.catalog;
        profile=payload.catalog.business;
        setTimeout(apply,0);
      }
    }catch{}
    return payload;
  };

  const observer=new MutationObserver(()=>{if(profile)requestAnimationFrame(apply)});
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
  new MutationObserver(()=>{if(profile)apply()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.addEventListener('click',event=>{if(event.target?.closest?.('[data-offer],[data-vehicle],[data-slot],#arBtn,#enBtn'))setTimeout(apply,0)},true);
  ensureProfile();
})();`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-public-booking-gcc','v1');
  return res.end(SCRIPT);
}
