export function deriveOwnerAwayState(row, nowMs=Date.now()) {
  if (!row || row.enabled !== true) {
    return { available:!!row, state:'INACTIVE', active:false, scheduled:false, starts_at:row?.starts_at||null, ends_at:row?.ends_at||null, timezone:row?.timezone||'Asia/Dubai' };
  }
  const startsMs=row.starts_at?Date.parse(row.starts_at):NaN;
  const endsMs=row.ends_at?Date.parse(row.ends_at):NaN;
  if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs) || endsMs<=startsMs) {
    return { available:true, state:'INVALID', active:false, scheduled:false, starts_at:row.starts_at||null, ends_at:row.ends_at||null, timezone:row.timezone||'Asia/Dubai' };
  }
  if (nowMs<startsMs) {
    return { available:true, state:'SCHEDULED', active:false, scheduled:true, starts_at:row.starts_at, ends_at:row.ends_at, timezone:row.timezone||'Asia/Dubai' };
  }
  if (nowMs>=endsMs) {
    return { available:true, state:'EXPIRED', active:false, scheduled:false, starts_at:row.starts_at, ends_at:row.ends_at, timezone:row.timezone||'Asia/Dubai' };
  }
  return { available:true, state:'ACTIVE', active:true, scheduled:false, starts_at:row.starts_at, ends_at:row.ends_at, timezone:row.timezone||'Asia/Dubai' };
}

export function ownerAwayMustInterrupt(item) {
  if (!item) return false;
  if (item.owner_gate === true) return true;
  return String(item.severity||'').toLowerCase()==='critical';
}

export function applyOwnerAwayEscalation(items, awayState) {
  const rows=Array.isArray(items)?items:[];
  if (!awayState?.active) {
    return { visible:rows, deferred:[], deferred_count:0 };
  }
  const visible=[];
  const deferred=[];
  for (const item of rows) {
    (ownerAwayMustInterrupt(item)?visible:deferred).push(item);
  }
  return { visible, deferred, deferred_count:deferred.length };
}

export function awayBrief(baseBrief, awayState, deferredCount) {
  if (!awayState?.active) return baseBrief;
  const deferred=Math.max(0,Number(deferredCount)||0);
  const baseAr=String(baseBrief?.ar||'').trim();
  const baseEn=String(baseBrief?.en||'').trim();
  const ar=deferred
    ? `وضع غياب المالك مفعّل. أخفى دَبِّر ${deferred} عنصرًا غير حرج من التصعيد المباشر، وسيُبقي الحالات الحرجة ظاهرة.${baseAr?' '+baseAr:''}`
    : `وضع غياب المالك مفعّل. لا توجد عناصر غير حرجة معلّقة للتصعيد.${baseAr?' '+baseAr:''}`;
  const en=deferred
    ? `Owner Away Mode is active. DABBIR held ${deferred} non-critical ${deferred===1?'item':'items'} from direct escalation while keeping critical exceptions visible.${baseEn?' '+baseEn:''}`
    : `Owner Away Mode is active. There are no non-critical items being held from escalation.${baseEn?' '+baseEn:''}`;
  return { ar, en };
}
