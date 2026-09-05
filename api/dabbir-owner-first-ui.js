const script = String.raw`(()=>{
  if(window.__dabbirOwnerFirstUiV4) return;
  window.__dabbirOwnerFirstUiV4=true;

  const ICON='/dabbir-app-icon.png';
  const isArabic=()=>String(document.documentElement.lang||'ar').toLowerCase().startsWith('ar');
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const workspaceNow=()=>{try{return typeof workspace!=='undefined'?workspace:window.workspace}catch{return window.workspace||null}};

  const style=document.createElement('style');
  style.dataset.dabbirUiAuthority='owner-first-v4';
  style.dataset.dabbirDesignSystem='executive-calm-v1';
  style.textContent=[
    ':root{color-scheme:dark;--ds-bg:#07111f;--ds-shell:#091421;--ds-surface:#0d1a2a;--ds-surface2:#102033;--ds-surface3:#14263a;--ds-border:#94a3b826;--ds-border-strong:#94a3b83d;--ds-text:#f7fafc;--ds-muted:#9cabbf;--ds-muted2:#718198;--ds-brand:#536dfe;--ds-brand-hover:#667dfd;--ds-brand-soft:#536dfe1f;--ds-ai-violet:#7c5cff;--ds-ai-blue:#4f7cff;--ds-ai-cyan:#22b8cf;--ds-success:#56d6a0;--ds-warning:#f4c55e;--ds-danger:#ff7f96;--ds-info:#76b8ff;--ds-control:10px;--ds-card:14px;--ds-large:18px;--ds-shadow-raised:0 18px 48px #00000040;--accent:var(--ds-brand)!important;--green:var(--ds-success)!important;--yellow:var(--ds-warning)!important;--red:var(--ds-danger)!important;--blue:var(--ds-info)!important;--muted:var(--ds-muted)!important;--line:var(--ds-border)!important;--bg:var(--ds-bg)!important;--panel:var(--ds-surface)!important;--panel2:var(--ds-surface2)!important;--r:var(--ds-card)!important;--shadow:var(--ds-shadow-raised)!important}',
    'html,body{background:linear-gradient(180deg,#0a1625 0,var(--ds-bg) 42%,#06101c 100%)!important;color:var(--ds-text)!important}',
    'body{min-height:100dvh;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-family:"SF Arabic","Noto Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif!important}',
    'html[lang^=en] body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif!important}',
    'button,input,select,textarea{font-family:inherit}',
    'button{transition:background .14s ease,border-color .14s ease,opacity .14s ease,transform .14s ease}',
    'button:active{transform:scale(.982)}',
    'button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid #8ea0ff!important;outline-offset:2px!important}',
    '.primary{border:1px solid #ffffff10!important;background:var(--ds-brand)!important;color:white!important;font-weight:750!important;box-shadow:none!important}',
    '.primary:hover{background:var(--ds-brand-hover)!important}',
    '.secondary{border:1px solid var(--ds-border)!important;background:#ffffff08!important;color:var(--ds-text)!important;box-shadow:none!important;font-weight:650!important}',
    '.secondary:hover{background:#ffffff0d!important;border-color:var(--ds-border-strong)!important}',
    '.card,.chatList,.chatPanel,.integration,.table,.workspace,.dabbir-knowledge-card,.dabbir-action-center,.moreCard{background:var(--ds-surface)!important;border:1px solid var(--ds-border)!important;box-shadow:none!important}',
    '.card,.integration,.chatList,.chatPanel,.table,.dabbir-knowledge-card,.dabbir-action-center,.moreCard{border-radius:var(--ds-card)!important}',
    '.item{background:#ffffff06!important;border:1px solid var(--ds-border)!important;border-radius:12px!important}',
    '.muted,.item small,.integration p,.hero p{color:var(--ds-muted)!important}',
    '.badge,.statusChip{border:1px solid transparent!important;font-weight:700!important;letter-spacing:0!important}',
    '.green,.statusChip{background:#153328!important;color:#7ce2ba!important;border-color:#2b614f!important}',
    '.yellow{background:#3a2d13!important;color:#f8d578!important;border-color:#705723!important}',
    '.red{background:#3a1821!important;color:#ff9cad!important;border-color:#6f2b3c!important}',
    '.blue{background:#132d49!important;color:#91caff!important;border-color:#2a567b!important}',
    '.gray{background:#ffffff08!important;color:#c5cfda!important;border-color:var(--ds-border)!important}',
    '.shell{grid-template-columns:264px minmax(0,1fr)!important}',
    '.side{background:var(--ds-shell)!important;border-inline-end:1px solid var(--ds-border)!important;padding:18px 14px!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
    '.side>.brand{padding:4px 7px 9px!important;gap:10px!important}.side>.brand b{font-size:15px!important;font-weight:800!important;letter-spacing:.08em}.side>.brand small{font-size:12px!important;line-height:1.45!important}',
    '.side .logo{width:42px!important;height:42px!important;border-radius:12px!important}',
    '.workspace{margin:12px 0 14px!important;padding:12px 13px!important;border-radius:12px!important;background:#ffffff05!important}.workspace b{font-size:14px!important;font-weight:700!important}.workspace span{font-size:12px!important;line-height:1.45!important;color:var(--ds-success)!important}',
    '.nav{gap:4px!important}.navBtn{position:relative;min-height:46px!important;padding:9px 11px!important;border-radius:10px!important;color:#a5b3c5!important;gap:10px!important;font-size:14px!important;line-height:1.35!important;font-weight:620!important;box-shadow:none!important}',
    '.navBtn:hover{background:#ffffff06!important;color:white!important}.navBtn.active{background:var(--ds-brand-soft)!important;color:#f5f7ff!important;box-shadow:none!important}',
    '.navBtn.active:before{content:"";position:absolute;inset-block:10px;inset-inline-start:0;width:3px;border-radius:999px;background:#7f91ff}',
    '.d4-nav-icon{width:22px;height:22px;display:grid;place-items:center;flex:0 0 22px;color:#8799af}.navBtn.active .d4-nav-icon{color:#9aa9ff}',
    '.d4-nav-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.sideFoot{border-top:1px solid var(--ds-border)!important;padding-top:12px!important}.sideFoot .secondary{border-radius:10px!important}',
    '.top{height:68px!important;padding:0 22px!important;background:#091421f2!important;border-bottom:1px solid var(--ds-border)!important;backdrop-filter:blur(12px)!important;-webkit-backdrop-filter:blur(12px)!important;box-shadow:none!important}',
    '.top>.row{min-width:0;gap:10px!important}.d4-header-mark{width:38px;height:38px;display:none;object-fit:contain;flex:0 0 38px;border-radius:11px}.pageTitle{font-size:16px!important;font-weight:760!important;letter-spacing:-.01em}.statusChip{font-size:12px!important;line-height:1.35!important;margin-top:3px!important;padding:4px 8px!important}',
    '.lang{background:#ffffff06!important;border:1px solid var(--ds-border)!important;border-radius:10px!important}.lang button{color:#a8b4c4!important;border-radius:8px!important;font-size:12px!important;font-weight:650!important}.lang button.on{background:#ffffff0d!important;color:white!important}',
    '.content{max-width:1280px!important;padding:28px 24px 110px!important}',
    '.hero{margin-bottom:16px!important;align-items:center!important}.hero h1{font-size:27px!important;line-height:1.28!important;font-weight:780!important;letter-spacing:-.025em!important}.hero p{font-size:14px!important;line-height:1.7!important;max-width:720px!important}.eyebrow{color:#8fa0ff!important;font-size:11px!important;font-weight:700!important;letter-spacing:.02em!important}',
    '.cards{gap:10px!important}.card{padding:16px!important}.metric{position:relative;overflow:hidden;min-height:104px!important}.metric:after{display:none!important}.metric span{font-size:13px!important;line-height:1.4!important;color:#aeb9c8!important}.metric strong{font-size:28px!important;font-weight:760!important;letter-spacing:-.025em!important}.d4-metric-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;margin-bottom:12px;background:#536dfe14;border:1px solid #536dfe26;color:#97a6ff}.d4-metric-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.grid2{gap:12px!important}.sectionHead h2{font-size:15px!important;font-weight:730!important}.truth{background:#132236!important;border:1px solid #2b4461!important;color:#c8d4e2!important;border-radius:12px!important;font-size:13px!important;line-height:1.65!important}',
    '.todayGrid{gap:12px!important}.quickAction{background:#ffffff06!important;border:1px solid var(--ds-border)!important;border-radius:12px!important;color:var(--ds-text)!important}.quickAction:hover{background:#ffffff0a!important;border-color:var(--ds-border-strong)!important}.quickAction b{font-size:13px!important;font-weight:700!important}.quickAction span{font-size:12px!important;line-height:1.5!important;color:var(--ds-muted)!important}',
    '.setupCard{background:var(--ds-surface)!important;border:1px solid var(--ds-border)!important;border-radius:var(--ds-card)!important;padding:15px!important}.setupCard h3{font-size:14px!important;font-weight:720!important}.setupCard p{color:var(--ds-muted)!important;font-size:12px!important}.setupStep{font-size:12px!important}.dot{background:var(--ds-warning)!important}.dot.ok{background:var(--ds-success)!important}',
    '.dabbir-action-center{padding:16px!important;margin-bottom:12px!important;background:var(--ds-surface)!important}.dac-head strong{font-size:16px!important;font-weight:740!important}.dac-status{font-size:12px!important;line-height:1.45!important;color:var(--ds-muted)!important}.dac-brief{font-size:13px!important;color:#dce6f1!important;line-height:1.7!important}.dac-metric{background:#ffffff05!important;border-color:var(--ds-border)!important;border-radius:11px!important}.dac-metric span{font-size:12px!important;line-height:1.4!important}.dac-metric.handled strong{color:#7ce2ba!important}.dac-metric.critical strong{color:#ff9cad!important}.dac-metric.warning strong{color:#f8d578!important}.dac-item{background:#ffffff05!important;border-color:var(--ds-border)!important;border-radius:11px!important}.dac-item-body b{font-size:13px!important;line-height:1.45!important;font-weight:700!important}.dac-item-body span,.dac-item-body small{font-size:12px!important;line-height:1.5!important}.dac-open,.dac-more{font-size:12px!important;min-height:44px!important;border-radius:10px!important}.dac-empty{font-size:13px!important;line-height:1.55!important;color:#7ce2ba!important;border-color:#285b4a!important;background:#10291f!important}',
    '.dabbirCopilot{margin:0 0 12px!important;border:1px solid #536dfe42!important;background:linear-gradient(180deg,#101d31 0,#0d1a2a 100%)!important;border-radius:var(--ds-large)!important;padding:18px!important;box-shadow:var(--ds-shadow-raised)!important;position:relative!important;overflow:hidden!important}',
    '.dabbirCopilot:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,var(--ds-ai-violet),var(--ds-ai-blue),var(--ds-ai-cyan));opacity:.9}.dcHead h2{font-size:18px!important;font-weight:760!important}.dcHead p{font-size:12px!important;line-height:1.6!important;color:var(--ds-muted)!important}.dcLogo{width:40px!important;height:40px!important;border-radius:11px!important}.dcMode{border:1px solid #2b6150!important;background:#143328!important;color:#82e2bd!important;border-radius:999px!important;padding:6px 9px!important;font-size:11px!important;font-weight:700!important}',
    '.dcProof{gap:8px!important;margin:14px 0!important}.dcMetric{border:1px solid var(--ds-border)!important;background:#ffffff05!important;border-radius:11px!important;padding:11px!important}.dcMetric strong{font-size:19px!important;font-weight:760!important}.dcMetric span{margin-top:4px!important;color:var(--ds-muted)!important;font-size:11px!important;line-height:1.45!important}',
    '.dcAsk{gap:8px!important}.dcInput{min-height:50px!important;border:1px solid var(--ds-border-strong)!important;background:#081525!important;color:var(--ds-text)!important;border-radius:11px!important;padding:11px 13px!important;font-size:14px!important;box-shadow:none!important}.dcInput:focus{border-color:#7185ff!important;box-shadow:0 0 0 3px #536dfe20!important}.dcAsk button{min-width:88px!important;border:1px solid #ffffff12!important;border-radius:10px!important;background:linear-gradient(135deg,var(--ds-ai-violet),var(--ds-ai-blue) 62%,var(--ds-ai-cyan))!important;color:#fff!important;font-weight:760!important;box-shadow:none!important}',
    '.dcSuggestions{gap:6px!important;margin-top:9px!important}.dcSuggestion{min-height:36px!important;border:1px solid var(--ds-border)!important;background:#ffffff05!important;color:#bcc7d6!important;border-radius:999px!important;padding:7px 10px!important;font-size:11px!important;font-weight:650!important}.dcSuggestion:hover{border-color:#536dfe55!important;color:#fff!important;background:#536dfe12!important}',
    '.dcAnswer{margin-top:11px!important;border:1px solid var(--ds-border)!important;background:#081525!important;border-radius:12px!important;padding:13px!important}.dcAnswerText{font-size:13px!important;line-height:1.75!important;color:#eef4fb!important}.dcOpen{min-height:40px!important;border:1px solid var(--ds-border-strong)!important;background:#ffffff07!important;color:#eef4ff!important;border-radius:10px!important;padding:7px 11px!important;font-size:11px!important;font-weight:700!important}.dcAnswerMeta{border-top:1px solid var(--ds-border)!important;color:var(--ds-muted2)!important;font-size:10px!important}.dcAnswerMeta b{color:#7ce2ba!important;font-weight:700!important}',
    '.integrationGrid{gap:10px!important}.integration{padding:15px!important;position:relative;overflow:hidden}.integration h3{font-size:15px!important;font-weight:720!important}.integration p{font-size:13px!important;line-height:1.6!important}.dabbirWhatsAppIdentity{background:#ffffff05!important;border-color:var(--ds-border)!important;border-radius:11px!important}.dabbirWhatsAppActions{gap:7px!important}.dabbirWhatsAppActions button{min-height:44px!important;border-radius:10px!important}.dabbirWhatsAppConnect{background:#23b967!important;color:white!important;box-shadow:none!important}',
    '.chatGrid{gap:10px!important}.chatList{padding:9px!important}.chatContact{border:1px solid transparent!important;border-radius:11px!important;padding:11px 12px!important;transition:background .14s,border-color .14s!important}.chatContact:hover{background:#ffffff05!important}.chatContact.active{background:var(--ds-brand-soft)!important;border-color:#536dfe3b!important}.chatContact b{font-size:14px!important;font-weight:700!important}.chatContact span{font-size:12px!important;line-height:1.45!important;color:#a7b5c5!important}.chatHead{padding:12px 13px!important;background:#ffffff03!important;border-bottom:1px solid var(--ds-border)!important}.messages{background:#0a1625!important;padding:16px!important}.bubble{border:1px solid var(--ds-border)!important;background:#142238!important;box-shadow:none!important}.msgrow.ai .bubble,.msgrow.human .bubble{background:#172849!important;border-color:#536dfe36!important}.bubble .body{font-size:14px!important;line-height:1.68!important}.d4-sender{display:flex;align-items:center;gap:6px;margin:0 5px 5px;color:#9db0ff;font-size:12px;font-weight:700}.d4-sender img{width:20px;height:20px;object-fit:contain;border-radius:6px}.compose{background:#0a1625!important;border-top:1px solid var(--ds-border)!important;padding:9px!important}.compose input{background:#ffffff06!important;border:1px solid var(--ds-border)!important;border-radius:11px!important;color:white!important}.send{background:var(--ds-brand)!important;color:white!important;border-radius:10px!important;box-shadow:none!important}',
    '.field input,.field select,.dk-field input,.dk-field textarea,.dk-time input{background:#ffffff06!important;border:1px solid var(--ds-border)!important;color:white!important;border-radius:10px!important}.field label,.dk-field label{color:#aab8c9!important;font-size:13px!important;line-height:1.45!important}',
    '.authWrap{background:linear-gradient(180deg,#0a1625,var(--ds-bg) 58%)!important;padding:20px!important}.authCard{width:min(440px,100%)!important;padding:26px!important;background:var(--ds-surface)!important;border:1px solid var(--ds-border)!important;border-radius:var(--ds-large)!important;box-shadow:var(--ds-shadow-raised)!important}.authCard>.brand{justify-content:center!important;flex-direction:column!important;text-align:center!important;gap:8px!important}.authCard .logo{width:62px!important;height:62px!important;border-radius:16px!important}.authCard>.brand b{font-size:15px!important;font-weight:780!important;letter-spacing:.1em}.authCard h1{text-align:center!important;font-size:24px!important;font-weight:760!important;letter-spacing:-.02em!important;margin-top:20px!important}.authCard p{text-align:center!important;color:var(--ds-muted)!important;font-size:14px!important;line-height:1.7!important}.authTabs{background:#ffffff05!important;border-color:var(--ds-border)!important;border-radius:11px!important}.authTabs button.on{background:#ffffff0d!important;color:white!important}.authMsg{font-size:13px!important;line-height:1.5!important}',
    '.modal{backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}.modalBox{background:var(--ds-surface)!important;border:1px solid var(--ds-border)!important;border-radius:var(--ds-large)!important;box-shadow:var(--ds-shadow-raised)!important}.toast{background:#f8fafc!important;color:#0f172a!important;border-radius:10px!important;box-shadow:0 14px 34px #0005!important}',
    '.moreCard{color:var(--ds-text)!important}.moreCard:hover{background:var(--ds-surface2)!important;border-color:var(--ds-border-strong)!important}.moreCard h3{font-size:14px!important;font-weight:720!important}.moreCard p{font-size:12px!important;line-height:1.6!important}',
    '.table{border-color:var(--ds-border)!important}.tr{border-bottom-color:var(--ds-border)!important;font-size:12px!important}.tr.head{background:#ffffff04!important;color:var(--ds-muted)!important}',
    '.dabbirMobileBrand{display:none!important}',
    '@media(max-width:700px){body:not(.dabbir-settings-approved) #appShell .top{height:auto!important;min-height:112px!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:8px!important;padding:calc(10px + env(safe-area-inset-top)) 12px 10px!important}body:not(.dabbir-settings-approved) #appShell .top>.row{min-width:0!important;width:100%!important;gap:10px!important}body:not(.dabbir-settings-approved) #appShell .topActions{justify-content:flex-end!important;flex-wrap:wrap!important;width:100%!important}body:not(.dabbir-settings-approved) #appShell .top .d4-header-mark,body:not(.dabbir-settings-approved) #appShell .top .dabbirHeaderMarkV3,body:not(.dabbir-settings-approved) #appShell .top .dsa-header-logo{display:none!important}body:not(.dabbir-settings-approved) #appShell .top #pageTitle{max-width:none!important;white-space:normal!important;line-height:1.4!important}body:not(.dabbir-settings-approved) #appShell .top #runtimeChip{white-space:normal!important;max-width:100%!important}body:not(.dabbir-settings-approved) #appShell .dabbirHeaderCopyV3{flex:1!important;min-width:0!important}.dabbirWhatsAppHint{font-size:13px!important;line-height:1.6!important}}',

    '@media(max-width:920px){.shell{grid-template-columns:1fr!important}.side{width:min(82vw,286px)!important;box-shadow:18px 0 48px #0008!important}.content{padding-inline:16px!important}.cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
    '@media(max-width:700px){',
      'html{background:var(--ds-bg)!important}body{font-size:16px!important}',
      'button,input,select,textarea,a{min-height:48px}',
      '.top{height:calc(64px + env(safe-area-inset-top))!important;padding:env(safe-area-inset-top) 12px 0!important;align-items:center!important}',
      '.top>.row{flex:1!important;gap:9px!important}.d4-header-mark{display:block!important;width:36px!important;height:36px!important;flex-basis:36px!important}',
      '.mobileMenu{display:inline-flex!important;align-items:center!important;justify-content:center!important;visibility:visible!important;width:44px!important;height:44px!important;min-height:44px!important;flex:0 0 44px!important;border-radius:10px!important;background:#ffffff06!important;border:1px solid var(--ds-border)!important;color:white!important;font-size:16px!important}.side.open{transform:translateX(0)!important;transition:none!important}',
      '.pageTitle{max-width:38vw!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:15px!important}.statusChip{font-size:11px!important;line-height:1.3!important;padding:4px 7px!important}',
      '.topActions{gap:4px!important}.lang{padding:2px!important}.lang button{min-height:40px!important;padding:5px 8px!important;font-size:12px!important}',
      '.content{padding:14px 11px calc(104px + env(safe-area-inset-bottom))!important;max-width:none!important}',
      '.screen>.hero{margin:0 1px 10px!important;min-height:0!important}.screen>.hero h1{display:none!important}.screen>.hero p{font-size:13px!important;line-height:1.6!important}.screen>.hero>.primary,.screen>.hero>.secondary{min-height:44px!important;padding:8px 11px!important;font-size:13px!important}',
      '.dabbirCopilot{padding:14px!important;border-radius:16px!important;margin-bottom:10px!important;box-shadow:none!important}.dcHead h2{font-size:16px!important}.dcLogo{width:36px!important;height:36px!important}.dcMode{font-size:10px!important}.dcProof{gap:5px!important}.dcMetric{padding:9px!important}.dcMetric strong{font-size:17px!important}.dcMetric span{font-size:10px!important}.dcAsk{grid-template-columns:1fr!important}.dcInput{font-size:16px!important;min-height:50px!important}.dcAsk button{min-height:48px!important}.dcSuggestions{flex-wrap:nowrap!important;overflow-x:auto!important;padding-bottom:2px!important;scrollbar-width:none!important}.dcSuggestions::-webkit-scrollbar{display:none}.dcSuggestion{flex:0 0 auto!important}.dcAnswerText{font-size:13px!important}.dcOpen{min-height:44px!important}',
      '.cards{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}.card{border-radius:13px!important;padding:13px!important}.metric{min-height:100px!important}.metric span{font-size:12px!important;line-height:1.4!important}.metric strong{font-size:25px!important;margin-top:4px!important}.d4-metric-icon{width:27px;height:27px;margin-bottom:9px!important}',
      '.grid2,.todayGrid{grid-template-columns:1fr!important;gap:9px!important;margin-top:9px!important}.item{padding:11px!important}.item b{font-size:14px!important;line-height:1.45!important}.item small{font-size:12px!important;line-height:1.5!important}',
      '.dabbir-action-center{padding:13px!important;border-radius:13px!important}.dac-head strong{font-size:15px!important}.dac-status{font-size:12px!important}.dac-brief{margin:9px 0!important;font-size:13px!important}.dac-metrics{gap:6px!important}.dac-metric{padding:8px!important}.dac-metric strong{font-size:19px!important}.dac-metric span{font-size:12px!important}.dac-item{padding:9px!important}.dac-item-body b{font-size:13px!important}.dac-item-body span,.dac-item-body small{font-size:12px!important;white-space:normal!important}.dac-item-body span{display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;overflow:hidden!important}.dac-open{min-width:58px!important;min-height:44px!important;padding:7px 9px!important;font-size:12px!important}',
      '.integrationGrid{grid-template-columns:1fr!important;gap:8px!important}.integration{padding:13px!important;border-radius:13px!important}.integration h3{font-size:15px!important}.integration p{font-size:13px!important;line-height:1.6!important}.dabbirWhatsAppActions{display:grid!important;grid-template-columns:1fr!important}.dabbirWhatsAppActions button{width:100%!important}',
      '#screen-conversations .chatGrid{display:flex!important;flex-direction:column!important;gap:8px!important;min-height:0!important}',
      '#screen-conversations .chatList{display:flex!important;overflow-x:auto!important;overflow-y:hidden!important;gap:7px!important;padding:7px!important;max-height:none!important;margin:0!important;scrollbar-width:none!important;box-shadow:none!important}',
      '#screen-conversations .chatList::-webkit-scrollbar{display:none}',
      '#screen-conversations .chatContact{min-width:min(76vw,286px)!important;flex:0 0 auto!important;margin:0!important;padding:10px 11px!important}',
      '#screen-conversations .chatPanel{height:clamp(360px,calc(100dvh - 224px - env(safe-area-inset-top) - env(safe-area-inset-bottom)),640px)!important;min-height:360px!important;overflow:hidden!important;border-radius:13px!important}',
      '#screen-conversations .chatHead{padding:10px 11px!important}.messages{padding:12px 9px 16px!important}.bubble{max-width:88%!important;padding:10px 11px!important;border-radius:13px!important}.bubble .body{font-size:14px!important;line-height:1.62!important}',
      '.compose{padding:8px 8px calc(8px + env(safe-area-inset-bottom))!important}.compose input{font-size:16px!important;min-height:48px!important}.send{width:48px!important;flex:0 0 48px!important}',
      '.table{border-radius:13px!important}.tr{font-size:12px!important;line-height:1.5!important;padding:11px!important}',
      '#screen-settings #settingsList{display:grid!important;gap:7px!important}.authWrap{align-items:center!important;padding:calc(16px + env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom))!important}.authCard{padding:21px 18px!important;border-radius:16px!important}.authCard .logo{width:56px!important;height:56px!important;border-radius:15px!important}.authCard h1{font-size:22px!important}.field input,.field select,.dk-field input,.dk-field textarea,.dk-time input{font-size:16px!important;min-height:52px!important}',
      '.bottomNav{position:fixed!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:3px!important;left:0!important;right:0!important;bottom:0!important;z-index:30!important;background:#091421fa!important;border-top:1px solid var(--ds-border)!important;padding:6px 6px calc(6px + env(safe-area-inset-bottom))!important;box-shadow:0 -8px 24px #0000003d!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
      '.bottomNav>button,.bottomNav>a{min-width:0!important;min-height:58px!important;border:0!important;background:transparent!important;color:#92a2b6!important;border-radius:10px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px!important;padding:5px 2px!important;font-size:11px!important;line-height:1.2!important;overflow:hidden!important}',
      '.bottomNav .d4-nav-icon{width:21px!important;height:21px!important;margin:0!important;color:currentColor!important}.bottomNav>button.active,.bottomNav>a.active{background:var(--ds-brand-soft)!important;color:#d4dafe!important;box-shadow:none!important}',
      '.bottomNav br{display:none!important}',
      '.top,.side{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
    '}',
    '#authGate .preSignupValue{background:var(--ds-surface2)!important;border-color:var(--ds-border-strong)!important;text-align:start!important}#authGate .preSignupValue p{text-align:start!important}#authGate .preSignupTruth{font-size:13px!important;line-height:1.7!important}#authGate .field label,#onboardingGate .field label{font-size:14px!important}#authGate .authHint{font-size:13px!important}.authLegal{font-size:14px!important}.authLegal a,.lang button{min-height:44px!important}.modalBox{max-height:calc(100dvh - 36px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow-y:auto;overscroll-behavior:contain}.modalActions{flex-wrap:wrap}.compose input{min-width:0}#authGate .authCard{margin-block:auto}.preSignupValue b{line-height:1.7!important}',
    '@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}'
  ].join('');
  document.head.appendChild(style);

  const icons={
    dashboard:'<svg viewBox="0 0 24 24"><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    conversations:'<svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg>',
    appointments:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>',
    customers:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6"/><path d="M15 6.5c2.5.2 4 1.6 4 3.5 0 1.7-1.1 2.9-2.8 3.3M15.5 14.5c2.8.4 4.5 1.9 5 4.5"/></svg>',
    tasks:'<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/><path d="M5 5h8M5 19h14"/></svg>',
    automations:'<svg viewBox="0 0 24 24"><path d="M19 7V3l-2 2a8 8 0 1 0 2.3 8"/><path d="M12 8v4l3 2"/></svg>',
    analytics:'<svg viewBox="0 0 24 24"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/></svg>',
    integrations:'<svg viewBox="0 0 24 24"><path d="M8 12h8M12 8v8"/><circle cx="12" cy="12" r="9"/></svg>',
    notifications:'<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 7H4c0-1 2-1 2-7"/><path d="M10 19h4"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3H9.6l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>',
    help:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.3c-.9.5-1.3 1-1.3 2M12 17h.01"/></svg>'
  };

  const iconSvg=name=>icons[name]||icons.tasks;

  function installHeaderMark(){
    const row=q('.top>.row');
    if(!row||row.querySelector('.d4-header-mark'))return;
    const img=document.createElement('img');
    img.className='d4-header-mark';
    img.src=ICON;
    img.alt='DABBIR';
    img.decoding='async';
    img.loading='eager';
    const menu=q('#menuBtn');
    if(menu?.nextSibling)row.insertBefore(img,menu.nextSibling);else row.append(img);
  }

  function decorateNav(){
    qa('#nav .navBtn,#bottomNav>button,#bottomNav>a').forEach(button=>{
      const key=String(button.dataset.screen||'settings');
      const label=button.querySelector('[data-label]');
      if(!label)return;
      [...button.childNodes].forEach(node=>{
        if(node.nodeType===3&&String(node.textContent||'').trim())node.remove();
        if(node.nodeName==='BR')node.remove();
      });
      let icon=button.querySelector(':scope > .d4-nav-icon');
      if(!icon){
        icon=document.createElement('span');
        icon.className='d4-nav-icon';
        button.insertBefore(icon,label);
      }
      icon.innerHTML=iconSvg(key);
      button.setAttribute('aria-label',String(label.textContent||key).trim());
    });
  }

  function decorateMetrics(){
    const metricIcons=['analytics','appointments','customers','notifications'];
    qa('#dashCards > .card.metric').forEach((card,index)=>{
      if(card.querySelector(':scope > .d4-metric-icon'))return;
      const icon=document.createElement('span');
      icon.className='d4-metric-icon';
      icon.innerHTML=iconSvg(metricIcons[index]||'analytics');
      card.prepend(icon);
    });
  }

  function decorateAiMessages(){
    qa('#messages .msgrow.ai').forEach(row=>{
      row.querySelectorAll(':scope > .dabbirAiIdentity,:scope > .dabbirSenderLabel').forEach(node=>node.remove());
      if(row.querySelector(':scope > .d4-sender'))return;
      const sender=document.createElement('div');
      sender.className='d4-sender';
      const img=document.createElement('img');
      img.src=ICON;img.alt='';img.decoding='async';
      const text=document.createElement('span');text.textContent='DABBIR';
      sender.append(img,text);
      const bubble=row.querySelector(':scope > .bubble');
      if(bubble)row.insertBefore(sender,bubble);else row.prepend(sender);
    });
  }

  function localizeMachineText(){
    const map=isArabic()
      ? {SUPPORT:'دعم / تدخل بشري',manual_takeover:'استلام يدوي',RETURNED_TO_AI:'أُعيدت إلى دبّر',returned_to_ai:'أُعيدت إلى دبّر',OPEN:'مفتوح',RESOLVED:'مكتمل',CLOSED:'مغلق',PENDING:'قيد المتابعة',waiting_customer:'بانتظار العميل',ai_active:'دبّر يتولى المحادثة',human_active:'تدخل بشري',action_required:'تحتاج تدخلك'}
      : {SUPPORT:'Human support',manual_takeover:'Manual takeover',RETURNED_TO_AI:'Returned to DABBIR',returned_to_ai:'Returned to DABBIR',OPEN:'Open',RESOLVED:'Resolved',CLOSED:'Closed',PENDING:'Pending',waiting_customer:'Waiting for customer',ai_active:'DABBIR is handling it',human_active:'Human takeover',action_required:'Needs your attention'};
    qa('#screen-tasks .item b,#screen-tasks .item small,#screen-tasks .badge,#screen-conversations .chatContact span').forEach(el=>{
      const current=String(el.textContent||'').trim();
      const raw=el.dataset.d4RawText||current;
      if(!el.dataset.d4RawText)el.dataset.d4RawText=raw;
      const key=Object.keys(map).find(k=>raw===k||raw.endsWith('• '+k)||raw.endsWith('· '+k));
      if(!key)return;
      const prefix=raw.includes('•')?raw.slice(0,raw.lastIndexOf('•')+1)+' ':raw.includes('·')?raw.slice(0,raw.lastIndexOf('·')+1)+' ':'';
      el.textContent=prefix+map[key];
    });
  }

  function activityType(){return String(workspaceNow()?.business?.business_type||'other').toLowerCase()}
  function businessTimeZone(){
    const business=workspaceNow()?.business||{};
    return String(business.timezone||document.documentElement.dataset.dabbirTimezone||window.__dabbirTimeZone||'Asia/Dubai');
  }
  function keepActionItem(item){
    const type=activityType();
    if(type==='store')return item?.type!=='appointment';
    if(['clinic','salon','real_estate','creator','services','other'].includes(type))return !['inventory','order'].includes(String(item?.type||''));
    return true;
  }
  function formatWhen(value){
    if(!value)return '';
    const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
    try{return new Intl.DateTimeFormat(isArabic()?'ar-AE':'en-AE',{timeZone:businessTimeZone(),day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(date)}catch{return ''}
  }
  function actionCopy(){return isArabic()?{urgent:'يحتاج تدخلك',warning:'راقب اليوم',total:'إجمالي الأولويات',empty:'كل شيء تحت السيطرة الآن',open:'فتح',brief:'أهم ما يحتاج تدخلك الآن'}:{urgent:'Needs you',warning:'Watch today',total:'Total priorities',empty:'Everything is under control right now',open:'Open',brief:'What needs your attention now'}}

  function normalizeActionCenter(){
    const panel=q('#dabbirActionCenter');
    const data=workspaceNow()?.owner_action_center;
    if(!panel||!data)return;
    const items=(Array.isArray(data.items)?data.items:[]).filter(keepActionItem);
    const signature=activityType()+'|'+(isArabic()?'ar':'en')+'|'+items.map(x=>[x.id,x.due_at,x.severity].join(':')).join('|');
    const list=panel.querySelector('#dacItems');
    if(!list||panel.dataset.d4Signature===signature)return;
    panel.dataset.d4Signature=signature;
    const t=actionCopy();
    const urgent=items.filter(x=>x.severity==='critical').length;
    const warning=items.filter(x=>x.severity==='warning').length;
    const metrics=panel.querySelector('#dacMetrics');
    if(metrics){
      const metric=(label,value,tone)=>'<div class="dac-metric '+tone+'"><strong>'+String(value)+'</strong><span>'+label+'</span></div>';
      metrics.innerHTML=metric(t.urgent,urgent,'critical')+metric(t.warning,warning,'warning')+metric(t.total,items.length,'');
    }
    const brief=panel.querySelector('#dacBrief');
    if(brief){
      const top=items.slice(0,3).map(x=>isArabic()?x.title_ar:x.title_en).filter(Boolean);
      brief.textContent=top.length?t.brief+': '+top.join(isArabic()?'، ':', ')+'.':t.empty;
    }
    list.replaceChildren();
    if(!items.length){const empty=document.createElement('div');empty.className='dac-empty';empty.textContent=t.empty;list.append(empty);return;}
    for(const item of items.slice(0,3)){
      const row=document.createElement('article');row.className='dac-item '+(item.severity||'info');
      const body=document.createElement('div');body.className='dac-item-body';
      const title=document.createElement('b');title.textContent=isArabic()?item.title_ar:item.title_en;
      const detail=document.createElement('span');detail.textContent=isArabic()?item.detail_ar:item.detail_en;
      const small=document.createElement('small');small.textContent=formatWhen(item.due_at);
      body.append(title,detail,small);
      const button=document.createElement('button');button.type='button';button.className='secondary dac-open';button.textContent=t.open;
      button.onclick=()=>{const target=String(item.target||'dashboard');if(typeof showScreen==='function')showScreen(target)};
      row.append(body,button);list.append(row);
    }
    panel.querySelector('#dacMoreWrap')?.setAttribute('hidden','');
  }

  function tuneWhatsappCard(){
    const grid=q('#integrationGrid');if(!grid)return;
    const wanted=(()=>{try{return String(T()?.whatsapp||'WhatsApp').trim()}catch{return 'WhatsApp'}})();
    const card=qa('#integrationGrid .integration').find(item=>String(item.querySelector('h3')?.textContent||'').trim()===wanted);
    qa('#integrationGrid .integration').forEach(item=>item.classList.toggle('d4-whatsapp-card',item===card));
  }

  function reorderDashboard(){
    const dash=q('#screen-dashboard');
    const hero=dash?.querySelector(':scope > .hero');
    const copilot=q('#dabbirOwnerCopilot');
    const action=q('#dabbirActionCenter');
    const cards=q('#dashCards');
    if(!dash||!hero||!cards)return;
    let anchor=hero;
    if(copilot&&copilot.parentElement===dash){if(anchor.nextElementSibling!==copilot)anchor.insertAdjacentElement('afterend',copilot);anchor=copilot}
    if(action&&action.parentElement===dash){if(anchor.nextElementSibling!==action)anchor.insertAdjacentElement('afterend',action);anchor=action}
    if(anchor.nextElementSibling!==cards)anchor.insertAdjacentElement('afterend',cards);
    dash.dataset.dabbirExecutiveOrder='command-attention-metrics';
  }

  let actionObserver=null;
  function bindActionObserver(){
    const panel=q('#dabbirActionCenter');
    if(!panel||panel.dataset.d4Observed==='true')return Boolean(panel);
    panel.dataset.d4Observed='true';
    actionObserver=new MutationObserver(()=>schedulePolish());
    actionObserver.observe(panel,{subtree:true,childList:true,characterData:true});
    return true;
  }

  let frame=0;
  function schedulePolish(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;polish()});
  }
  function polish(){
    installHeaderMark();decorateNav();decorateMetrics();decorateAiMessages();localizeMachineText();normalizeActionCenter();tuneWhatsappCard();reorderDashboard();bindActionObserver();
    if(style.parentNode===document.head&&style!==document.head.lastElementChild)document.head.appendChild(style);
    document.body?.setAttribute('data-dabbir-ui','owner-first-v4');
    document.body?.setAttribute('data-dabbir-design','executive-calm-v1');
  }

  if(typeof renderAll==='function'&&!window.__d4RenderAllWrapped){
    window.__d4RenderAllWrapped=true;const base=renderAll;renderAll=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderMessages==='function'&&!window.__d4RenderMessagesWrapped){
    window.__d4RenderMessagesWrapped=true;const base=renderMessages;renderMessages=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderDashboard==='function'&&!window.__d4RenderDashboardWrapped){
    window.__d4RenderDashboardWrapped=true;const base=renderDashboard;renderDashboard=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof renderIntegrations==='function'&&!window.__d4RenderIntegrationsWrapped){
    window.__d4RenderIntegrationsWrapped=true;const base=renderIntegrations;renderIntegrations=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }
  if(typeof applyLang==='function'&&!window.__d4ApplyLangWrapped){
    window.__d4ApplyLangWrapped=true;const base=applyLang;applyLang=function(){const out=base.apply(this,arguments);schedulePolish();return out};
  }

  const bootstrapObserver=new MutationObserver(()=>{
    schedulePolish();
    if(bindActionObserver())bootstrapObserver.disconnect();
  });
  if(document.body)bootstrapObserver.observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>bootstrapObserver.disconnect(),5000);
  setTimeout(schedulePolish,0);
  setTimeout(schedulePolish,350);
  setTimeout(schedulePolish,1200);

  const theme=q('meta[name="theme-color"]');if(theme)theme.content='#091421';
  window.__dabbirUiAuthority={version:'owner-first-v4',designSystem:'executive-calm-v1',pollingLoops:0,presentationObservers:1};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-ui-authority','owner-first-v4');
  res.setHeader('x-dabbir-design-system','executive-calm-v1');
  return res.status(200).send(script);
}