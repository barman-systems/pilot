const normalize=value=>String(value??'').normalize('NFKC').toLowerCase()
  .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[\u064b-\u065f\u0670ـ]/g,'')
  .replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
  .replace(/[^\p{L}\p{N}:\-]+/gu,' ').replace(/\s+/g,' ').trim();

const AVAILABILITY_SIGNAL=/(?:^|\s)(?:فاضي(?:ن)?|متاح(?:ين)?|متوفر(?:ين)?|عندكم\s+(?:وقت|موعد)|فيه?\s+(?:وقت|موعد)|(?:وقت|موعد)\s+فاضي|availability|available|any\s+availability|free\s+(?:slot|appointment|today|tomorrow|at)|open\s+(?:slot|appointment))(?:\s|$)/;
const CANCEL_OR_RESCHEDULE=/(?:^|\s)(?:الغ|الغيه|الغي|الغاء|تلغي|cancel|reschedule|change\s+(?:my|the)?\s*(?:booking|appointment)|تعديل|اجل|غير\s+(?:موعد|الحجز))(?:\s|$)/;

function hasGroundedTemporalEvidence(message,entities){
  const raw=String(message??'');
  return (Array.isArray(entities)?entities:[]).some(item=>{
    if(!['date','time'].includes(String(item?.entity||''))||Number(item?.confidence)<.9)return false;
    const evidence=String(item?.evidence||'').trim();
    return evidence.length>0&&raw.includes(evidence);
  });
}

export function applyDeterministicSemanticIntentPolicy({message,proposal}){
  if(!proposal||typeof proposal!=='object')return proposal;
  if(['CANCEL_BOOKING','RESCHEDULE_BOOKING'].includes(proposal.intent))return proposal;
  const text=normalize(message);
  if(!text||CANCEL_OR_RESCHEDULE.test(text)||!AVAILABILITY_SIGNAL.test(text))return proposal;
  if(!hasGroundedTemporalEvidence(message,proposal.entities))return proposal;

  return {
    ...proposal,
    action:'CHECK_AVAILABILITY',
    intent:'BOOKING',
    confidence:Math.max(.96,Number(proposal.confidence)||0),
    intentResolution:'DETERMINISTIC_AVAILABILITY_WITH_TEMPORAL_EVIDENCE',
  };
}
