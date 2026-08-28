const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<title>DABBIR — WhatsApp</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#090a0b;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center}.card{width:min(520px,calc(100% - 32px));background:#141618;border:1px solid #292d31;border-radius:22px;padding:24px}.brand{font-weight:900;color:#d7ff5f}.muted{color:#aeb4bb;line-height:1.65}button{width:100%;min-height:52px;border:0;border-radius:14px;background:#25D366;color:#07140c;font-size:16px;font-weight:900;margin-top:16px}button:disabled{opacity:.5}.msg{min-height:24px;margin-top:14px;color:#d9dde1;font-size:14px}</style>
</head>
<body><main class="card"><div class="brand">DABBIR | دبّر</div><h1>ربط WhatsApp Business</h1><p class="muted">سيُفتح تسجيل Meta الآمن. دبّر لا يضع رمز التفويض أو مفاتيح Meta داخل رابط العودة إلى التطبيق.</p><button id="connect" disabled>متابعة مع Meta</button><div id="msg" class="msg">جارٍ تجهيز الربط…</div></main>
<script>
(()=>{
  const RETURN_URL='dabbir://whatsapp-connect';
  const FEATURE='whatsapp_business_app_onboarding';
  const FINISH=new Set(['FINISH','FINISH_ONLY_WABA','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING']);
  const button=document.getElementById('connect'),msg=document.getElementById('msg');
  let cfg=null,metaSession=null,sdkReady=false;
  const state=(()=>{try{return String(new URLSearchParams(location.hash.slice(1)).get('state')||'')}catch{return ''}})();
  function trusted(origin){try{const u=new URL(origin),h=u.hostname.toLowerCase();return u.protocol==='https:'&&(h==='facebook.com'||h.endsWith('.facebook.com'))}catch{return false}}
  function finish(status,code=''){const q=new URLSearchParams({status});if(code)q.set('code',String(code).slice(0,80));location.replace(RETURN_URL+'?'+q.toString())}
  function setMessage(text){msg.textContent=text}
  window.addEventListener('message',event=>{
    if(!trusted(event.origin))return;
    let data=event.data; if(typeof data==='string'){try{data=JSON.parse(data)}catch{return}}
    if(!data||data.type!=='WA_EMBEDDED_SIGNUP')return;
    const e=String(data.event||'');
    if(FINISH.has(e)){
      const p=data.data||{};
      metaSession={waba_id:String(p.waba_id||p.whatsapp_business_account_id||''),phone_number_id:String(p.phone_number_id||'')};
    }
  });
  async function load(){
    if(!/^[A-Za-z0-9_-]{43}$/.test(state)){setMessage('جلسة الربط غير صالحة.');return}
    const r=await fetch('/api/mobile/whatsapp-connect/config?state='+encodeURIComponent(state),{cache:'no-store',headers:{accept:'application/json'}});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok){setMessage('انتهت جلسة الربط أو لم تعد متاحة.');return}
    cfg=j;
    window.fbAsyncInit=()=>{
      try{FB.init({appId:cfg.app_id,cookie:false,xfbml:false,version:cfg.graph_version});sdkReady=true;button.disabled=false;setMessage('جاهز للربط.')}catch{setMessage('تعذر تجهيز Meta.')}
    };
    const s=document.createElement('script');s.async=true;s.defer=true;s.crossOrigin='anonymous';s.src='https://connect.facebook.net/'+encodeURIComponent(cfg.sdk_locale||'en_US')+'/sdk.js';s.onerror=()=>setMessage('تعذر تحميل Meta.');document.head.appendChild(s);
  }
  button.addEventListener('click',()=>{
    if(!cfg||!sdkReady||!window.FB)return;
    button.disabled=true;setMessage('أكمل الخطوات في Meta…');metaSession=null;
    try{
      FB.login(async response=>{
        const code=String(response?.authResponse?.code||'');
        if(!code){setMessage('لم تُرجع Meta رمز التفويض.');button.disabled=false;return}
        await new Promise(resolve=>setTimeout(resolve,1800));
        try{
          const r=await fetch('/api/mobile/whatsapp-connect/capture',{method:'POST',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({state,code,waba_id:metaSession?.waba_id||'',phone_number_id:metaSession?.phone_number_id||''})});
          const j=await r.json().catch(()=>({}));
          if(!r.ok||!j.ok){setMessage('تعذر حفظ نتيجة Meta بأمان. أعد المحاولة.');button.disabled=false;return}
          setMessage('تم التحقق من نتيجة Meta. العودة إلى دبّر…');finish('captured');
        }catch{setMessage('تعذر إكمال الربط.');button.disabled=false}
      },{config_id:cfg.config_id,response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:FEATURE,sessionInfoVersion:'3'}});
    }catch{setMessage('تعذر فتح تسجيل Meta.');button.disabled=false}
  });
  load().catch(()=>setMessage('تعذر تجهيز جلسة الربط.'));
})();
</script></body></html>`;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('content-security-policy', "default-src 'none'; script-src 'unsafe-inline' https://connect.facebook.net; connect-src 'self' https://www.facebook.com https://graph.facebook.com; frame-src https://www.facebook.com https://*.facebook.com; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.end(html);
}
