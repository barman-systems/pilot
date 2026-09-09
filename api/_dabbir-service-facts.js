const normalize=value=>String(value??'').normalize('NFKC').toLowerCase()
  .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[\u064b-\u065f\u0670ـ]/g,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const arr=value=>Array.isArray(value)?value:[];
const label=service=>String(service?.name_ar||service?.name||service?.name_en||'').trim().slice(0,180);
const duration=service=>{const value=Number(service?.duration_minutes);return Number.isFinite(value)&&value>0?Math.round(value):null;};

const DURATION_SIGNAL=/(?:^|\s)(?:كم\s+(?:مده|وقت)|كم\s+(?:ياخذ|تاخذ|تاخذون|يستغرق|تستغرق)(?:\s+وقت)?|مده\s+(?:الخدمه|الغسيل|التنظيف)|how\s+long|how\s+much\s+time|duration)(?:\s|$)/i;

function mentionedService(services,text){
  const haystack=` ${normalize(text)} `;
  const matches=arr(services).filter(service=>{
    const name=normalize(label(service));
    return name.length>=2&&haystack.includes(` ${name} `);
  });
  return matches.length===1?matches[0]:null;
}

export function resolveServiceFactReply({messages=[],state={},services=[]}={}){
  const text=arr(messages).map(item=>String(item?.language_body??item?.body??'')).filter(Boolean).join(' ');
  const normalized=normalize(text);
  if(!normalized||!DURATION_SIGNAL.test(normalized))return null;

  const grounded=arr(services).filter(service=>duration(service)!=null);
  if(!grounded.length)return null;
  const mentioned=mentionedService(grounded,text);
  const selectedId=state?.entities?.service?.value;
  const selected=selectedId?grounded.find(service=>service?.id===selectedId):null;
  const targets=mentioned?[mentioned]:selected?[selected]:grounded.slice(0,10);
  const ar=String(state?.language||'ar').toLowerCase()!=='en';

  const reply=targets.length===1
    ? (ar?`مدة ${label(targets[0])} ${duration(targets[0])} دقيقة.`:`${label(targets[0])} takes ${duration(targets[0])} minutes.`)
    : (ar?`مدة الخدمات:\n${targets.map((service,index)=>`${index+1}) ${label(service)} — ${duration(service)} دقيقة`).join('\n')}`
      :`Service durations:\n${targets.map((service,index)=>`${index+1}) ${label(service)} — ${duration(service)} minutes`).join('\n')}`);

  return {
    action:'REPLY',
    intent:String(state?.intent||'SERVICE_DISCOVERY'),
    confidence:1,
    riskLevel:'LOW',
    missingFields:arr(state?.missing_fields),
    reasonCode:'SERVICE_DURATION_DATABASE_FACT',
    reply,
  };
}
