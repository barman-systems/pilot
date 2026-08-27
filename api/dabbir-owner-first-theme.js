const css=String.raw`
:root{
  --accent:#7c6cff!important;
  --green:#66e3c4!important;
  --blue:#62c9ff!important;
  --dabbir-brand-purple:#7c5cff;
  --dabbir-brand-blue:#3e8cff;
  --dabbir-brand-cyan:#46d9ff;
  --dabbir-owner-surface:#11141a;
  --dabbir-owner-surface-2:#171b23;
  --dabbir-owner-line:#2b3140;
}
html,body{background-color:#08090d!important}
body{
  background:
    radial-gradient(circle at 14% -10%,rgba(124,92,255,.14),transparent 28%),
    radial-gradient(circle at 88% 2%,rgba(70,217,255,.09),transparent 25%),
    #08090d!important;
}
.side{background:linear-gradient(180deg,rgba(12,14,20,.98),rgba(8,10,14,.98))!important;border-inline-end-color:#222837!important}
.top{background:rgba(8,10,14,.84)!important;border-bottom-color:#202634!important;backdrop-filter:blur(22px)!important;-webkit-backdrop-filter:blur(22px)!important}
.logo,.dabbirTopLogo,.dabbirAiIdentity img,.dabbirAiStatusLogo{
  border-color:transparent!important;
  box-shadow:0 10px 28px rgba(89,98,255,.18)!important;
}
.dabbirAiIdentity{color:#c8c1ff!important}
.primary,.send{
  background:linear-gradient(135deg,var(--dabbir-brand-purple),var(--dabbir-brand-blue) 62%,var(--dabbir-brand-cyan))!important;
  color:#fff!important;
  box-shadow:0 10px 26px rgba(91,105,255,.2)!important;
}
.secondary{background:#161a22!important;border-color:#303747!important}
.navBtn.active,.navBtn:hover{background:linear-gradient(90deg,rgba(124,92,255,.15),rgba(62,140,255,.07))!important;color:#fff!important}
.navBtn.active{box-shadow:inset -3px 0 0 var(--dabbir-brand-cyan)!important}
html[dir=ltr] .navBtn.active{box-shadow:inset 3px 0 0 var(--dabbir-brand-cyan)!important}
.card,.integration,.chatList,.chatPanel,.table,.workspace{
  background:linear-gradient(180deg,rgba(23,27,35,.97),rgba(14,17,23,.98))!important;
  border-color:var(--dabbir-owner-line)!important;
}
.card,.integration,.chatList,.chatPanel,.table{box-shadow:0 18px 50px rgba(0,0,0,.18)!important}
.workspace{box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
.statusChip{background:rgba(39,151,116,.16)!important;color:#78e9c8!important;border-color:rgba(102,227,196,.22)!important}
.bottomNav{background:rgba(10,12,18,.93)!important;border-top-color:#242a38!important;backdrop-filter:blur(22px)!important;-webkit-backdrop-filter:blur(22px)!important}
.bottomNav>button.active,.bottomNav>a.active{background:linear-gradient(180deg,rgba(124,92,255,.17),rgba(62,140,255,.08))!important;color:#c8c1ff!important;box-shadow:inset 0 0 0 1px rgba(124,108,255,.28)!important}

#screen-dashboard>.hero{margin-bottom:14px!important}
#screen-dashboard>.hero h1{font-size:27px!important;letter-spacing:-.03em!important}
#screen-dashboard>.hero p{max-width:640px!important;color:#9da7b8!important}
#screen-dashboard .metric strong{letter-spacing:-.035em}

.dabbir-action-center{
  position:relative;
  overflow:hidden;
  border-color:rgba(124,108,255,.34)!important;
  background:
    radial-gradient(circle at 88% 0%,rgba(70,217,255,.10),transparent 30%),
    radial-gradient(circle at 8% 10%,rgba(124,92,255,.12),transparent 34%),
    linear-gradient(180deg,#171b24,#0f1218)!important;
  box-shadow:0 22px 60px rgba(8,10,18,.34),inset 0 1px 0 rgba(255,255,255,.035)!important;
  padding:18px!important;
}
.dabbir-action-center:before{
  content:'';position:absolute;inset-inline-start:0;top:0;width:46%;height:2px;
  background:linear-gradient(90deg,var(--dabbir-brand-purple),var(--dabbir-brand-blue),var(--dabbir-brand-cyan));
}
.dac-head strong{font-size:18px!important;letter-spacing:-.025em}
.dac-status{font-size:10px!important;color:#929caf!important}
.dac-brief{font-size:12px!important;line-height:1.8!important;color:#edf2f8!important;max-width:820px}
.dac-metrics{gap:9px!important}
.dac-metric{background:rgba(13,16,22,.76)!important;border-color:#2a3040!important;border-radius:15px!important;padding:12px!important}
.dac-metric strong{font-size:23px!important;letter-spacing:-.035em}
.dac-metric span{font-size:9px!important}
.dac-metric.handled{border-color:rgba(102,227,196,.18)!important}
.dac-metric.critical{border-color:rgba(255,170,169,.20)!important;background:linear-gradient(180deg,rgba(69,28,33,.28),rgba(18,17,22,.8))!important}
.dac-metric.warning{border-color:rgba(255,216,122,.18)!important}
.dac-item{background:rgba(17,20,27,.86)!important;border-color:#29303f!important;border-radius:15px!important;padding:12px!important;transition:transform .16s ease,border-color .16s ease,background .16s ease}
.dac-item:hover{transform:translateY(-1px);border-color:#3a4357!important;background:#171c25!important}
.dac-item-body b{font-size:11px!important}
.dac-item-body span{font-size:10px!important;color:#b2bbc8!important}
.dac-open{border-color:rgba(124,108,255,.28)!important;background:rgba(124,92,255,.10)!important;color:#d8d3ff!important}
.dac-empty{background:rgba(38,112,91,.08)!important;border-color:rgba(102,227,196,.22)!important;color:#7ce7c8!important}

@media(max-width:700px){
  .content{padding-inline:11px!important}
  #screen-dashboard>.hero{margin-bottom:8px!important}
  #screen-dashboard>.hero p{font-size:10.5px!important;line-height:1.6!important}
  .dabbir-action-center{padding:14px!important;border-radius:19px!important;margin-bottom:10px!important}
  .dac-head{align-items:flex-start!important}
  .dac-head strong{font-size:17px!important}
  .dac-head .secondary{min-height:38px!important;padding:7px 10px!important;font-size:9px!important}
  .dac-brief{font-size:11px!important;margin:10px 0!important}
  .dac-metrics{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}
  .dac-metric{padding:10px 8px!important;border-radius:13px!important;min-width:0!important}
  .dac-metric strong{font-size:20px!important}
  .dac-metric span{display:block!important;white-space:normal!important;line-height:1.35!important}
  .dac-item{padding:11px!important;gap:8px!important}
  .dac-open{min-width:58px!important;min-height:40px!important}
  #screen-dashboard #dashCards{gap:7px!important}
  #screen-dashboard #dashCards .card{padding:12px!important}
}
`;

const script=String.raw`(()=>{
  if(window.__dabbirOwnerFirstThemeLoaded)return;
  window.__dabbirOwnerFirstThemeLoaded=true;

  const style=document.createElement('style');
  style.dataset.dabbirOwnerFirstTheme='v1';
  style.textContent=${JSON.stringify(css)};
  document.head.appendChild(style);
  document.documentElement.dataset.dabbirOwnerFirstUi='v1';
  window.__dabbirOwnerFirstThemeVersion='owner-first-v1';
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.statusCode=200;
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-owner-first-theme','owner-first-v1');
  return res.end(script);
}
