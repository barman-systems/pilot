import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`PATCH_ANCHOR_MISSING:${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`PATCH_ANCHOR_NOT_UNIQUE:${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

let html = fs.readFileSync('index.html', 'utf8');

html = replaceOnce(
  html,
  '<section id="onboardingGate" class="authWrap hidden">',
  `<section id="mfaGate" class="authWrap hidden">
  <form class="authCard" id="mfaForm">
    <div class="brand"><div class="logo">D</div><div><b>DABBIR | دبّر</b><br><small id="mfaTag"></small></div></div>
    <h1 id="mfaTitle"></h1><p id="mfaDesc"></p>
    <div class="field"><label id="mfaCodeLabel"></label><input id="mfaCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8" required></div>
    <button class="primary wide" id="mfaSubmit" type="submit"></button>
    <button class="secondary wide" id="mfaCancel" type="button"></button>
    <div class="authMsg" id="mfaMsg" role="status" aria-live="polite"></div>
  </form>
</section>

<section id="onboardingGate" class="authWrap hidden">`,
  'mfa_gate_markup',
);

html = replaceOnce(
  html,
  "verification:'تم إنشاء الحساب. افحص بريدك للتأكيد ثم سجّل الدخول.',invalid:'تعذر إكمال الطلب. تحقق من البيانات وحاول مرة أخرى.',",
  "verification:'تم إنشاء الحساب. افحص بريدك للتأكيد ثم سجّل الدخول.',invalid:'تعذر إكمال الطلب. تحقق من البيانات وحاول مرة أخرى.',mfaTag:'تحقق إضافي',mfaTitle:'أدخل رمز المصادقة',mfaDesc:'أكمل تسجيل الدخول بالرمز الحالي من تطبيق المصادقة. لن يطلب منك دبّر كلمة المرور مرة أخرى في هذه الخطوة.',mfaCode:'رمز المصادقة',mfaVerify:'تحقق ودخول',mfaCancel:'استخدام حساب آخر',mfaInvalid:'تعذر التحقق من الرمز. أدخل الرمز الحالي وحاول مرة أخرى.',",
  'arabic_mfa_copy',
);

html = replaceOnce(
  html,
  "verification:'Account created. Verify your email, then log in.',invalid:'The request could not be completed. Check the details and try again.',",
  "verification:'Account created. Verify your email, then log in.',invalid:'The request could not be completed. Check the details and try again.',mfaTag:'Additional verification',mfaTitle:'Enter authentication code',mfaDesc:'Complete sign-in with the current code from your authenticator app. DABBIR will not ask for your password again at this step.',mfaCode:'Authentication code',mfaVerify:'Verify and enter',mfaCancel:'Use another account',mfaInvalid:'The code could not be verified. Enter the current code and try again.',",
  'english_mfa_copy',
);

html = replaceOnce(
  html,
  "let lang=localStorage.getItem('dabbir_lang')||'ar',authMode='login',workspace=null,current='dashboard',selectedConversationId=null,translations=new Map(),translationMode=false;",
  "let lang=localStorage.getItem('dabbir_lang')||'ar',authMode='login',workspace=null,current='dashboard',selectedConversationId=null,translations=new Map(),translationMode=false,mfaFactorId=null;",
  'mfa_state',
);

html = replaceOnce(
  html,
  "const map={authTag:'tag',authTitle:'authTitle',authDesc:'authDesc',loginTab:'login',signupTab:'signup',emailLabel:'email',passwordLabel:'password',",
  "const map={authTag:'tag',authTitle:'authTitle',authDesc:'authDesc',loginTab:'login',signupTab:'signup',emailLabel:'email',passwordLabel:'password',mfaTag:'mfaTag',mfaTitle:'mfaTitle',mfaDesc:'mfaDesc',mfaCodeLabel:'mfaCode',mfaSubmit:'mfaVerify',mfaCancel:'mfaCancel',",
  'mfa_translation_map',
);

html = replaceOnce(
  html,
  "async function api(url,options={}){const r=await fetch(url,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return {r,j}}",
  `async function api(url,options={}){const r=await fetch(url,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));return {r,j}}
async function readMfaStatus(){const {r,j}=await api('/api/auth/mfa-status');return r.ok&&j.ok?j:null}
async function routeToMfaIfRequired(){const status=await readMfaStatus();if(!status?.mfa_required||!status?.factor_id)return false;mfaFactorId=String(status.factor_id);workspace=null;showGate('mfa');$('#mfaCode').value='';$('#mfaMsg').textContent='';setTimeout(()=>$('#mfaCode').focus(),0);return true}`,
  'mfa_status_client',
);

html = replaceOnce(
  html,
  "$('#authForm').onsubmit=async e=>{e.preventDefault();const btn=$('#authSubmit');btn.disabled=true;const endpoint=authMode==='login'?'/api/auth/login':'/api/auth/signup';const {r,j}=await api(endpoint,{method:'POST',body:JSON.stringify({email:$('#authEmail').value,password:$('#authPassword').value})});btn.disabled=false;if(authMode==='signup'&&j.verification_required){$('#authMsg').textContent=T().verification;return}if(!r.ok||!j.ok){$('#authMsg').textContent=T().invalid;return}await boot()};",
  `$('#authForm').onsubmit=async e=>{e.preventDefault();const btn=$('#authSubmit');btn.disabled=true;const endpoint=authMode==='login'?'/api/auth/login':'/api/auth/signup';const {r,j}=await api(endpoint,{method:'POST',body:JSON.stringify({email:$('#authEmail').value,password:$('#authPassword').value})});btn.disabled=false;if(authMode==='signup'&&j.verification_required){$('#authMsg').textContent=T().verification;return}if(!r.ok||!j.ok){$('#authMsg').textContent=T().invalid;return}if(authMode==='login'&&await routeToMfaIfRequired())return;await boot()};
$('#mfaForm').onsubmit=async e=>{e.preventDefault();const btn=$('#mfaSubmit'),code=$('#mfaCode').value.trim();if(!mfaFactorId||!/^[0-9]{6,8}$/.test(code)){ $('#mfaMsg').textContent=T().mfaInvalid;return }btn.disabled=true;const {r,j}=await api('/api/auth/mfa-verify',{method:'POST',body:JSON.stringify({factor_id:mfaFactorId,code})});btn.disabled=false;if(!r.ok||!j.ok||j.aal!=='aal2'){ $('#mfaMsg').textContent=T().mfaInvalid;$('#mfaCode').select();return }mfaFactorId=null;$('#mfaCode').value='';await boot()};
$('#mfaCancel').onclick=async()=>{await api('/api/auth/logout',{method:'POST',body:'{}'}).catch(()=>null);mfaFactorId=null;$('#mfaCode').value='';$('#mfaMsg').textContent='';showGate('auth')};`,
  'mfa_form_handler',
);

html = replaceOnce(
  html,
  "function showGate(name){$('#loading').classList.add('hidden');$('#authGate').classList.toggle('hidden',name!=='auth');$('#onboardingGate').classList.toggle('hidden',name!=='onboarding');$('#appShell').classList.toggle('hidden',name!=='app');$('#bottomNav').classList.toggle('hidden',name!=='app')}",
  "function showGate(name){$('#loading').classList.add('hidden');$('#authGate').classList.toggle('hidden',name!=='auth');$('#mfaGate').classList.toggle('hidden',name!=='mfa');$('#onboardingGate').classList.toggle('hidden',name!=='onboarding');$('#appShell').classList.toggle('hidden',name!=='app');$('#bottomNav').classList.toggle('hidden',name!=='app')}",
  'show_gate_mfa',
);

html = replaceOnce(
  html,
  "async function boot(){applyLang();const {r,j}=await api('/api/dabbir-runtime');if(r.status===401){workspace=null;showGate('auth');return}if(!r.ok||!j.ok){workspace=null;showGate('auth');$('#authMsg').textContent=j.error||T().invalid;return}if(j.needs_onboarding){workspace=j;showGate('onboarding');return}workspace=j;selectedConversationId=j.selected_conversation_id||null;showGate('app');renderAll()}",
  "async function boot(){applyLang();const {r,j}=await api('/api/dabbir-runtime');if(r.status===401||r.status===403){workspace=null;if(await routeToMfaIfRequired())return;showGate('auth');return}if(!r.ok||!j.ok){workspace=null;showGate('auth');$('#authMsg').textContent=j.error||T().invalid;return}mfaFactorId=null;if(j.needs_onboarding){workspace=j;showGate('onboarding');return}workspace=j;selectedConversationId=j.selected_conversation_id||null;showGate('app');renderAll()}",
  'boot_mfa_continuation',
);

html = replaceOnce(
  html,
  "async function loadRuntime(businessId,conversationId){const q=new URLSearchParams();if(businessId)q.set('business_id',businessId);if(conversationId)q.set('conversation_id',conversationId);const {r,j}=await api('/api/dabbir-runtime?'+q.toString());if(r.status===401){workspace=null;showGate('auth');toast(T().authRequired);return}if(!r.ok||!j.ok){toast(j.error||T().invalid);return}workspace=j;selectedConversationId=j.selected_conversation_id||conversationId||null;showGate('app');renderAll()}",
  "async function loadRuntime(businessId,conversationId){const q=new URLSearchParams();if(businessId)q.set('business_id',businessId);if(conversationId)q.set('conversation_id',conversationId);const {r,j}=await api('/api/dabbir-runtime?'+q.toString());if(r.status===401||r.status===403){workspace=null;if(await routeToMfaIfRequired())return;showGate('auth');toast(T().authRequired);return}if(!r.ok||!j.ok){toast(j.error||T().invalid);return}mfaFactorId=null;workspace=j;selectedConversationId=j.selected_conversation_id||conversationId||null;showGate('app');renderAll()}",
  'load_runtime_mfa_continuation',
);

fs.writeFileSync('index.html', html);

let journey = fs.readFileSync('test/ai-full-customer-journey-v2.mjs', 'utf8');
journey = replaceOnce(
  journey,
  'async function browserJourney() {',
  'async function browserJourney(mfaFactorId, mfaSecret) {',
  'browser_journey_args',
);
journey = replaceOnce(
  journey,
  `  await page.locator('#authSubmit').click();
  await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible', timeout: 25_000 });`,
  `  await page.locator('#authSubmit').click();
  await page.locator('#mfaGate:not(.hidden)').waitFor({ state: 'visible', timeout: 20_000 });
  assert(mfaFactorId && mfaSecret, 'BROWSER_MFA_FIXTURE_MISSING');
  const remainderMs = 30_000 - (Date.now() % 30_000);
  if (remainderMs < 3_500) await page.waitForTimeout(remainderMs + 600);
  let entered = false;
  for (let attempt = 1; attempt <= 2 && !entered; attempt += 1) {
    await page.locator('#mfaCode').fill(totp(mfaSecret));
    await page.locator('#mfaSubmit').click();
    entered = await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    if (!entered) await page.waitForTimeout(1_200);
  }
  assert(entered, 'BROWSER_MFA_LOGIN_DID_NOT_REACH_APP');`,
  'browser_mfa_flow',
);
journey = replaceOnce(
  journey,
  "  await step('25_mobile_webkit_owner_journey', browserJourney);",
  "  await step('25_mobile_webkit_owner_journey', () => browserJourney(mfaFactorId, mfaSecret));",
  'browser_journey_call',
);
fs.writeFileSync('test/ai-full-customer-journey-v2.mjs', journey);

console.log('DABBIR_MFA_LOGIN_GATE_PATCHED');
