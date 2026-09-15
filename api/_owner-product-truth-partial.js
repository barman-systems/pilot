export function renderOwnerProductTruthPanel(identity={},language='ar'){
  if(identity?.authority_role!=='ROOT_OWNER')return '';
  const lang=language==='en'?'en':'ar',t=(ar,en)=>lang==='ar'?ar:en;
  return `<section id="productTruthPanel" class="panel" aria-labelledby="productTruthTitle"><div class="recordTitle"><div><h2 id="productTruthTitle">${t('حقيقة المنتج','Product truth')}</h2><small>${t('من جداول DABBIR التشغيلية مباشرة؛ PostHog نسخة تحليلية وليست مصدر الحقيقة.','Read directly from DABBIR operational tables; PostHog is an analytical mirror, not the source of truth.')}</small></div><span id="productTruthBadge" class="status"></span></div><div id="productTruthMetrics" class="metrics"></div><div id="productTruthDelivery"></div><details><summary>${t('التفصيل حسب النشاط','Breakdown by activity')}</summary><div id="productTruthActivities"></div></details></section>`;
}

export function ownerProductTruthClient({api,t,esc,date,number,root,list,stat}){
  const $=id=>document.getElementById(id),panel=$('productTruthPanel');
  if(!root||!panel)return {refresh:async()=>{}};
  function render(payload){
    const p=payload?.product_truth||{},delivery=p.posthog_delivery||{};
    $('productTruthMetrics').innerHTML=[
      stat(t('حسابات DABBIR','DABBIR accounts'),number(p.signup_accounts),t('حسابات مثبتة في Auth أو مرتبطة بعضوية DABBIR','Accounts proven by Auth or a DABBIR membership')),
      stat(t('مستخدمون عائدون','Returning users'),number(p.returning_users),t('جلسة ثانية مثبتة أو أكثر','At least two proven sessions')),
      stat(t('أنشطة منشأة','Businesses created'),number(p.businesses_created),t('أنشطة غير تجريبية','Non-demo businesses')),
      stat(t('أول طلب وارد','First request received'),number(p.first_requests),t('أنشطة استقبلت رسالة عميل حقيقية','Businesses with a real customer message')),
      stat(t('أول إجراء مكتمل','First action completed'),number(p.first_actions),t('إجراء AI موثّق verified=true','Verified AI action only')),
    ].join('');
    const state=String(delivery.state||'UNKNOWN');
    const labels={HEALTHY:t('متزامن','Synced'),SYNCING:t('قيد المزامنة','Syncing'),DEGRADED:t('المزامنة متدهورة','Sync degraded'),NOT_CONFIGURED:t('PostHog غير مهيأ','PostHog not configured'),UNKNOWN:t('حالة غير معروفة','Unknown')};
    $('productTruthBadge').textContent=labels[state]||labels.UNKNOWN;
    $('productTruthBadge').className='status '+(state==='HEALTHY'?'good':state==='SYNCING'?'warn':state==='DEGRADED'?'bad':'');
    $('productTruthDelivery').innerHTML=state==='HEALTHY'
      ?'<p class="state success">'+t('PostHog نسخة تحليلية متزامنة. آخر تسليم: ','PostHog analytical mirror is synchronized. Last delivery: ')+esc(date(delivery.last_delivered_at))+'</p>'
      :'<div class="notice">'+t('حقيقة المنتج أعلاه لا تتأثر بحالة PostHog. ','Product truth above is unaffected by PostHog state. ')+t('معلّق: ','Pending: ')+esc(number(delivery.pending))+' · '+t('فشل: ','Failed: ')+esc(number(delivery.failed))+'</div>';
    const rows=Array.isArray(p.activity_breakdown)?p.activity_breakdown:[];
    $('productTruthActivities').innerHTML=list(
      [t('النشاط','Activity'),t('منشأ','Created'),t('أول طلب','First request'),t('أول إجراء','First action')],
      rows.map(row=>[esc(row.business_type||'—'),esc(number(row.businesses_created)),esc(number(row.first_requests)),esc(number(row.first_actions))])
    );
  }
  async function refresh(){
    $('productTruthBadge').textContent=t('جارٍ التحميل…','Loading…');
    try{render(await api('/api/owner-dashboard-data?action=product_truth'))}
    catch{
      $('productTruthBadge').textContent=t('القياس غير متاح','Measurement unavailable');
      $('productTruthBadge').className='status bad';
      $('productTruthMetrics').innerHTML='';
      $('productTruthDelivery').innerHTML='<p class="state error">'+t('تعذر تحميل حقيقة المنتج؛ لم يتم عرض أصفار بدل البيانات المفقودة.','Product truth could not be loaded; missing data is not shown as zero.')+'</p>';
      $('productTruthActivities').innerHTML='';
    }
  }
  return {refresh};
}
