const script=String.raw`(()=>{
  if(window.__dabbirVerifiedMetricsUi)return;
  const qa=s=>[...document.querySelectorAll(s)];
  const ar=()=>document.documentElement.lang!=='en';
  const unknown='—';

  function metrics(){
    const value=typeof workspace!=='undefined'&&workspace?workspace.verified_metrics:null;
    return value&&value.state==='VERIFIED_EXACT_COUNTS'?value:null;
  }

  function exactValue(key){
    const value=metrics()?.[key];
    return Number.isSafeInteger(value)&&value>=0?String(value):unknown;
  }

  function evidenceTitle(){
    const value=metrics();
    if(!value)return ar()?'العدد غير موثق — لن يعرض دبّر رقمًا تقديريًا.':'Count unverified — DABBIR will not show an estimated number.';
    let stamp='';
    try{
      stamp=new Intl.DateTimeFormat(ar()?'ar-AE':'en-AE',{
        dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Dubai'
      }).format(new Date(value.as_of));
    }catch{}
    return ar()
      ? 'عدد موثق من قاعدة البيانات • '+(stamp||value.date_key||'')+' • Asia/Dubai'
      : 'Verified database count • '+(stamp||value.date_key||'')+' • Asia/Dubai';
  }

  function applyMetric(card,key){
    if(!card)return;
    const strong=card.querySelector('strong');
    if(strong)strong.textContent=exactValue(key);
    card.dataset.dabbirMetricTruth=metrics()?'verified':'unverified';
    card.title=evidenceTitle();
  }

  function applyDashboardMetrics(){
    const cards=qa('#dashCards .card.metric');
    if(cards.length<4)return;
    applyMetric(cards[0],'active_chats');
    const isStore=String(workspace?.business?.business_type||'').toLowerCase()==='store';
    if(isStore){
      const label=cards[1].querySelector('span');
      if(label)label.textContent=ar()?'المتابعات':'Follow-ups';
      applyMetric(cards[1],'open_followups');
    }else{
      applyMetric(cards[1],'today_appointments');
    }
    applyMetric(cards[2],'customers');
    applyMetric(cards[3],'needs_attention');
  }

  function applyAnalyticsMetrics(){
    const cards=qa('#analyticsCards .card.metric');
    if(cards.length<4)return;
    applyMetric(cards[0],'active_chats');
    applyMetric(cards[1],'ai_messages');
    applyMetric(cards[2],'customers');
    applyMetric(cards[3],'human_handoffs');
  }

  function applyAll(){
    applyDashboardMetrics();
    applyAnalyticsMetrics();
  }

  if(typeof renderDashboard==='function'){
    const baseRenderDashboard=renderDashboard;
    renderDashboard=function(){const result=baseRenderDashboard();applyDashboardMetrics();return result};
  }
  if(typeof renderAnalytics==='function'){
    const baseRenderAnalytics=renderAnalytics;
    renderAnalytics=function(){const result=baseRenderAnalytics();applyAnalyticsMetrics();return result};
  }
  if(typeof setLanguage==='function'){
    const baseSetLanguage=setLanguage;
    setLanguage=function(next){const result=baseSetLanguage(next);setTimeout(applyAll,0);return result};
  }

  setTimeout(applyAll,0);
  setTimeout(applyAll,400);
  window.__dabbirVerifiedMetricsUi={apply:applyAll,version:'exact-metrics-v1-final',source:'SUPABASE_POSTGREST_COUNT_EXACT'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('x-dabbir-verified-metrics-ui','v1-final');
  return res.status(200).send(script);
}
