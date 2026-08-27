const script=String.raw`(()=>{
  if(window.__dabbirTranslationUiLoaded)return;
  window.__dabbirTranslationUiLoaded=true;

  const q=s=>document.querySelector(s);
  const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  const targetFor=text=>{
    const value=String(text||'');
    const ar=(value.match(/[\u0600-\u06FF]/g)||[]).length;
    const en=(value.match(/[A-Za-z]/g)||[]).length;
    if(!ar&&!en)return null;
    return ar>=en?'en':'ar';
  };
  const labelFor=()=>document.documentElement.lang==='en'?'Translate conversation':'ترجمة المحادثة';
  const activeLabelFor=()=>document.documentElement.lang==='en'?'Show original':'عرض النص الأصلي';
  const notify=text=>{try{if(typeof toast==='function')toast(text)}catch{}};

  async function requestGroup(businessId,targetLanguage,messages){
    const response=await fetch('/api/translate',{
      method:'POST',cache:'no-store',credentials:'same-origin',
      headers:{'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({business_id:businessId,targetLanguage,messages})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.error||('TRANSLATION_'+response.status));
    return Array.isArray(payload.translations)?payload.translations:[];
  }

  async function smartTranslate(ids){
    const businessId=typeof workspace!=='undefined'&&workspace?.business?.id;
    const source=typeof workspace!=='undefined'&&Array.isArray(workspace?.messages)?workspace.messages:[];
    if(!businessId||!Array.isArray(ids)||!ids.length)return;
    const selected=source.filter(message=>ids.includes(message.id)).map(message=>({id:String(message.id),text:String(message.body||'')}));
    if(!selected.length)return;

    const groups={ar:[],en:[]};
    for(const message of selected){
      const target=targetFor(message.text);
      if(!target)continue;
      groups[target].push(message);
    }

    try{
      const results=[];
      for(const target of ['ar','en']){
        if(!groups[target].length)continue;
        results.push(...await requestGroup(businessId,target,groups[target]));
      }
      for(const item of results){
        const original=selected.find(message=>String(message.id)===String(item.id))?.text||'';
        const translated=String(item.text||'');
        if(typeof translations!=='undefined'&&translations instanceof Map){
          if(translated&&normalize(translated)!==normalize(original))translations.set(String(item.id),translated);
          else translations.delete(String(item.id));
        }
      }
      if(typeof renderMessages==='function')renderMessages();
    }catch(error){
      console.error('dabbir_smart_translation_failed',String(error?.message||error).slice(0,140));
      notify(document.documentElement.lang==='en'?'Translation is temporarily unavailable':'تعذر الترجمة مؤقتًا');
    }
  }

  try{translateMessages=smartTranslate}catch{window.translateMessages=smartTranslate}

  function refreshLabels(){
    const all=q('#translateAll');
    if(all){
      let active=false;
      try{active=Boolean(translationMode)}catch{}
      all.textContent=active?activeLabelFor():labelFor();
      all.setAttribute('aria-label',all.textContent);
    }
  }

  if(typeof renderMessages==='function'&&!window.__dabbirTranslationRenderWrapped){
    window.__dabbirTranslationRenderWrapped=true;
    const base=renderMessages;
    renderMessages=function(){const result=base.apply(this,arguments);refreshLabels();return result};
  }
  if(typeof applyLang==='function'&&!window.__dabbirTranslationLangWrapped){
    window.__dabbirTranslationLangWrapped=true;
    const base=applyLang;
    applyLang=function(){const result=base.apply(this,arguments);refreshLabels();return result};
  }

  refreshLabels();
  setTimeout(refreshLabels,300);
  setTimeout(refreshLabels,1000);
  window.__dabbirTranslationUiVersion='v2-opposite-language';
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-translation-ui','v2');
  return res.end(script);
}
