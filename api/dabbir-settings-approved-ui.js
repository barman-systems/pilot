const css=String.raw`
@media(max-width:700px){
  body.dabbir-settings-approved{--dsa-bg:#07111f;--dsa-surface:#0d1929;--dsa-surface-2:#111f31;--dsa-line:#26374d;--dsa-line-strong:#344a66;--dsa-muted:#8fa1ba;--dsa-text:#f3f7ff;--dsa-blue:#4f76ff;--dsa-blue-2:#365cf0;background:radial-gradient(circle at 60% -10%,#10294b 0,#091523 34%,#050b13 72%)!important}
  body.dabbir-settings-approved .top{height:78px!important;padding:0 18px!important;background:#07111ff2!important;border-bottom:1px solid #17253a!important;backdrop-filter:blur(22px)!important;-webkit-backdrop-filter:blur(22px)!important;box-shadow:0 12px 34px #0005!important;position:sticky!important}
  body.dabbir-settings-approved .top>.row{width:100%!important;min-width:0!important;justify-content:center!important;gap:0!important}
  body.dabbir-settings-approved #pageTitle{position:absolute!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;max-width:54vw!important;font-size:20px!important;font-weight:900!important;line-height:1.1!important;color:var(--dsa-text)!important;text-align:center!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
  body.dabbir-settings-approved #runtimeChip,body.dabbir-settings-approved .top .statusChip,body.dabbir-settings-approved .top .lang,body.dabbir-settings-approved .topActions{display:none!important}
  body.dabbir-settings-approved #menuBtn{display:grid!important;place-items:center!important;position:absolute!important;left:17px!important;right:auto!important;top:16px!important;width:46px!important;height:46px!important;border:0!important;background:transparent!important;color:#f5f8ff!important;font-size:0!important;box-shadow:none!important}
  body.dabbir-settings-approved #menuBtn:before{content:'☰';font-size:31px!important;line-height:1!important;font-weight:400!important;letter-spacing:-4px!important}
  body.dabbir-settings-approved .dsa-header-logo{display:block!important;position:absolute!important;right:18px!important;left:auto!important;top:17px!important;width:44px!important;height:44px!important;border-radius:13px!important;object-fit:contain!important;background:#0c1b2e!important;border:1px solid #29405f!important;padding:4px!important;box-shadow:0 10px 28px #0005!important}
  html[dir=ltr] body.dabbir-settings-approved #menuBtn{right:17px!important;left:auto!important}
  html[dir=ltr] body.dabbir-settings-approved .dsa-header-logo{left:18px!important;right:auto!important}
  body.dabbir-settings-approved .content{max-width:760px!important;margin:0 auto!important;padding:14px 14px 126px!important;background:transparent!important}
  body.dabbir-settings-approved #screen-settings>.hero{display:none!important}
  body.dabbir-settings-approved #screen-settings.active{padding:0!important;background:transparent!important}
  body.dabbir-settings-approved .dsa-settings-toolbar{display:flex!important;align-items:stretch!important;justify-content:space-between!important;gap:10px!important;margin:0 2px 14px!important}
  body.dabbir-settings-approved .dsa-language-control,body.dabbir-settings-approved .dsa-open-state{min-height:60px!important;border:1px solid var(--dsa-line)!important;background:linear-gradient(180deg,#0f1d2f,#0b1625)!important;color:var(--dsa-text)!important;border-radius:17px!important;box-shadow:0 10px 28px #00000022!important}
  body.dabbir-settings-approved .dsa-language-control{display:flex!important;align-items:center!important;gap:9px!important;padding:0 14px!important;min-width:132px!important;justify-content:center!important;font-size:14px!important;font-weight:800!important}
  body.dabbir-settings-approved .dsa-language-control .dsa-globe{font-size:21px!important;color:#b8c9e3!important;line-height:1!important}
  body.dabbir-settings-approved .dsa-language-control .dsa-chevron{font-size:14px!important;color:#8fa1ba!important}
  body.dabbir-settings-approved .dsa-open-state{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;padding:10px 14px!important;flex:1!important;max-width:220px!important}
  body.dabbir-settings-approved .dsa-state-dot{width:9px!important;height:9px!important;border-radius:50%!important;background:#607087!important;box-shadow:0 0 0 4px #60708718!important;flex:0 0 9px!important}
  body.dabbir-settings-approved .dsa-open-state.is-open .dsa-state-dot{background:#52cf89!important;box-shadow:0 0 0 4px #52cf891a!important}
  body.dabbir-settings-approved .dsa-open-state small{display:block!important;color:var(--dsa-muted)!important;font-size:13px!important;margin-bottom:3px!important}
  body.dabbir-settings-approved .dsa-open-state b{display:block!important;color:var(--dsa-text)!important;font-size:13px!important;line-height:1.25!important}
  body.dabbir-settings-approved .dabbir-knowledge-card{margin:0!important;padding:0!important;overflow:visible!important;border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important}
  body.dabbir-settings-approved .dk-head{display:none!important}
  body.dabbir-settings-approved .dk-form{padding:0!important}
  body.dabbir-settings-approved .dk-sections{display:flex!important;flex-direction:column!important;gap:14px!important}
  body.dabbir-settings-approved .dk-section{padding:17px!important;border:1px solid var(--dsa-line)!important;background:linear-gradient(145deg,#0e1b2c 0%,#0a1523 100%)!important;border-radius:20px!important;box-shadow:0 14px 34px #00000027!important;overflow:hidden!important}
  body.dabbir-settings-approved .dk-section-head{margin:0 0 15px!important;min-height:29px!important;align-items:center!important}
  body.dabbir-settings-approved .dk-section-head h3{display:flex!important;align-items:center!important;gap:9px!important;margin:0!important;color:var(--dsa-text)!important;font-size:18px!important;font-weight:900!important;line-height:1.3!important}
  body.dabbir-settings-approved .dk-section-head h3:before{display:grid!important;place-items:center!important;width:30px!important;height:30px!important;border-radius:9px!important;background:#122849!important;border:1px solid #23487c!important;color:#6d99ff!important;font-size:15px!important;font-weight:900!important;flex:0 0 30px!important}
  body.dabbir-settings-approved .dk-section:nth-child(1) .dk-section-head h3:before{content:'▱'}
  body.dabbir-settings-approved .dk-section:nth-child(2) .dk-section-head h3:before{content:'▣'}
  body.dabbir-settings-approved .dk-section:nth-child(3) .dk-section-head h3:before{content:'≡'}
  body.dabbir-settings-approved .dk-section-head span{font-size:13px!important;color:#a8b6c9!important}
  body.dabbir-settings-approved .dk-grid{display:grid!important;grid-template-columns:1fr!important;gap:13px!important}
  body.dabbir-settings-approved .dk-field{position:relative!important;gap:7px!important;min-width:0!important}
  body.dabbir-settings-approved .dk-field.wide{grid-column:auto!important}
  body.dabbir-settings-approved .dk-field label{font-size:14px!important;font-weight:800!important;color:#aebdd1!important;margin:0 2px!important;line-height:1.35!important}
  body.dabbir-settings-approved .dk-field input,body.dabbir-settings-approved .dk-field textarea{width:100%!important;border:1px solid var(--dsa-line-strong)!important;background:#0b1726!important;color:var(--dsa-text)!important;border-radius:15px!important;padding:13px 15px!important;font-size:16px!important;line-height:1.55!important;box-shadow:inset 0 1px 0 #ffffff05!important;transition:border-color .16s,box-shadow .16s,background .16s!important}
  body.dabbir-settings-approved .dk-field input{min-height:57px!important}
  body.dabbir-settings-approved .dk-field textarea{min-height:100px!important;resize:vertical!important}
  body.dabbir-settings-approved .dk-field[data-key="about_business"] textarea{min-height:128px!important}
  body.dabbir-settings-approved .dk-field input::placeholder,body.dabbir-settings-approved .dk-field textarea::placeholder{color:#73839a!important;opacity:1!important}
  body.dabbir-settings-approved .dk-field input:focus,body.dabbir-settings-approved .dk-field textarea:focus{outline:none!important;border-color:#557cf8!important;background:#0d1a2a!important;box-shadow:0 0 0 3px #4f76ff1f,inset 0 1px 0 #ffffff08!important}
  body.dabbir-settings-approved .dk-hours-wrap{padding:0!important;border:0!important;background:transparent!important;border-radius:0!important}
  body.dabbir-settings-approved .dk-hours-help{font-size:13px!important;line-height:1.6!important;color:#a8b6c9!important;margin:0 0 11px!important}
  body.dabbir-settings-approved .dk-hours-tools{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:8px!important;margin:0 0 12px!important}
  body.dabbir-settings-approved .dk-hours-tools button{min-height:43px!important;border:1px solid var(--dsa-line-strong)!important;background:#0d1928!important;color:#d7e2f1!important;border-radius:13px!important;padding:7px 8px!important;font-size:13px!important;font-weight:850!important;box-shadow:none!important}
  body.dabbir-settings-approved .dk-hours-tools button:active{background:#13243a!important;border-color:#496ea9!important}
  body.dabbir-settings-approved .dk-hours-list{display:flex!important;flex-direction:column!important;gap:7px!important}
  body.dabbir-settings-approved .dk-hours-row{display:grid!important;grid-template-columns:minmax(0,1fr) 78px 78px!important;gap:7px!important;align-items:center!important;min-height:56px!important;border:1px solid var(--dsa-line)!important;background:#0b1726!important;border-radius:14px!important;padding:7px 9px!important;box-shadow:inset 0 1px 0 #ffffff04!important}
  body.dabbir-settings-approved .dk-day-toggle{grid-column:1!important;grid-row:1!important;display:flex!important;align-items:center!important;gap:9px!important;min-height:40px!important;color:#8798af!important;font-size:13px!important;font-weight:850!important;cursor:pointer!important;white-space:nowrap!important}
  body.dabbir-settings-approved .dk-day-name{overflow:hidden!important;text-overflow:ellipsis!important}
  body.dabbir-settings-approved .dk-day-toggle input{appearance:none!important;-webkit-appearance:none!important;width:42px!important;height:24px!important;min-height:24px!important;flex:0 0 42px!important;border:1px solid #44556c!important;border-radius:999px!important;background:#344255!important;padding:0!important;position:relative!important;box-shadow:inset 0 2px 5px #0003!important}
  body.dabbir-settings-approved .dk-day-toggle input:after{content:''!important;position:absolute!important;width:18px!important;height:18px!important;top:2px!important;inset-inline-start:2px!important;border-radius:50%!important;background:#b8c3d1!important;transition:.16s!important;box-shadow:0 2px 6px #0004!important}
  body.dabbir-settings-approved .dk-day-toggle input:checked{background:linear-gradient(180deg,#4d73ff,#3559e9)!important;border-color:#5c80ff!important}
  body.dabbir-settings-approved .dk-day-toggle input:checked:after{inset-inline-start:20px!important;background:#fff!important}
  html[dir=ltr] body.dabbir-settings-approved .dk-day-toggle input:checked:after{left:20px!important}
  body.dabbir-settings-approved .dk-hours-row.is-open .dk-day-name{color:#edf4ff!important}
  body.dabbir-settings-approved .dk-time{grid-row:1!important;display:block!important;min-width:0!important}
  body.dabbir-settings-approved .dk-time:nth-of-type(2){grid-column:2!important}
  body.dabbir-settings-approved .dk-time:nth-of-type(3){grid-column:3!important}
  body.dabbir-settings-approved .dk-time span{display:none!important}
  body.dabbir-settings-approved .dk-time input{width:100%!important;min-height:40px!important;height:40px!important;padding:5px 6px!important;border:0!important;background:transparent!important;color:#aebed5!important;border-radius:10px!important;font-size:13px!important;text-align:center!important;box-shadow:none!important}
  body.dabbir-settings-approved .dk-time input:focus{background:#12233a!important;color:#fff!important;outline:1px solid #456fc4!important}
  body.dabbir-settings-approved .dk-time input:disabled{display:none!important}
  body.dabbir-settings-approved .dk-hours-row:not(.is-open):after{grid-column:2/4!important;grid-row:1!important;justify-self:start!important;color:#7f90a7!important;font-size:12px!important;font-weight:700!important}
  html[lang^="ar"] body.dabbir-settings-approved .dk-hours-row:not(.is-open):after{content:'مغلق'}
  html[lang^="en"] body.dabbir-settings-approved .dk-hours-row:not(.is-open):after{content:'Closed'}
  body.dabbir-settings-approved .dk-hours-legacy{border-radius:12px!important;font-size:13px!important}
  body.dabbir-settings-approved .dk-payments-wrap{padding:0!important;border:0!important;background:transparent!important;border-radius:0!important}
  body.dabbir-settings-approved .dk-payments-help{font-size:13px!important;line-height:1.55!important;color:#a8b6c9!important;margin:0 0 11px!important}
  body.dabbir-settings-approved .dk-payment-options{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
  body.dabbir-settings-approved .dk-payment-option{appearance:none!important;-webkit-appearance:none!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;text-align:start!important;min-height:55px!important;width:100%!important;border:1px solid var(--dsa-line-strong)!important;background:#0d1928!important;color:#d9e3f1!important;border-radius:14px!important;padding:10px 12px!important;font-size:12px!important;font-weight:850!important;white-space:normal!important;line-height:1.25!important;box-shadow:inset 0 1px 0 #ffffff04!important}
  body.dabbir-settings-approved .dk-payment-option[aria-pressed="true"]{border-color:#587cff!important;background:linear-gradient(145deg,#1b3975,#173063)!important;color:#fff!important;box-shadow:0 0 0 2px #4f76ff15,inset 0 1px 0 #ffffff10!important}
  body.dabbir-settings-approved .dk-payment-option[aria-pressed="true"]:before{content:'✓'!important;color:#fff!important;font-size:13px!important;margin-inline-end:7px!important}
  body.dabbir-settings-approved .dk-actions{position:sticky!important;bottom:78px!important;z-index:17!important;display:grid!important;grid-template-columns:1fr!important;gap:7px!important;margin:2px -2px 0!important;padding:12px 2px calc(4px + env(safe-area-inset-bottom))!important;background:linear-gradient(180deg,transparent 0,#07111fe8 28%,#07111f 100%)!important}
  body.dabbir-settings-approved .dk-actions .primary{width:100%!important;min-height:58px!important;border:1px solid #5d7eff!important;border-radius:15px!important;background:linear-gradient(135deg,#486dff,#3757ea)!important;color:#fff!important;font-size:15px!important;font-weight:900!important;box-shadow:0 12px 28px #2846d64f!important;text-shadow:none!important}
  body.dabbir-settings-approved .dk-actions .primary:active{transform:scale(.985)!important}
  body.dabbir-settings-approved .dk-msg{order:2!important;min-height:0!important;color:#91a3bb!important;font-size:13px!important;text-align:center!important;line-height:1.4!important}
  body.dabbir-settings-approved #bottomNav{background:#08111df2!important;border:1px solid #1c2a3d!important;border-bottom:0!important;border-radius:24px 24px 0 0!important;padding:8px 6px calc(8px + env(safe-area-inset-bottom))!important;box-shadow:0 -18px 44px #000b!important;backdrop-filter:blur(24px)!important;-webkit-backdrop-filter:blur(24px)!important}
  body.dabbir-settings-approved #bottomNav>button,body.dabbir-settings-approved #bottomNav>a{min-height:58px!important;border-radius:14px!important;color:#8ca0bb!important;font-size:13px!important;background:transparent!important;box-shadow:none!important}
  body.dabbir-settings-approved #bottomNav>button.active,body.dabbir-settings-approved #bottomNav>a.active{color:#5f8cff!important;background:transparent!important;box-shadow:none!important}
  body.dabbir-settings-approved .modalBox{background:#0c1725!important;border-color:#2a3b52!important}
}
@media(min-width:701px){.dsa-settings-toolbar,.dsa-header-logo{display:none!important}}
@media(max-width:700px){
body.dabbir-settings-approved #appShell .top{height:auto!important;min-height:78px!important;padding:calc(12px + env(safe-area-inset-top)) 18px 12px!important;overflow:visible!important}
body.dabbir-settings-approved #appShell .top>.row{position:relative!important;min-height:46px!important}
body.dabbir-settings-approved #appShell .top .d4-header-mark,body.dabbir-settings-approved #appShell .top .dabbirHeaderMarkV3,body.dabbir-settings-approved #appShell .dabbirHeaderWordV3{display:none!important}
body.dabbir-settings-approved #appShell .dabbirHeaderBrandV3,body.dabbir-settings-approved #appShell .dabbirHeaderCopyV3{display:block!important;width:100%!important;min-width:0!important}
body.dabbir-settings-approved #appShell #pageTitle{position:static!important;transform:none!important;max-width:none!important;margin-inline:54px!important;white-space:normal!important;overflow:visible!important;line-height:1.4!important;text-align:center!important}
body.dabbir-settings-approved #appShell #menuBtn{top:50%!important;transform:translateY(-50%)!important;left:0!important;right:auto!important}
body.dabbir-settings-approved #appShell .dsa-header-logo{top:50%!important;transform:translateY(-50%)!important;right:0!important;left:auto!important}
html[dir=ltr] body.dabbir-settings-approved #appShell #menuBtn{right:0!important;left:auto!important}
html[dir=ltr] body.dabbir-settings-approved #appShell .dsa-header-logo{left:0!important;right:auto!important}
}

`;

