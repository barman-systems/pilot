import { supabaseRest } from './_auth-core.js';

const DAY_MS=24*60*60*1000;
const BALANCE_MAX_AGE_MS=72*60*60*1000;
const COVERAGE_MAX_AGE_MS=24*60*60*1000;
const CLOCK_SKEW_MS=5*60*1000;

const amount=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const time=value=>{
  const ms=value?Date.parse(value):NaN;
  return Number.isFinite(ms)?ms:null;
};
const round=value=>Math.round((Number(value)||0)*100)/100;

async function readJson(response,fallback){
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload=null}
  if(!response.ok){
    const error=new Error(fallback);
    error.status=response.status;
    error.detail=payload?.message||payload?.code||null;
    throw error;
  }
  return payload;
}

const rest=(token,path,fallback)=>supabaseRest(path,token).then(response=>readJson(response,fallback));
const recordKey=row=>`${String(row?.source_system||'')}\u0000${String(row?.source_record_id||'')}`;

function trace(row,openAmount=null){
  return {
    evidence_id:row.id,
    evidence_type:row.evidence_type,
    amount_aed:round(openAmount===null?amount(row.amount_aed):openAmount),
    effective_at:row.effective_at||null,
    due_at:row.due_at||null,
    source_kind:row.source_kind||null,
    source_system:row.source_system||null,
    source_record_id:row.source_record_id||null,
    source_event_id:row.source_event_id||null,
    source_observed_at:row.source_observed_at||null,
  };
}

function openItems(evidence,dueType,settledType,nowMs){
  const settledByRecord=new Map();
  for(const row of evidence){
    if(row.evidence_type!==settledType)continue;
    const effective=time(row.effective_at);
    if(effective===null||effective>nowMs+CLOCK_SKEW_MS)continue;
    const key=recordKey(row);
    settledByRecord.set(key,(settledByRecord.get(key)||0)+amount(row.amount_aed));
  }

  return evidence
    .filter(row=>row.evidence_type===dueType)
    .map(row=>{
      const due=time(row.due_at);
      const effective=time(row.effective_at);
      if(due===null||effective===null||effective>nowMs+CLOCK_SKEW_MS)return null;
      const settled=settledByRecord.get(recordKey(row))||0;
      const open=round(Math.max(0,amount(row.amount_aed)-settled));
      if(open<=0)return null;
      return {...row,open_amount_aed:open,due_ms:due};
    })
    .filter(Boolean);
}

function qualifyingCoverage(rows,scope,nowMs,horizonEndMs){
  return (rows||[])
    .filter(row=>row.scope===scope&&row.coverage_level==='complete')
    .filter(row=>{
      const start=time(row.coverage_start);
      const end=time(row.coverage_end);
      const observed=time(row.source_observed_at);
      return start!==null&&end!==null&&observed!==null
        && start<=nowMs
        && end>=horizonEndMs
        && observed<=nowMs+CLOCK_SKEW_MS
        && nowMs-observed<=COVERAGE_MAX_AGE_MS;
    })
    .sort((a,b)=>(time(b.source_observed_at)||0)-(time(a.source_observed_at)||0))[0]||null;
}

