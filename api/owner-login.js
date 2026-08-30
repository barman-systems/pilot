const PAGE = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#08090a">
<title>DABBIR — Owner Sign In</title>
<style>
:root{color-scheme:dark;--bg:#08090a;--panel:#111315;--line:#2a2f34;--text:#f7f8f9;--muted:#969da6;--accent:#d7ff5f;--amber:#ffd87a;--green:#8ce6a1}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:radial-gradient(circle at 50% -15%,#20252b 0,#0c0e10 38%,var(--bg) 70%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif}button,input{font:inherit}button,input{min-height:48px}.wrap{min-height:100vh;display:grid;place-items:center;padding:20px}.card{width:min(430px,100%);border:1px solid var(--line);background:#111315ed;border-radius:24px;padding:22px;box-shadow:0 24px 80px #0009}.brand{display:flex;align-items:center;gap:11px}.logo{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#2e246b,#245fd6 55%,#38c8d9);border:1px solid #617dff66;font-weight:950}.brand small,.muted{color:var(--muted)}h1{font-size:23px;margin:21px 0 6px}p{font-size:11px;line-height:1.7;color:var(--muted);margin:0 0 10px}.field{margin-top:13px}.field label{display:block;color:var(--muted);font-size:10px;margin-bottom:6px}.field input{width:100%;border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:13px;padding:11px 12px}.field input[readonly]{color:#d7dde3;background:#131619}.otp input{text-align:center;direction:ltr;letter-spacing:.28em;font-size:22px;font-weight:900}.btn{width:100%;border:0;background:var(--accent);color:#10130b;border-radius:13px;padding:11px 14px;font-weight:900;cursor:pointer;margin-top:16px}.btn:disabled{opacity:.55;cursor:wait}.ghost{border:0;background:transparent;color:var(--muted);cursor:pointer;padding:8px;margin-top:5px}.ghost:disabled{opacity:.5}.msg{min-height:31px;margin-top:10px;color:var(--amber);font-size:10px;line-height:1.6}.msg.ok{color:var(--green)}.foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px;border-top:1px solid #22272c;padding-top:10px}.lang{border:1px solid var(--line);background:#171a1d;color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}.hidden{display:none!important}button:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
</style>
</head>
<body>
<div class="wrap">
  <main class="card">
    <div class="brand"><div class="logo">D</div><div><b>DABBIR | دبّر</b><br><small>Owner Control Center</small></div></div>
    <h1 id="title">دخول المالك</h1>
    <p id="desc">استخدم اسم المالك. سيرسل دبّر رمز تحقق لمرة واحدة إلى وسيلة التحقق المسجلة للحساب.</p>
    <form id="form" novalidate>
      <div class="field">
        <label id="usernameLabel" for="username">اسم المستخدم</label>
        <input id="username" name="username" type="text" value="barmanadmin" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      </div>
      <div class="field otp hidden" id="otpField">
        <label id="otpLabel" for="otp">رمز OTP</label>
        <input id="otp" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" aria-describedby="msg">
      </div>
      <button class="btn" id="submitBtn" type="submit">إرسال رمز OTP</button>
      <button class="ghost hidden" id="resendBtn" type="button">إعادة إرسال الرمز</button>
      <div class="msg" id="msg" role="status" aria-live="polite"></div>
    </form>
    <div class="foot"><span class="muted" id="secure">دخول المالك فقط · بدون كلمة مرور</span><button class="lang" id="langBtn" type="button">EN</button></div>
  </main>
</div>
<script>
(()=>{
  const q=s=>document.querySelector(s);
  let lang='ar', otpRequested=false;
  const text={
    ar:{title:'دخول المالك',desc:'استخدم اسم المالك. سيرسل دبّر رمز تحقق لمرة واحدة إلى وسيلة التحقق المسجلة للحساب.',username:'اسم المستخدم',otp:'رمز OTP',send:'إرسال رمز OTP',verify:'تحقق ودخول',resend:'إعادة إرسال الرمز',sent:'تم إرسال رمز التحقق. أدخل الرمز المكوّن من 6 أرقام.',bad:'تعذر التحقق من الرمز. تأكد منه وحاول مرة أخرى.',format:'أدخل رمزًا مكوّنًا من 6 أرقام.',rate:'تم طلب رموز كثيرة. انتظر قليلًا ثم أعد المحاولة.',unavailable:'خدمة التحقق غير متاحة الآن. حاول مرة أخرى.',notConfigured:'خدمة OTP غير مهيأة في هذه المعاينة. استخدم رابط المالك الإنتاجي.',secure:'دخول المالك فقط · بدون كلمة مرور'},
    en:{title:'Owner sign in',desc:'Use the owner username. DABBIR will send a one-time verification code to the verification method registered for this account.',username:'Username',otp:'OTP code',send:'Send OTP code',verify:'Verify and sign in',resend:'Resend code',sent:'Verification code sent. Enter the 6-digit code.',bad:'The code could not be verified. Check it and try again.',format:'Enter a 6-digit code.',rate:'Too many codes were requested. Wait a moment and try again.',unavailable:'Verification is unavailable right now. Try again.',notConfigured:'OTP is not configured in this preview. Use the production owner link.',secure:'Owner access only · no password'}
  };
  const t=()=>text[lang];
  const api=async(body)=>{const r=await fetch('/api/auth/owner-otp',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const p=await r.json().catch(()=>({}));return {r,p}};
  function render(){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';q('#title').textContent=t().title;q('#desc').textContent=t().desc;q('#usernameLabel').textContent=t().username;q('#otpLabel').textContent=t().otp;q('#submitBtn').textContent=otpRequested?t().verify:t().send;q('#resendBtn').textContent=t().resend;q('#secure').textContent=t().secure;q('#langBtn').textContent=lang==='ar'?'EN':'عربي'}
  function setMessage(message,ok=false){q('#msg').textContent=message;q('#msg').classList.toggle('ok',ok)}
  function setRequested(){otpRequested=true;q('#otpField').classList.remove('hidden');q('#resendBtn').classList.remove('hidden');q('#username').readOnly=true;q('#otp').required=true;q('#otp').focus();render();setMessage(t().sent,true)}
  function errorMessage(p){if(p?.error==='OTP_RATE_LIMITED')return t().rate;if(p?.error==='INVALID_OTP_FORMAT')return t().format;if(p?.error==='INVALID_OWNER_OTP')return t().bad;if(p?.error==='OWNER_OTP_NOT_CONFIGURED')return t().notConfigured;return t().unavailable}
  async function requestOtp(){const btn=q('#submitBtn');btn.disabled=true;setMessage('');try{const {r,p}=await api({action:'request',username:q('#username').value});if(!r.ok||!p.ok){setMessage(errorMessage(p));return false}setRequested();return true}catch{setMessage(t().unavailable);return false}finally{btn.disabled=false}}
  async function verifyOtp(){const otp=q('#otp').value.trim();if(!/^\d{6}$/.test(otp)){setMessage(t().format);q('#otp').focus();return}const btn=q('#submitBtn');btn.disabled=true;setMessage('');try{const {r,p}=await api({action:'verify',username:q('#username').value,otp});if(!r.ok||!p.authenticated){setMessage(errorMessage(p));return}location.replace('/owner-dashboard')}catch{setMessage(t().unavailable)}finally{btn.disabled=false}}
  q('#form').addEventListener('submit',e=>{e.preventDefault();if(otpRequested)verifyOtp();else requestOtp()});
  q('#resendBtn').addEventListener('click',async()=>{q('#resendBtn').disabled=true;await requestOtp();q('#resendBtn').disabled=false});
  q('#otp').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
  q('#langBtn').addEventListener('click',()=>{lang=lang==='ar'?'en':'ar';render()});
  render();
})();
</script>
</body>
</html>`;

export default function handler(req,res){
  if(req.method!=='GET'){
    res.statusCode=405;
    res.setHeader('allow','GET');
    return res.end('Method Not Allowed');
  }
  res.statusCode=200;
  res.setHeader('content-type','text/html; charset=utf-8');
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-frame-options','DENY');
  res.setHeader('referrer-policy','no-referrer');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('x-dabbir-owner-login','username-otp-v1');
  return res.end(PAGE);
}
