const ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩';

function digits(value=''){
  return String(value).replace(/[٠-٩]/g,d=>String(ARABIC_DIGITS.indexOf(d)));
}

function textNorm(value=''){
  return digits(value)
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670]/g,'')
    .replace(/[أإآ]/g,'ا')
    .replace(/ة/g,'ه')
    .replace(/[^\p{L}\p{N}:]+/gu,' ')
    .trim();
}

export function wantsServiceMenu(value=''){
  const normalized=textNorm(value);
  const squeezed=normalized.replace(/\s+/g,'');
  if(!normalized)return false;
  return /(?:الخدمات|خدماتكم|قائمهالخدمات|services|servicemenu|whatdoyouoffer)/i.test(squeezed)
    || /^(?:شو|وش|شنو|ايش|اش)(?:عندكم|تقدمون|تقدموا|تقدم)$/i.test(squeezed)
    || /(?:شو|وش|شنو|ايش|اش)\s*(?:عندكم|تقدمون|تقدموا)/i.test(normalized);
}

export function looksLikeServiceIntent(value=''){
  const normalized=textNorm(value);
  if(!normalized)return false;
  const wants=/(?:ابي|ابغي|ابغى|ابا|اريد|احتاج|احجز|حجز|موعد|want|need|book|booking)/i.test(normalized);
  const serviceWord=/(?:خدمه|غسيل|تنظيف|غسل|صيانه|حلاق|موعد|service|wash|clean|appointment)/i.test(normalized);
  return wants&&serviceWord;
}

export function isConversationNudge(value=''){
  const raw=String(value||'').trim();
  if(!raw)return false;
  if(/^[\s؟?!.,،…]+$/u.test(raw))return true;
  const normalized=textNorm(raw).replace(/\s+/g,'');
  return /^(?:وينك|رد|ردوا|ها|هلو|ليشما(?:ترد|تردون)|ما(?:ترد|تردون)|hello|there)$/i.test(normalized);
}

export function previousCustomerText(history=[]){
  const rows=Array.isArray(history)?history:[];
  for(let i=rows.length-1;i>=0;i-=1){
    const sender=String(rows[i]?.sender_type||'').toLowerCase();
    const body=String(rows[i]?.body||'').trim();
    if(sender==='customer'&&body)return body.slice(0,1500);
  }
  return '';
}

function localParts(timezone,now){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(now);
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return {
    year:Number(get('year')),month:Number(get('month')),day:Number(get('day')),
    hour:Number(get('hour')),minute:Number(get('minute')),second:Number(get('second')),
  };
}

function dateWithOffset(parts,offset){
  const d=new Date(Date.UTC(parts.year,parts.month-1,parts.day+offset,12,0,0));
  return {
    year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),
  };
}

function localIso(date,hour,minute){
  const pad=n=>String(n).padStart(2,'0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(hour)}:${pad(minute)}:00`;
}

export function resolveRequestedLocal(value,timezone,{now=new Date(),allowImplicitToday=true}={}){
  const source=digits(String(value||'')).trim();
  if(!source)return {status:'missing',local:null};
  const normalized=textNorm(source);
  const today=/(?:^|\s)(?:اليوم|today)(?:\s|$)/i.test(normalized);
  const tomorrow=/(?:^|\s)(?:باجر|باكر|بكره|بكرة|غدا|غداً|tomorrow)(?:\s|$)/i.test(normalized);
  const hasClockWord=/(?:الساعه|الساع|ساعه|الوقت|at\s*\d)/i.test(normalized);
  const bareTime=/^\s*(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:ص|م|am|pm)?\s*$/i.test(source);
  if(!today&&!tomorrow&&!allowImplicitToday)return {status:'missing',local:null};
  if(!today&&!tomorrow&&!hasClockWord&&!bareTime)return {status:'missing',local:null};

  const match=source.match(/(?:الساع(?:ة|ه)?\s*|ساعه\s*|at\s*)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*(ص|م|am|pm)?/i);
  if(!match)return {status:'missing',local:null};
  const rawHour=Number(match[1]);
  const minute=Number(match[2]||0);
  const marker=String(match[3]||'').toLowerCase();
  const pmWord=/(?:العصر|المسا|المساء|المغرب|الليل|مساء|evening|afternoon|night)/i.test(normalized);
  const amWord=/(?:الصبح|صباح|صباحا|الفجر|morning)/i.test(normalized);
  const parts=localParts(timezone,now);
  const offset=tomorrow?1:0;
  const date=dateWithOffset(parts,offset);
  const displayHour=match[2]?`${match[1]}:${match[2]}`:String(match[1]);

  let explicitPeriod=null;
  if(marker==='م'||marker==='pm'||pmWord)explicitPeriod='pm';
  if(marker==='ص'||marker==='am'||amWord)explicitPeriod='am';

  const candidateForPeriod=period=>{
    let hour=rawHour;
    if(period==='pm'&&hour<12)hour+=12;
    if(period==='am'&&hour===12)hour=0;
    return hour;
  };

  if(explicitPeriod){
    const hour=candidateForPeriod(explicitPeriod);
    if(offset===0&&hour*60+minute<=parts.hour*60+parts.minute){
      return {status:'past',local:null,hour:displayHour,period:explicitPeriod};
    }
    return {status:'resolved',local:localIso(date,hour,minute),hour:displayHour,period:explicitPeriod,inferred:false};
  }

  if(rawHour>=13){
    if(offset===0&&rawHour*60+minute<=parts.hour*60+parts.minute)return {status:'past',local:null,hour:displayHour};
    return {status:'resolved',local:localIso(date,rawHour,minute),hour:displayHour,period:'24h',inferred:false};
  }

  if(rawHour===12){
    if(offset===0&&12*60+minute<=parts.hour*60+parts.minute)return {status:'past',local:null,hour:displayHour};
    return {status:'resolved',local:localIso(date,12,minute),hour:displayHour,period:'pm',inferred:false};
  }

  const amHour=rawHour;
  const pmHour=rawHour+12;
  if(offset>0){
    return {status:'ambiguous',local:null,hour:displayHour,candidates:[localIso(date,amHour,minute),localIso(date,pmHour,minute)]};
  }

  const nowMinutes=parts.hour*60+parts.minute;
  const future=[];
  if(amHour*60+minute>nowMinutes)future.push({hour:amHour,period:'am'});
  if(pmHour*60+minute>nowMinutes)future.push({hour:pmHour,period:'pm'});
  if(future.length===1){
    return {status:'resolved',local:localIso(date,future[0].hour,minute),hour:displayHour,period:future[0].period,inferred:true};
  }
  if(future.length>1){
    return {status:'ambiguous',local:null,hour:displayHour,candidates:future.map(x=>localIso(date,x.hour,minute))};
  }
  return {status:'past',local:null,hour:displayHour};
}