const script=String.raw`(()=>{
  if(window.__dabbirSettingsApprovedUi)return;
  window.__dabbirSettingsApprovedUi=true;
  const style=document.createElement('style');
  style.dataset.dabbirSettingsApproved='v1';
  style.textContent=${JSON.stringify(css)};
  document.head.append(style);
  const q=s=>document.querySelector(s);
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  function active(){return !!q('#screen-settings.active')}
  function installHeaderLogo(){
    const top=q('.top');if(!top)return;
    let img=top.querySelector('.dsa-header-logo');
    if(!img){img=document.createElement('img');img.className='dsa-header-logo';img.src='/dabbir-app-icon.png';img.alt='DABBIR';img.decoding='async';top.append(img)}
  }
  function toggleLanguage(){
    const buttons=[...document.querySelectorAll('.top .lang button')];
    const target=buttons.find(btn=>!btn.classList.contains('on'));
    if(target){target.click();return}
    try{if(typeof setLanguage==='function')setLanguage(ar()?'en':'ar');else if(typeof applyLang==='function')applyLang(ar()?'en':'ar')}catch{}
  }
  function parseClock(value){const m=String(value||'').match(/^(\\d{2}):(\\d{2})$/);return m?Number(m[1])*60+Number(m[2]):NaN}
  function currentDubai(){
    try{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dubai',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
      return {day:parts.weekday,minute:Number(parts.hour)*60+Number(parts.minute)};
    }catch{return null}
  }
  function businessOpenNow(){
    const current=currentDubai();if(!current)return false;
    const raw=String(q('#dk-business_hours')?.value||window.workspace?.business?.business_hours||'');
    const re=new RegExp('(?:^|;\\\\s*)'+current.day+'\\\\s+(\\\\d{2}:\\\\d{2})-(\\\\d{2}:\\\\d{2})(?=;|$)','i');
    const hit=raw.match(re);if(!hit)return false;
    const start=parseClock(hit[1]),end=parseClock(hit[2]);if(!Number.isFinite(start)||!Number.isFinite(end))return false;
    if(end>=start)return current.minute>=start&&current.minute<end;
    return current.minute>=start||current.minute<end;
  }
  function ensureToolbar(){
    const screen=q('#screen-settings');const card=screen?.querySelector('.dabbir-knowledge-card');if(!screen||!card)return;
    let toolbar=screen.querySelector('.dsa-settings-toolbar');
    if(!toolbar){
      toolbar=document.createElement('div');toolbar.className='dsa-settings-toolbar';
      toolbar.innerHTML='<button type="button" class="dsa-language-control" aria-label="Language"><span class="dsa-globe">◎</span><span class="dsa-language-label"></span><span class="dsa-chevron">⌄</span></button><div class="dsa-open-state"><span class="dsa-state-dot"></span><span><small class="dsa-state-caption"></small><b class="dsa-state-label"></b></span></div>';
      toolbar.querySelector('.dsa-language-control')?.addEventListener('click',()=>{toggleLanguage();setTimeout(sync,60)});card.before(toolbar);
    }
    const open=businessOpenNow();
    toolbar.querySelector('.dsa-language-label').textContent=ar()?'العربية':'English';
    toolbar.querySelector('.dsa-state-caption').textContent=ar()?'حالة النشاط':'Business status';
    toolbar.querySelector('.dsa-state-label').textContent=ar()?(open?'مفتوح الآن':'مغلق الآن'):(open?'Open now':'Closed now');
    toolbar.querySelector('.dsa-open-state').classList.toggle('is-open',open);
  }
  function sync(){const on=active();document.body.classList.toggle('dabbir-settings-approved',on);installHeaderLogo();if(on)ensureToolbar()}
  document.addEventListener('change',event=>{if(event.target?.matches?.('[id^="dk-day-"],[id^="dk-start-"],[id^="dk-end-"]'))setTimeout(ensureToolbar,0)},true);
  document.addEventListener('click',event=>{if(event.target?.closest?.('[data-screen="settings"],#menuBtn,.navBtn,.bottomNav button,.bottomNav a'))setTimeout(sync,0)},true);
  const observer=new MutationObserver(()=>sync());observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','lang','dir']});
  setInterval(()=>{if(active())ensureToolbar()},60000);sync();setTimeout(sync,100);setTimeout(sync,500);
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-settings-approved-ui','v1');
  return res.status(200).send(script);
}
