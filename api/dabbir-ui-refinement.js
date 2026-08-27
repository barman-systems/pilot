const script=String.raw`(()=>{
  if(window.__dabbirUiRefinementLoaded)return;
  window.__dabbirUiRefinementLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirUiRefinement='v3';
  style.textContent=[
    ':root{--dabbir-surface:#111417;--dabbir-surface-2:#171b1f;--dabbir-line:#2b3137;--dabbir-soft:#8f969f;--dabbir-accent:#d7ff5f}',
    'body{background:#080a0c!important}',
    '.card,.chatList,.chatPanel,.integration,.table,.workspace{border-color:var(--dabbir-line)!important;background:linear-gradient(180deg,#15191d 0%,#101316 100%)!important}',
    '.card,.integration,.chatList,.chatPanel,.table{box-shadow:0 10px 30px #00000018}',
    '.primary{box-shadow:0 7px 20px #d7ff5f12;font-weight:900!important}',
    '.secondary{border-color:#343b43!important;background:#171b1f!important}',
    '.statusChip{border:1px solid #1f4d2c!important;box-shadow:inset 0 0 0 1px #ffffff05}',
    '.hero h1{letter-spacing:-.02em}',
    '.item{border-color:#293038!important;background:#15191d!important}',
    '.bottomNav{backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 -12px 35px #0008}',
    '.bottomNav button,.bottomNav a{transition:background .16s,color .16s,transform .16s}',
    '.bottomNav button:active,.bottomNav a:active{transform:scale(.97)}',
    '#screen-conversations .chatContact{border:1px solid transparent;transition:border-color .15s,background .15s}',
    '#screen-conversations .chatContact.active{background:#20251f!important;border-color:#3e4a2b!important}',
    '#screen-conversations .chatContact span{line-height:1.5}',
    '#screen-conversations .bubble{box-shadow:0 8px 24px #0000001c!important}',
    '#screen-conversations .msgrow.customer .bubble{border-top-left-radius:6px!important}',
    'html[dir="rtl"] #screen-conversations .msgrow.customer .bubble{border-top-left-radius:15px!important;border-top-right-radius:6px!important}',
    '#screen-conversations .msgrow.ai .bubble,#screen-conversations .msgrow.human .bubble{border-top-right-radius:6px!important}',
    'html[dir="rtl"] #screen-conversations .msgrow.ai .bubble,html[dir="rtl"] #screen-conversations .msgrow.human .bubble{border-top-right-radius:15px!important;border-top-left-radius:6px!important}',
    '.dabbirPasswordHint{display:none;margin-top:6px;color:#aab1ba;font-size:10px;line-height:1.55}',
    '.dabbirPasswordHint.on{display:block}',
    '.dabbirRecoveryCard .dabbirPasswordHint{display:block;margin:7px 0 2px}',
    '@media(max-width:700px){',
      'html{background:#080a0c!important}',
      'body{font-size:15px!important}',
      '.top{height:72px!important;padding:0 14px!important;background:#080a0cf2!important;border-bottom-color:#20262c!important;gap:9px!important}',
      '.top>.row{min-width:0;flex:1;gap:9px!important}',
      '.pageTitle{font-size:16px!important;line-height:1.2!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw}',
      '.statusChip{font-size:9px!important;padding:5px 8px!important;margin-top:3px}',
      '.topActions{gap:5px!important;flex:0 0 auto}',
      '.lang{border-radius:14px!important;padding:3px!important;background:#15191d!important}',
      '.lang button{min-height:36px!important;padding:5px 9px!important;font-size:12px!important}',
      '.mobileMenu{width:46px!important;height:46px!important;border-radius:14px!important;background:#15191d!important;border-color:#30373e!important}',
      '.dabbirTopLogo{width:34px!important;height:34px!important;border-radius:10px!important}',
      '.content{padding:13px 12px 112px!important;max-width:none!important}',
      '.screen>.hero{margin:0 0 10px!important;min-height:0!important;align-items:center!important}',
      '.screen>.hero>div{min-width:0;flex:1}',
      '.screen>.hero h1{display:none!important}',
      '.screen>.hero p{font-size:11px!important;line-height:1.55!important;color:#9198a1!important;margin:0!important}',
      '.screen>.hero>.primary,.screen>.hero>.secondary{min-height:42px!important;padding:7px 10px!important;font-size:10px!important;flex:0 0 auto}',
      '.cards{gap:8px!important}',
      '.card{border-radius:17px!important;padding:13px!important}',
      '.metric span{font-size:10px!important}.metric strong{font-size:24px!important;margin-top:4px!important}',
      '.sectionHead{margin-bottom:9px!important}.sectionHead h2{font-size:13px!important}',
      '.item{padding:11px!important;border-radius:13px!important}',
      '.item b{font-size:12px!important;line-height:1.45!important}.item small{font-size:10px!important;line-height:1.45!important}',
      '.badge{font-size:8px!important;padding:5px 7px!important}',
      '.empty{padding:18px 12px!important;font-size:11px!important}',
      '.grid2{gap:9px!important;margin-top:9px!important}',
      '.integrationGrid{gap:9px!important}.integration{padding:13px!important;border-radius:16px!important}.integration h3{font-size:13px!important}.integration p{font-size:10px!important;line-height:1.65!important}',
      '.truth{border-radius:13px!important;font-size:9px!important;line-height:1.6!important}',
      '#screen-conversations .chatGrid{display:flex!important;flex-direction:column!important;gap:8px!important;min-height:0!important}',
      '#screen-conversations .chatList{display:flex!important;gap:7px!important;overflow-x:auto!important;overflow-y:hidden!important;max-height:none!important;padding:8px!important;margin:0!important;border-radius:15px!important;scrollbar-width:none}',
      '#screen-conversations .chatList::-webkit-scrollbar{display:none}',
      '#screen-conversations .chatContact{min-width:min(78vw,300px)!important;margin:0!important;padding:10px 11px!important;border-radius:12px!important;flex:0 0 auto}',
      '#screen-conversations .chatContact b{font-size:12px!important;line-height:1.45!important}',
      '#screen-conversations .chatContact span{font-size:9px!important;margin-top:3px!important;display:block!important}',
      '#screen-conversations .chatPanel{height:calc(100dvh - 242px)!important;min-height:520px!important;border-radius:17px!important}',
      '#screen-conversations .chatHead{padding:10px 11px!important;gap:8px!important;border-bottom-color:#293038!important}',
      '#screen-conversations #chatName{font-size:13px!important}',
      '#screen-conversations #chatState{font-size:9px!important;line-height:1.4!important}',
      '#screen-conversations .dabbirChatControl{gap:6px!important}',
      '#screen-conversations .dabbirOwnerChip{min-height:34px!important;padding:6px 9px!important;font-size:9px!important}',
      '#screen-conversations .dabbirTakeover{min-height:36px!important;font-size:9px!important;border-radius:11px!important}',
      '#screen-conversations #translateAll{min-height:36px!important;font-size:9px!important;border-radius:11px!important}',
      '#screen-conversations .messages{padding:12px 10px 16px!important}',
      '#screen-conversations .dabbirSenderLabel{font-size:9px!important;margin-bottom:5px!important}',
      '#screen-conversations .dabbirAiIdentity{font-size:9px!important;margin-bottom:5px!important}',
      '#screen-conversations .dabbirAiIdentity img{width:21px!important;height:21px!important}',
      '#screen-conversations .bubble{max-width:86%!important;padding:10px 11px!important;border-radius:16px!important}',
      '#screen-conversations .bubble .body{font-size:14px!important;line-height:1.62!important}',
      '#screen-conversations .bubble .original{font-size:10px!important;line-height:1.55!important}',
      '#screen-conversations .meta{font-size:9px!important}',
      '#screen-conversations .meta button{font-size:9px!important}',
      '#screen-conversations .compose{padding:8px 9px calc(8px + env(safe-area-inset-bottom))!important}',
      '#screen-conversations .compose input{font-size:16px!important;min-height:48px!important}',
      '.bottomNav{padding:7px 7px calc(7px + env(safe-area-inset-bottom))!important;background:#0b0e10f2!important;border-top-color:#252b31!important;gap:3px!important}',
      '.bottomNav>button,.bottomNav>a{min-height:54px!important;border-radius:14px!important;font-size:9px!important;line-height:1.25!important;padding:5px 3px!important}',
      '.bottomNav>button.active,.bottomNav>a.active{background:#1d2419!important;color:#d7ff5f!important;box-shadow:inset 0 0 0 1px #344324!important}',
      '#screen-settings .dabbir-knowledge-card{border-radius:17px!important}',
      '.dk-section-head h3{font-size:12px!important}.dk-field label{font-size:10px!important}',
      '.dk-hours-help{font-size:9px!important}.dk-hours-tools button{font-size:9px!important}',
      '.dk-day-toggle{font-size:10px!important}',
      '.authCard{border-radius:22px!important;padding:20px!important;background:#111519f2!important;border-color:#2c333a!important}',
      '.authCard h1{font-size:22px!important}.authCard p{font-size:11px!important}',
    '}',
    '@media(min-width:701px){.content{padding-top:28px}.card,.integration,.chatList,.chatPanel{border-radius:20px}.side{background:#0b0e10f4!important}.navBtn{border-radius:12px!important}}'
  ].join('');
  document.head.appendChild(style);

  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const stateLabel=(state)=>{
    const s=String(state||'').toLowerCase();
    const a={waiting_customer:'ينتظر رد العميل',ai_active:'دَبِّر يتولى المحادثة',human_active:'رد يدوي من الموظف',action_required:'تحتاج تدخلك',closed:'مغلقة',resolved:'مكتملة',open:'مفتوحة'};
    const e={waiting_customer:'Waiting for customer',ai_active:'DABBIR is handling it',human_active:'Staff reply mode',action_required:'Needs your attention',closed:'Closed',resolved:'Resolved',open:'Open'};
    return (ar()?a:e)[s]||String(state||'').replaceAll('_',' ');
  };

  function passwordHint(){
    return ar()
      ? '12 حرفًا على الأقل. تجنّب الكلمات الشائعة والتسلسلات واسم بريدك. العبارات الطويلة مسموحة.'
      : 'Use 12+ characters. Avoid common passwords, sequences, and your email identity. Long passphrases are supported.';
  }

  function installPasswordGuidance(){
    const password=document.querySelector('#authPassword');
    const field=password?.closest('.field');
    if(password&&field){
      let hint=field.querySelector('[data-dabbir-password-hint="signup"]');
      if(!hint){
        hint=document.createElement('div');
        hint.className='dabbirPasswordHint';
        hint.dataset.dabbirPasswordHint='signup';
        hint.id='dabbirSignupPasswordHint';
        password.insertAdjacentElement('afterend',hint);
      }
      const signup=!!document.querySelector('#signupTab')?.classList.contains('on');
      hint.classList.toggle('on',signup);
      hint.textContent=passwordHint();
      if(signup){
        password.minLength=12;
        password.setAttribute('aria-describedby',hint.id);
        password.title=passwordHint();
      }
    }

    const reset=document.querySelector('#dabbirNewPassword');
    if(reset){
      let hint=document.querySelector('[data-dabbir-password-hint="reset"]');
      if(!hint){
        hint=document.createElement('div');
        hint.className='dabbirPasswordHint';
        hint.dataset.dabbirPasswordHint='reset';
        hint.id='dabbirResetPasswordHint';
        reset.insertAdjacentElement('afterend',hint);
      }
      hint.textContent=passwordHint();
      reset.setAttribute('aria-describedby',hint.id);
      reset.title=passwordHint();
    }
  }

  document.querySelector('#loginTab')?.addEventListener('click',()=>setTimeout(installPasswordGuidance,0));
  document.querySelector('#signupTab')?.addEventListener('click',()=>setTimeout(installPasswordGuidance,0));

  function translateConversationStates(){
    document.querySelectorAll('#screen-conversations .chatContact').forEach(card=>{
      const span=card.querySelector('span');
      if(!span)return;
      const raw=span.dataset.dabbirRawState||span.textContent||'';
      if(!span.dataset.dabbirRawState){
        const match=raw.match(/(?:Web\s*[•·-]\s*)?(.+)$/i);
        span.dataset.dabbirRawState=(match?.[1]||raw).trim();
      }
      const state=span.dataset.dabbirRawState;
      span.textContent=(ar()?'محادثة Web • ':'Web conversation • ')+stateLabel(state);
    });
    const chatState=document.querySelector('#chatState');
    if(chatState){
      let raw=chatState.dataset.dabbirRawState;
      if(!raw){
        const current=String(chatState.textContent||'');
        const match=current.match(/(?:Web\s*[•·-]\s*)?(.+)$/i);
        raw=(match?.[1]||current).trim();
        if(raw)chatState.dataset.dabbirRawState=raw;
      }
      if(raw&&!raw.includes('DABBIR')&&!raw.includes('دَبِّر')&&!raw.includes('يدوي')&&!raw.includes('تدخل'))chatState.textContent=stateLabel(raw);
    }
  }

  function compactSingleConversation(){
    const list=document.querySelector('#screen-conversations .chatList');
    if(!list)return;
    const count=list.querySelectorAll('.chatContact').length;
    list.classList.toggle('dabbirSingleChat',count===1);
  }

  function polish(){translateConversationStates();compactSingleConversation();installPasswordGuidance()}
  if(typeof renderChats==='function'&&!window.__dabbirUiRenderChatsWrapped){
    window.__dabbirUiRenderChatsWrapped=true;
    const base=renderChats;
    renderChats=function(){const out=base.apply(this,arguments);polish();return out};
  }
  if(typeof applyLang==='function'&&!window.__dabbirUiApplyLangWrapped){
    window.__dabbirUiApplyLangWrapped=true;
    const base=applyLang;
    applyLang=function(){const out=base.apply(this,arguments);setTimeout(polish,0);return out};
  }
  const observer=new MutationObserver(()=>setTimeout(polish,0));
  observer.observe(document.body,{subtree:true,childList:true});
  setTimeout(polish,0);
  setTimeout(polish,500);
  window.__dabbirUiRefinementVersion='mobile-premium-v3';
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-ui-refinement','mobile-premium-v3');
  return res.end(script);
}