export function evaluateCashGuardian({evidence=[],coverage=[],settings=null,nowMs=Date.now()}={}){
  const rows=Array.isArray(evidence)?evidence:[];
  const coverageRows=Array.isArray(coverage)?coverage:[];
  const horizonDays=Math.min(30,Math.max(1,Number(settings?.horizon_days)||14));
  const horizonEndMs=nowMs+horizonDays*DAY_MS;
  const bufferThreshold=settings?.buffer_threshold_aed===null||settings?.buffer_threshold_aed===undefined
    ? null
    : round(amount(settings.buffer_threshold_aed));

  const balances=rows
    .filter(row=>row.evidence_type==='cash_balance')
    .filter(row=>{
      const effective=time(row.effective_at);
      return effective!==null&&effective<=nowMs+CLOCK_SKEW_MS;
    })
    .sort((a,b)=>(time(b.effective_at)||0)-(time(a.effective_at)||0));
  const latestBalance=balances[0]||null;
  const balanceEffectiveMs=time(latestBalance?.effective_at);
  const balanceObservedMs=time(latestBalance?.source_observed_at);
  const balanceFresh=!!latestBalance
    && balanceEffectiveMs!==null
    && balanceObservedMs!==null
    && nowMs-balanceEffectiveMs<=BALANCE_MAX_AGE_MS
    && nowMs-balanceObservedMs<=BALANCE_MAX_AGE_MS
    && balanceObservedMs<=nowMs+CLOCK_SKEW_MS;

  const inflowCoverage=qualifyingCoverage(coverageRows,'inflows',nowMs,horizonEndMs);
  const outflowCoverage=qualifyingCoverage(coverageRows,'outflows',nowMs,horizonEndMs);
  const insufficiency=[];
  if(!latestBalance)insufficiency.push('BALANCE_MISSING');
  else if(!balanceFresh)insufficiency.push('BALANCE_STALE');
  if(!inflowCoverage)insufficiency.push('INFLOW_COVERAGE_INCOMPLETE');
  if(!outflowCoverage)insufficiency.push('OUTFLOW_COVERAGE_INCOMPLETE');

  const receivables=openItems(rows,'receivable_due','receivable_settled',nowMs);
  const payables=openItems(rows,'payable_due','payable_settled',nowMs);
  const overdueReceivables=receivables.filter(row=>row.due_ms<nowMs);
  const overduePayables=payables.filter(row=>row.due_ms<nowMs);
  const horizonReceivables=receivables.filter(row=>row.due_ms<=horizonEndMs);
  const horizonPayables=payables.filter(row=>row.due_ms<=horizonEndMs);
  const receivableTotal=round(horizonReceivables.reduce((sum,row)=>sum+row.open_amount_aed,0));
  const payableTotal=round(horizonPayables.reduce((sum,row)=>sum+row.open_amount_aed,0));
  const overdueReceivableTotal=round(overdueReceivables.reduce((sum,row)=>sum+row.open_amount_aed,0));
  const overduePayableTotal=round(overduePayables.reduce((sum,row)=>sum+row.open_amount_aed,0));
  const sufficient=insufficiency.length===0;
  const hasAnyEvidence=rows.length>0||coverageRows.length>0||!!settings;

  let status='DATA_INSUFFICIENT';
  let liquidityRange=null;
  if(sufficient){
    const balance=round(amount(latestBalance.amount_aed));
    const lower=round(balance-payableTotal);
    const upper=round(lower+receivableTotal);
    const appliedThreshold=bufferThreshold===null?0:bufferThreshold;
    if(upper<0)status='CRITICAL';
    else if(lower<0)status='RISK';
    else if(bufferThreshold!==null&&lower<appliedThreshold)status='WATCH';
    else status='CLEAR';
    liquidityRange={
      horizon_days:horizonDays,
      horizon_end:new Date(horizonEndMs).toISOString(),
      current_balance_aed:balance,
      committed_outflows_aed:payableTotal,
      verified_receivables_aed:receivableTotal,
      lower_bound_aed:lower,
      upper_bound_aed:upper,
      owner_buffer_threshold_aed:bufferThreshold,
      hard_floor_aed:0,
      meaning:'LOWER_EXCLUDES_RECEIVABLES_UPPER_ASSUMES_ALL_VERIFIED_RECEIVABLES_ARRIVE',
    };
  }

  const autoEligibleOverdue=overdueReceivables.filter(row=>row.customer_id&&row.conversation_id).length;
  const actions=[];
  if(overdueReceivables.length){
    actions.push({
      key:'FOLLOW_UP_OVERDUE_RECEIVABLES',
      count:overdueReceivables.length,
      amount_aed:overdueReceivableTotal,
      auto_internal_followup_eligible:autoEligibleOverdue,
      owner_gate:false,
      external_side_effects:false,
      financial_side_effects:false,
    });
  }
  if(status==='CRITICAL'||status==='RISK'||status==='WATCH'){
    actions.push({
      key:'OWNER_REVIEW_CASH_COMMITMENTS',
      owner_gate:true,
      external_side_effects:false,
      financial_side_effects:false,
      money_movement:false,
    });
  }
  if(status==='DATA_INSUFFICIENT'&&hasAnyEvidence){
    actions.push({
      key:'RESTORE_FINANCIAL_DATA_COVERAGE',
      missing:insufficiency,
      owner_gate:false,
      external_side_effects:false,
      financial_side_effects:false,
    });
  }

  return {
    status,
    sufficient_data:sufficient,
    insufficiency_reasons:insufficiency,
    generated_at:new Date(nowMs).toISOString(),
    horizon_days:horizonDays,
    has_any_financial_evidence:hasAnyEvidence,
    liquidity_range:liquidityRange,
    overdue_receivables:{count:overdueReceivables.length,amount_aed:overdueReceivableTotal,auto_internal_followup_eligible:autoEligibleOverdue},
    overdue_payables:{count:overduePayables.length,amount_aed:overduePayableTotal},
    coverage:{
      inflows:inflowCoverage?{status:'COMPLETE',source_system:inflowCoverage.source_system,source_observed_at:inflowCoverage.source_observed_at,coverage_end:inflowCoverage.coverage_end}:{status:'INSUFFICIENT'},
      outflows:outflowCoverage?{status:'COMPLETE',source_system:outflowCoverage.source_system,source_observed_at:outflowCoverage.source_observed_at,coverage_end:outflowCoverage.coverage_end}:{status:'INSUFFICIENT'},
      balance:latestBalance?{status:balanceFresh?'FRESH':'STALE',effective_at:latestBalance.effective_at,source_system:latestBalance.source_system,source_observed_at:latestBalance.source_observed_at}:{status:'MISSING'},
    },
    actions,
    traceability:{
      balance:latestBalance?trace(latestBalance):null,
      receivables:horizonReceivables.map(row=>trace(row,row.open_amount_aed)),
      payables:horizonPayables.map(row=>trace(row,row.open_amount_aed)),
      overdue_receivables:overdueReceivables.map(row=>trace(row,row.open_amount_aed)),
    },
    truth:{
      orders_are_not_cash_receipts:true,
      simulated_orders_ignored:true,
      unverified_forecast_blocked:true,
      money_movement_capability:false,
      payment_execution_capability:false,
      external_followup_sent:false,
      range_not_point_forecast:true,
    },
  };
}

