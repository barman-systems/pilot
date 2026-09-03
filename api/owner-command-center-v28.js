import base from './owner-command-center-v27.js';

const PATCH=String.raw`<style id="ownerUiAuditV28">
:root{--owner-ui-font:14px;--owner-ui-small:12px;--owner-ui-top:96px;--owner-ui-focus:#d7ff5f}
body{font-size:var(--owner-ui-font);line-height:1.55;overflow-x:hidden}
.top{padding-top:max(10px,env(safe-area-inset-top));}
.brand b{font-size:15px}.brand small,.contextText small,.chip,.hero .eyebrow,.muted,.state,.note,.dangerBox,.empty,.item small,.itemActions .btn,.answer{font-size:var(--owner-ui-small)!important}
.nav{gap:8px;padding-bottom:12px}.nav a{min-height:46px;font-size:14px;padding:9px 14px;white-space:nowrap}
.hero{margin:16px 0}.hero h1{font-size:30px;line-height:1.2}.hero p{font-size:14px;line-height:1.75;max-width:72ch}
.panel{padding:15px;border-radius:17px}.panel h2{font-size:17px;line-height:1.35}.panel h3{font-size:14px}.metric{padding:12px}.metric span{font-size:12px}.metric b{font-size:23px}.item{padding:12px}.item b{font-size:13px}.btn{min-height:46px;font-size:14px}.field{min-height:48px;font-size:16px}.contextText b{font-size:14px}
.ownerTabs25{position:static!important;top:auto!important;z-index:auto!important;margin:0 0 12px!important;padding:7px!important}.ownerTab25{min-height:46px;font-size:14px!important;padding:9px 14px!important}
.oc23{padding:15px!important}.oc23head h2{font-size:18px!important}.oc23head p,.oc23stamp,.oc23sub,.oc23metric span,.oc23item,.oc23note,.oc23stage,.oc23stage b{font-size:12px!important}.oc23card h3,.oc23panel h3{font-size:14px!important}.oc23big{font-size:24px!important}.oc23metric b,.oc23row{font-size:13px!important}.oc23health b{font-size:20px!important}.oc23list{max-height:360px!important}
.ops26{padding:15px!important}.ops26head h2{font-size:19px!important}.ops26head p,.ops26badge,.ops26row,.ops26note{font-size:12px!important}.ops26card h3{font-size:14px!important}.ops26quick button{min-height:48px!important;font-size:13px!important}.ops26grid,.ops26quick{gap:10px!important}
.ceocmd27{padding:15px!important}.ceocmd27 h3{font-size:16px!important}.ceocmd27sub,.ceocmd27msg,.ceocmd27truth{font-size:12px!important}.ceocmd27 textarea{min-height:112px!important;font-size:16px!important}.ceocmd27 select,.ceocmd27 button{min-height:48px!important;font-size:14px!important}.ceocmd27item{font-size:12px!important;padding:11px!important;grid-template-columns:92px 80px minmax(0,1fr) 104px!important}.ceocmd27text{font-size:13px!important}.ceocmd27status{font-size:12px!important;padding:5px 8px!important}
.screen,.panel,.oc23,.ops26,.ceocmd27{scroll-margin-top:calc(var(--owner-ui-top) + 14px)}
button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--owner-ui-focus)!important;outline-offset:2px!important}
@media(max-width:760px){
 :root{--owner-ui-font:15px;--owner-ui-small:13px}
 .shell{padding-inline:max(10px,env(safe-area-inset-left),env(safe-area-inset-right))}
 .bar{gap:10px}.brand{white-space:normal}.topActions{width:100%}.topActions .btn{flex:1}
 .hero h1{font-size:26px}.hero p{font-size:14px}.panel{padding:12px}.grid4{grid-template-columns:1fr 1fr}
 .oc23primary,.oc23secondary,.ops26grid{grid-template-columns:1fr!important}.ops26grid>.ops26card:first-child{grid-column:auto!important}.ops26quick{grid-template-columns:1fr 1fr!important}
 .ceocmd27form{grid-template-columns:1fr!important}.ceocmd27 textarea{grid-column:auto!important}.ceocmd27actions{display:grid!important;grid-template-columns:1fr 1fr!important}.ceocmd27item{grid-template-columns:1fr!important}.ceocmd27status{grid-column:auto!important;width:max-content;text-align:right!important}
}
@media(max-width:430px){
 .grid4{grid-template-columns:1fr 1fr}.metric b{font-size:20px}.ops26quick,.ceocmd27actions{grid-template-columns:1fr!important}.nav a,.ownerTab25{font-size:13px!important;padding-inline:12px!important}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}
</style><script>(()=>{
 document.documentElement.dataset.ownerUi='v28';
 const brand=document.querySelector('.brand small');if(brand)brand.textContent='مركز تشغيل مالك دبّر';
 const hero=document.querySelector('#home .hero');if(hero){const eye=hero.querySelector('.eyebrow'),title=hero.querySelector('h1'),desc=hero.querySelector('p');if(eye)eye.textContent='OWNER COMMAND CENTER';if(title)title.textContent='لوحة قيادة دبّر';if(desc)desc.textContent='المهم أولًا: نبض التشغيل، أوامر CEO، العملاء، المخاطر والتنفيذ المدقّق — بواجهة واضحة ومهيأة للجوال.'}
 document.querySelectorAll('input,textarea,select').forEach(el=>{if(!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')){const label=el.getAttribute('placeholder')||el.name||el.id;if(label)el.setAttribute('aria-label',label)}});
 const tabs=document.querySelector('.ownerTabs25');if(tabs){tabs.setAttribute('role','tablist');tabs.querySelectorAll('[data-tab25]').forEach(b=>b.setAttribute('role','tab'))}
 const top=document.querySelector('.top');
 const syncTop=()=>{const h=Math.max(72,Math.ceil(top?.getBoundingClientRect().height||0));document.documentElement.style.setProperty('--owner-ui-top',h+'px')};
 syncTop();addEventListener('resize',syncTop,{passive:true});window.visualViewport?.addEventListener('resize',syncTop,{passive:true});
 window.__dabbirOwnerUiReview={version:'v28',mobileSafe:true,minReadableTextPx:12,syncTop};
})();</script>`;

export default function handler(req,res){
 const end=res.end.bind(res);let body='';
 res.end=(chunk,...args)=>{body+=chunk?String(chunk):'';return end(body.includes('</body>')?body.replace('</body>',PATCH+'</body>'):body,...args)};
 return base(req,res);
}
