const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function injectOwnerProductTruth(html,identity={},language='ar'){
  if(identity?.authority_role!=='ROOT_OWNER')return html;
  const lang=language==='en'?'en':'ar';
  const t=(ar,en)=>lang==='ar'?ar:en;
  const panel=`<section id="productTruthPanel" class="panel" aria-labelledby="productTruthTitle"><div class="recordTitle"><div><h2 id="productTruthTitle">${t('حقيقة المنتج','Product truth')}</h2><small>${t('من جداول DABBIR التشغيلية مباشرة؛ PostHog نسخة تحليلية وليست مصدر الحقيقة.','Read directly from DABBIR operational tables; PostHog is an analytical mirror, not the source of truth.')}</small></div><span id="productTruthBadge" class="status"></span></div><div id="productTruthMetrics" class="metrics"></div><div id="productTruthDelivery"></div><details><summary>${t('التفصيل حسب النشاط','Breakdown by activity')}</summary><div id="productTruthActivities"></div></details></section>`;
  const anchor='<div class="grid"><section id="customerHealthPanel"';
  const injected=html.includes(anchor)?html.replace(anchor,panel+anchor):html.replace('</section>\n<section id="customers"',panel+'</section>\n<section id="customers"');
  const script=`<script>(${ownerProductTruthClient.toString()})(${JSON.stringify(lang)});</script>`;
  return injected.replace('</body>',script+'</body>');
}

export function ownerProductTruthClient(lang='ar'){
  const t=(ar,en)=>lang==='ar'?ar:en;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat(lang).format(Number(v));
  const date=v=>!v||!Number.isFinite(Date.parse(v))?'—':new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
  const stat=(label,value,note='')=>'<div class="metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';
  const empty=text=>'<div class="empty">'+esc(text)+'</div>';
  const list=(headers,rows)=>rows.length?'<div class="tableWrap"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':empty(t('لا توجد أنشطة بعد.','No businesses yet.'));

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
      rows.map(row=>[row.business_type||'—',number(row.businesses_created),number(row.first_requests),number(row.first_actions)])
    );
  }

  async function load(){
    const panel=$('productTruthPanel');if(!panel)return;
    $('productTruthBadge').textContent=t('جارٍ التحميل…','Loading…');
    try{
      const response=await fetch('/api/owner-dashboard-data?action=product_truth',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const payload=await response.json().catch(()=>null);
      if(response.status===401){location.replace('/owner');return}
      if(!response.ok||payload?.ok!==true)throw new Error(payload?.error||'PRODUCT_TRUTH_FAILED');
      render(payload);
    }catch{
      $('productTruthBadge').textContent=t('القياس غير متاح','Measurement unavailable');
      $('productTruthBadge').className='status bad';
      $('productTruthMetrics').innerHTML='';
      $('productTruthDelivery').innerHTML='<p class="state error">'+t('تعذر تحميل حقيقة المنتج؛ لم يتم عرض أصفار بدل البيانات المفقودة.','Product truth could not be loaded; missing data is not shown as zero.')+'</p>';
      $('productTruthActivities').innerHTML='';
    }
  }

  load();
  $('refreshAll')?.addEventListener('click',()=>setTimeout(load,0));
}