export async function loadCashGuardianSnapshot({token,businessId,nowMs=Date.now()}){
  const [evidence,coverage,settingsRows]=await Promise.all([
    rest(token,`dabbir_financial_evidence?select=id,evidence_type,amount_aed,effective_at,due_at,source_kind,source_system,source_record_id,source_event_id,source_observed_at,customer_id,conversation_id,verified_at,created_at&business_id=eq.${businessId}&order=effective_at.desc&limit=500`,'CASH_EVIDENCE_LOOKUP_FAILED'),
    rest(token,`dabbir_financial_coverage?select=id,scope,coverage_level,coverage_start,coverage_end,source_kind,source_system,source_observed_at,verified_at,created_at&business_id=eq.${businessId}&order=source_observed_at.desc&limit=100`,'CASH_COVERAGE_LOOKUP_FAILED'),
    rest(token,`dabbir_cash_guardian_settings?select=business_id,horizon_days,buffer_threshold_aed,updated_at&business_id=eq.${businessId}&limit=1`,'CASH_SETTINGS_LOOKUP_FAILED'),
  ]);
  return evaluateCashGuardian({
    evidence:Array.isArray(evidence)?evidence:[],
    coverage:Array.isArray(coverage)?coverage:[],
    settings:Array.isArray(settingsRows)?settingsRows[0]||null:null,
    nowMs,
  });
}

export function cashGuardianActionCenterItem(snapshot){
  if(!snapshot)return null;
  const range=snapshot.liquidity_range;
  if(['CRITICAL','RISK','WATCH'].includes(snapshot.status)&&range){
    const severe=snapshot.status==='CRITICAL';
    const amountText=`${range.lower_bound_aed.toFixed(2)}–${range.upper_bound_aed.toFixed(2)} د.إ`;
    const amountTextEn=`AED ${range.lower_bound_aed.toFixed(2)}–${range.upper_bound_aed.toFixed(2)}`;
    return {
      id:'cash_guardian:liquidity_risk',
      type:'cash_guardian',
      priority:severe?99:88,
      severity:severe?'critical':'warning',
      owner_gate:true,
      title_ar:severe?'خطر سيولة يحتاج قرارك':'السيولة قد تنخفض عن الحد الآمن',
      title_en:severe?'Cash risk needs your decision':'Cash may fall below the safe level',
      detail_ar:`النطاق الموثق خلال ${range.horizon_days} يومًا: ${amountText}. لا توجد حركة أموال تلقائية.`,
      detail_en:`Verified ${range.horizon_days}-day range: ${amountTextEn}. No money movement is automatic.`,
      target:'dashboard',
      entity_id:null,
      due_at:range.horizon_end,
    };
  }

  const overdue=snapshot.overdue_receivables||{};
  if(Number(overdue.count)>Number(overdue.auto_internal_followup_eligible)&&Number(overdue.amount_aed)>0){
    return {
      id:'cash_guardian:unmapped_overdue_receivables',
      type:'cash_guardian',
      priority:70,
      severity:'warning',
      owner_gate:false,
      title_ar:'مستحقات متأخرة بلا مسار متابعة كامل',
      title_en:'Overdue receivables need a follow-up path',
      detail_ar:`${Number(overdue.amount_aed).toFixed(2)} د.إ متأخرة ومثبتة، وبعضها لا يملك محادثة/عميلًا مرتبطًا للمتابعة الداخلية التلقائية.`,
      detail_en:`AED ${Number(overdue.amount_aed).toFixed(2)} is verified overdue; some items lack a linked customer/conversation for automatic internal follow-up.`,
      target:'tasks',
      entity_id:null,
      due_at:null,
    };
  }

  if(snapshot.status==='DATA_INSUFFICIENT'&&snapshot.has_any_financial_evidence){
    return {
      id:'cash_guardian:data_gap',
      type:'cash_guardian',
      priority:34,
      severity:'info',
      owner_gate:false,
      title_ar:'حارس السيولة لا يملك تغطية كافية بعد',
      title_en:'Cash Guardian needs more verified coverage',
      detail_ar:'لن يعرض دَبِّر Forecast أو خطر سيولة غير مسند حتى تكتمل بيانات الرصيد والمستحقات والالتزامات.',
      detail_en:'DABBIR will not claim a cash forecast or liquidity risk until balance, receivable, and commitment coverage is sufficient.',
      target:'integrations',
      entity_id:null,
      due_at:null,
    };
  }
  return null;
}
