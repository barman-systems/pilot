const script=String.raw`(()=>{
  if(window.__dabbirMobileShellV3)return;
  window.__dabbirMobileShellV3=true;
  const ICON='/api/dabbir-approved-icon';
  const ar=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];

  const style=document.createElement('style');
  style.dataset.dabbirMobileShellV3='v3';
  style.textContent=[
    ':root{--v3-bg:#07090b;--v3-surface:#11161a;--v3-surface2:#171d22;--v3-line:#2d353d;--v3-muted:#8f98a2;--v3-accent:#d7ff5f}',
    'body{background:var(--v3-bg)!important}',
    '.dabbirMobileBrand,.dabbirTopLogo{display:none!important}',
    '.dabbirHeaderBrandV3{display:flex;align-items:center;gap:9px;min-width:0;flex:1}',
    '.dabbirHeaderMarkV3{width:38px;height:38px;flex:0 0 38px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(145deg,#171f2b,#0d1218);border:1px solid #38434f;box-shadow:0 8px 24px #0007, inset 0 0 0 1px #ffffff05;overflow:hidden}',
    '.dabbirHeaderMarkV3 img{width:100%;height:100%;object-fit:contain;display:block}',
    '.dabbirHeaderCopyV3{min-width:0;display:flex;flex-direction:column;justify-content:center;line-height:1.05}',
    '.dabbirHeaderWordV3{font-size:10px;font-weight:950;letter-spacing:.11em;color:#dce6f2;opacity:.82;margin-bottom:3px}',
    '.dabbirHeaderCopyV3 .pageTitle{font-size:16px!important;font-weight:950!important;max-width:34vw!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dabbirHeaderCopyV3 .statusChip{align-self:flex-start;margin-top:4px!important;font-size:8px!important}',
    '.bottomNav .dabbirNavIconV3{width:22px;height:22px;display:grid;place-items:center;margin:0 auto 4px;opacity:.9}',
    '.bottomNav .dabbirNavIconV3 svg{width:20px;height:20px;display:block;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.bottomNav>button,.bottomNav>a{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important}',
    '.msgrow.ai>.dabbirAiIdentity{display:none!important}',
    '.msgrow.ai>.dabbirSenderLabel{min-height:20px;display:flex;align-items:center;padding-inline-start:25px;background-image:url("/api/dabbir-approved-icon");background-repeat:no-repeat;background-position:inset-inline-start center;background-size:19px 19px;color:#caff68!important}',
    '.dac-open:empty{display:none!important}',
    '@media(max-width:700px){',
      '.top{height:78px!important;padding:0 12px!important;background:#080b0ef7!important;border-bottom:1px solid #242b32!important;box-shadow:0 12px 30px #0004!important}',
      '.top>.row{flex:1!important;min-width:0!important;gap:9px!important}',
      '.mobileMenu{width:46px!important;height:46px!important;flex:0 0 46px!important;border-radius:14px!important;background:#141a1f!important;border:1px solid #313a43!important;font-size:18px!important}',
      '.topActions{flex:0 0 auto!important}.lang{border-radius:14px!important;background:#12171c!important;border-color:#303942!important}.lang button{font-size:12px!important;min-height:38px!important}',
      '.content{padding:16px 12px 116px!important}',
      '.screen>.hero{margin:0 0 12px!important;padding:0 2px!important}.screen>.hero h1{display:none!important}.screen>.hero p{font-size:11px!important;line-height:1.65!important;color:#939ca6!important}',
      '.card,.integration,.chatList,.chatPanel,.table,.workspace,.dabbir-knowledge-card{background:linear-gradient(180deg,#14191e,#0f1317)!important;border-color:#2d353d!important;box-shadow:0 12px 34px #00000028!important}',
      '.card,.integration,.chatList,.chatPanel,.table{border-radius:18px!important}',
      '.cards{gap:9px!important}.card{padding:14px!important}.metric span{font-size:10px!important;color:#9ba3ac!important}.metric strong{font-size:25px!important}',
      '.grid2{gap:10px!important}.item{background:#151b20!important;border-color:#2c343c!important;border-radius:14px!important;padding:12px!important}.item b{font-size:12px!important}.item small{font-size:10px!important;color:#9099a3!important}',
      '#screen-settings #settingsList{display:grid!important;grid-template-columns:1fr!important;gap:7px!important}',
      '#screen-settings #settingsList .item{min-height:70px!important;padding:11px 13px!important}',
      '#screen-settings #logoutBtn{min-height:52px!important;margin-top:10px!important;border-radius:14px!important;font-size:15px!important}',
      '#screen-settings>.card{padding:12px!important}',
      '#screen-conversations .chatList{display:flex!important;overflow-x:auto!important;overflow-y:hidden!important;gap:8px!important;padding:8px!important;max-height:none!important;scrollbar-width:none!important}',
      '#screen-conversations .chatList::-webkit-scrollbar{display:none}',
      '#screen-conversations .chatContact{min-width:min(76vw,300px)!important;flex:0 0 auto!important;margin:0!important;padding:11px 12px!important;border:1px solid transparent!important;border-radius:13px!important}',
      '#screen-conversations .chatContact.active{background:linear-gradient(135deg,#20291b,#182019)!important;border-color:#46552f!important}',
      '#screen-conversations .chatPanel{height:calc(100dvh - 250px)!important;min-height:530px!important;overflow:hidden!important}',
      '#screen-conversations .chatHead{padding:11px!important;background:#12171b!important;border-bottom-color:#293139!important}',
      '#screen-conversations .messages{padding:13px 10px 18px!important;background:radial-gradient(circle at 70% 0,#17201966,transparent 36%),#101417!important}',
      '#screen-conversations .bubble{max-width:86%!important;padding:11px 12px!important;border-radius:17px!important;box-shadow:0 10px 24px #0002!important}',
      '#screen-conversations .bubble .body{font-size:14px!important;line-height:1.62!important}',
      '#screen-conversations .compose{background:#0f1418!important;border-top-color:#293139!important}',
      '.dabbirOwnerChip{min-height:36px!important}',
      '#screen-tasks .card,#screen-operations .card{overflow:hidden}',
      '#screen-tasks .item .badge{font-size:8px!important}',
      '.bottomNav{background:#090d10f4!important;border-top:1px solid #252e35!important;padding:7px 6px calc(7px + env(safe-area-inset-bottom))!important;box-shadow:0 -16px 38px #000b!important;backdrop-filter:blur(20px)!important;-webkit-backdrop-filter:blur(20px)!important}',
      '.bottomNav>button,.bottomNav>a{min-height:58px!important;border-radius:15px!important;color:#88919b!important;font-size:9px!important;padding:6px 2px!important}',
      '.bottomNav>button.active,.bottomNav>a.active{background:linear-gradient(180deg,#1c2517,#161e13)!important;color:#d7ff5f!important;box-shadow:inset 0 0 0 1px #405129,0 8px 20px #0004!important}',
      '.truth{background:#242014!important;border-color:#5b4a22!important;border-radius:14px!important}',
      '.dk-head{background:linear-gradient(180deg,#171d22,#12171b)!important}.dk-section{background:#12171b!important;border-color:#2b343c!important}',
      '.dk-field input,.dk-field textarea,.dk-time input{background:#171d22!important;border-color:#303a43!important}',
      '.primary{border-radius:14px!important;box-shadow:0 10px 24px #d7ff5f12!important}',
    '}',
    '@media(min-width:701px){.dabbirHeaderBrandV3{display:none!important}}'
  ].join('');
  document.head.append(style);

  function iconSvg(name){
    const icons={
      dashboard:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9h13v-9"/></svg>',
      conversations:'<svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 3v-14Z"/></svg>',
      operations:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
      tasks:'<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>',
      team:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3.5 19c.5-4 2.6-6 5.5-6s5 2 5.5 6"/><path d="M14.5 14c2.8.1 4.6 1.8 5 5"/></svg>',
      settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>'
    };
    return icons[name]||icons.operations;
  }

  function ensureHeaderBrand(){
    const row=q('.top>.row');
    const menu=q('#menuBtn');
    const title=q('#pageTitle');
    const chip=q('#runtimeChip');
    if(!row||!menu||!title||!chip)return;
    let brand=row.querySelector('.dabbirHeaderBrandV3');
    if(!brand){
      brand=document.createElement('div');
      brand.className='dabbirHeaderBrandV3';
      const mark=document.createElement('span');mark.className='dabbirHeaderMarkV3';
      const img=document.createElement('img');img.src=ICON;img.alt='DABBIR';img.decoding='async';img.loading='eager';mark.append(img);
      const copy=document.createElement('span');copy.className='dabbirHeaderCopyV3';
      const word=document.createElement('span');word.className='dabbirHeaderWordV3';word.textContent='DABBIR';
      copy.append(word,title,chip);brand.append(mark,copy);
      if(menu.nextSibling)row.insertBefore(brand,menu.nextSibling);else row.append(brand);
    }
  }

  function upgradeBottomNav(){
    const nav=q('#bottomNav');if(!nav)return;
    [...nav.children].forEach(el=>{
      if(el.dataset.dabbirNavV3==='true')return;
      let key=el.dataset.screen||'';
      if(el.matches('[data-dabbir-team-mobile]'))key='team';
      const label=el.querySelector('[data-label]');
      if(!label)return;
      const text=label.textContent;
      el.replaceChildren();
      const icon=document.createElement('span');icon.className='dabbirNavIconV3';icon.innerHTML=iconSvg(key);
      const nextLabel=document.createElement('span');nextLabel.dataset.label=label.dataset.label;nextLabel.textContent=text;
      el.append(icon,nextLabel);el.dataset.dabbirNavV3='true';
    });
  }

  function localizeMachineText(){
    const mapAr={SUPPORT:'دعم / تدخل بشري',manual_takeover:'استلام يدوي',RETURNED_TO_AI:'أُعيدت إلى دَبِّر',returned_to_ai:'أُعيدت إلى دَبِّر',OPEN:'مفتوح',RESOLVED:'مكتمل',CLOSED:'مغلق',PENDING:'قيد المتابعة'};
    const mapEn={SUPPORT:'Human support',manual_takeover:'Manual takeover',RETURNED_TO_AI:'Returned to DABBIR',returned_to_ai:'Returned to DABBIR',OPEN:'Open',RESOLVED:'Resolved',CLOSED:'Closed',PENDING:'Pending'};
    const map=ar()?mapAr:mapEn;
    qa('#screen-tasks .item b,#screen-tasks .item small,#screen-tasks .badge').forEach(el=>{
      const raw=(el.dataset.rawMachineText||el.textContent||'').trim();
      if(!el.dataset.rawMachineText)el.dataset.rawMachineText=raw;
      if(map[raw])el.textContent=map[raw];
    });
  }

  function cleanConversationIdentity(){
    qa('#messages .msgrow.ai').forEach(row=>{
      const identities=row.querySelectorAll(':scope > .dabbirAiIdentity');
      identities.forEach(node=>node.remove());
      const label=row.querySelector(':scope > .dabbirSenderLabel');
      if(label)label.textContent='DABBIR';
    });
  }

  function removeBlankControls(){qa('.dac-open').forEach(btn=>{if(!String(btn.textContent||'').trim())btn.remove()})}

  function polish(){ensureHeaderBrand();upgradeBottomNav();localizeMachineText();cleanConversationIdentity();removeBlankControls()}
  const observer=new MutationObserver(()=>requestAnimationFrame(polish));
  observer.observe(document.body,{subtree:true,childList:true});
  if(typeof renderAll==='function'&&!window.__dabbirMobileShellRenderWrapped){
    window.__dabbirMobileShellRenderWrapped=true;const base=renderAll;renderAll=function(){const out=base.apply(this,arguments);requestAnimationFrame(polish);return out};
  }
  if(typeof renderMessages==='function'&&!window.__dabbirMobileShellMessagesWrapped){
    window.__dabbirMobileShellMessagesWrapped=true;const base=renderMessages;renderMessages=function(){const out=base.apply(this,arguments);requestAnimationFrame(cleanConversationIdentity);return out};
  }
  if(typeof applyLang==='function'&&!window.__dabbirMobileShellLangWrapped){
    window.__dabbirMobileShellLangWrapped=true;const base=applyLang;applyLang=function(){const out=base.apply(this,arguments);requestAnimationFrame(polish);return out};
  }
  setTimeout(polish,0);setTimeout(polish,400);setTimeout(polish,1200);
  window.__dabbirMobileShellV3Version='brand-visible-premium-v3';
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-mobile-shell','brand-visible-premium-v3');
  return res.status(200).send(script);
}
