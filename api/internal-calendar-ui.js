const script=String.raw`(()=>{
  if(window.__dabbirInternalCalendarUi)return;
  const q=s=>document.querySelector(s);
  const qa=s=>Array.from(document.querySelectorAll(s));
  const ws=()=>{try{return typeof workspace!=='undefined'?workspace:null}catch{return null}};
  const ar=()=>document.documentElement.lang!=='en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const copy=()=>ar()?{
    day:'يوم',week:'أسبوع',month:'شهر',today:'اليوم',previous:'السابق',next:'التالي',
    empty:'لا توجد حجوزات في هذه الفترة.',customer:'العميل',requested:'مطلوب',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',completed:'مكتمل',cancelled:'ملغي',
    title:'تقويم الحجوزات',subtitle:'عرض يومي وأسبوعي وشهري للحجوزات داخل دبّر.'
  }:{
    day:'Day',week:'Week',month:'Month',today:'Today',previous:'Previous',next:'Next',
    empty:'No bookings in this period.',customer:'Customer',requested:'Requested',confirmed:'Confirmed',rescheduled:'Rescheduled',completed:'Completed',cancelled:'Cancelled',
    title:'Booking calendar',subtitle:'Day, week and month views for bookings inside DABBIR.'
  };
  const locale=()=>ar()?'ar-AE':'en-AE';
  const businessTimezone=()=>{
    const b=ws()?.business||{};
    if(b.timezone)return String(b.timezone);
    const loc=String(b.locale||'ar-AE').toUpperCase();
    if(loc.endsWith('-SA'))return 'Asia/Riyadh';
    if(loc.endsWith('-KW'))return 'Asia/Kuwait';
    if(loc.endsWith('-QA'))return 'Asia/Qatar';
    if(loc.endsWith('-BH'))return 'Asia/Bahrain';
    if(loc.endsWith('-OM'))return 'Asia/Muscat';
    return 'Asia/Dubai';
  };
  function zonedParts(value){
    const d=value instanceof Date?value:new Date(value);
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:businessTimezone(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const p=Object.fromEntries(f.formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return {year:+p.year,month:+p.month,day:+p.day,hour:+p.hour,minute:+p.minute,key:p.year+'-'+p.month+'-'+p.day};
  }
  function dayKey(value){return zonedParts(value).key}
  function todayKey(){return dayKey(new Date())}
  function dateFromKey(key){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12,0,0))}
  function keyFromDate(d){return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
  function shiftKey(key,days){const d=dateFromKey(key);d.setUTCDate(d.getUTCDate()+days);return keyFromDate(d)}
  function startOfWeek(key){const d=dateFromKey(key),dow=d.getUTCDay(),offset=(dow+6)%7;d.setUTCDate(d.getUTCDate()-offset);return keyFromDate(d)}
  function monthKey(key){return key.slice(0,7)}
  function firstOfMonth(key){return key.slice(0,7)+'-01'}
  function daysInMonth(key){const [y,m]=key.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()}
  function shiftMonth(key,delta){const [y,m]=key.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1,12));return keyFromDate(d)}
  function customerName(id){const row=(ws()?.customers||[]).find(x=>x.id===id);return row?.display_name||copy().customer}
  function statusLabel(status){const c=copy(),s=String(status||'requested').toLowerCase();return c[s]||s}
  function fmtTime(value){try{return new Intl.DateTimeFormat(locale(),{timeZone:businessTimezone(),hour:'numeric',minute:'2-digit'}).format(new Date(value))}catch{return ''}}
  function fmtDay(key,opts={weekday:'short',day:'numeric',month:'short'}){try{return new Intl.DateTimeFormat(locale(),{timeZone:'UTC',...opts}).format(dateFromKey(key))}catch{return key}}
  function fmtMonth(key){try{return new Intl.DateTimeFormat(locale(),{timeZone:'UTC',month:'long',year:'numeric'}).format(dateFromKey(firstOfMonth(key)))}catch{return key.slice(0,7)}}
  function activeAppointments(){return (ws()?.appointments||[]).filter(a=>a?.id&&a?.starts_at&&String(a.status||'').toLowerCase()!=='cancelled')}
  function apptsForKey(key){return activeAppointments().filter(a=>dayKey(a.starts_at)===key).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))}

  const style=document.createElement('style');
  style.textContent='.dabbirInternalCal{border:1px solid var(--line);background:#111315;border-radius:18px;padding:12px;margin-bottom:12px}.dabbirCalHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.dabbirCalHead h3{font-size:14px;margin:0 0 4px}.dabbirCalHead p{font-size:9px;color:var(--muted);margin:0}.dabbirCalControls{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.dabbirCalControls button{border:1px solid var(--line);background:#181b1f;color:#fff;border-radius:9px;padding:6px 9px;min-height:36px;font-size:9px;font-weight:850}.dabbirCalControls button.on{background:var(--accent);color:#10130b;border-color:transparent}.dabbirCalRange{font-size:11px;font-weight:900;margin:12px 0 8px}.dabbirCalGrid{display:grid;gap:6px}.dabbirCalDay{border:1px solid #292f34;background:#15181b;border-radius:11px;padding:8px;min-height:86px}.dabbirCalDay.isToday{border-color:#65772f}.dabbirCalDayHead{display:flex;justify-content:space-between;gap:6px;font-size:9px;margin-bottom:6px}.dabbirCalDayHead b{font-size:10px}.dabbirCalEvent{border:1px solid #343a40;background:#1b1f23;border-radius:8px;padding:6px;margin-top:5px;font-size:8px}.dabbirCalEvent b{display:block;font-size:9px}.dabbirCalEvent span{color:var(--muted)}.dabbirCalEmpty{font-size:8px;color:var(--muted);padding:7px 0}.dabbirCalGrid.week{grid-template-columns:repeat(7,minmax(112px,1fr));overflow:auto}.dabbirCalGrid.month{grid-template-columns:repeat(7,minmax(92px,1fr));overflow:auto}.dabbirCalGrid.month .dabbirCalDay{min-height:110px}.dabbirCalGrid.day{grid-template-columns:1fr}.dabbirCalWeekday{font-size:8px;color:var(--muted);text-align:center;padding:4px}@media(max-width:700px){.dabbirCalHead{display:block}.dabbirCalControls{margin-top:9px}.dabbirCalGrid.week,.dabbirCalGrid.month{grid-template-columns:repeat(7,minmax(120px,1fr))}}';
  document.head.append(style);

  let view='week',cursor=todayKey(),signature='';
  function ensureHost(){
    const screen=q('#screen-appointments');if(!screen)return null;
    let host=q('#dabbirInternalCalendar');
    if(host)return host;
    host=document.createElement('section');host.id='dabbirInternalCalendar';host.className='dabbirInternalCal';
    const table=q('#appointmentsTable');
    if(table?.parentNode)table.parentNode.insertBefore(host,table);
    else screen.append(host);
    return host;
  }
  function eventHtml(a){return '<div class="dabbirCalEvent" data-appt-id="'+esc(a.id)+'"><b>'+esc(fmtTime(a.starts_at))+' · '+esc(customerName(a.customer_id))+'</b><span>'+esc(statusLabel(a.status))+'</span></div>'}
  function dayHtml(key,compact=false){const rows=apptsForKey(key),today=key===todayKey();return '<div class="dabbirCalDay '+(today?'isToday':'')+'"><div class="dabbirCalDayHead"><b>'+esc(fmtDay(key,compact?{day:'numeric'}:{weekday:'short',day:'numeric',month:'short'}))+'</b><span>'+rows.length+'</span></div>'+(rows.length?rows.map(eventHtml).join(''):'<div class="dabbirCalEmpty">'+esc(copy().empty)+'</div>')+'</div>'}
  function renderDay(){return {range:fmtDay(cursor,{weekday:'long',day:'numeric',month:'long',year:'numeric'}),html:'<div class="dabbirCalGrid day">'+dayHtml(cursor)+'</div>'}}
  function renderWeek(){const start=startOfWeek(cursor),keys=Array.from({length:7},(_,i)=>shiftKey(start,i));return {range:fmtDay(start,{day:'numeric',month:'short'})+' – '+fmtDay(keys[6],{day:'numeric',month:'short',year:'numeric'}),html:'<div class="dabbirCalGrid week">'+keys.map(k=>dayHtml(k)).join('')+'</div>'}}
  function renderMonth(){const first=firstOfMonth(cursor),count=daysInMonth(first),startOffset=(dateFromKey(first).getUTCDay()+6)%7,keys=Array.from({length:count},(_,i)=>shiftKey(first,i));const weekdays=Array.from({length:7},(_,i)=>fmtDay(shiftKey('2026-08-31',i),{weekday:'short'}));return {range:fmtMonth(first),html:'<div class="dabbirCalGrid month">'+weekdays.map(x=>'<div class="dabbirCalWeekday">'+esc(x)+'</div>').join('')+Array.from({length:startOffset},()=>'<div></div>').join('')+keys.map(k=>dayHtml(k,true)).join('')+'</div>'}}
  function move(delta){if(view==='day')cursor=shiftKey(cursor,delta);else if(view==='week')cursor=shiftKey(cursor,delta*7);else cursor=shiftMonth(cursor,delta);signature='';render()}
  function render(force=false){
    const w=ws();if(!w?.business)return;
    const host=ensureHost();if(!host)return;
    const sig=(ar()?'ar':'en')+'|'+view+'|'+cursor+'|'+businessTimezone()+'|'+activeAppointments().map(a=>[a.id,a.starts_at,a.status,a.customer_id].join(':')).join('|');
    if(!force&&sig===signature)return;signature=sig;
    const c=copy(),body=view==='day'?renderDay():view==='month'?renderMonth():renderWeek();
    host.innerHTML='<div class="dabbirCalHead"><div><h3>'+esc(c.title)+'</h3><p>'+esc(c.subtitle)+'</p></div><div class="dabbirCalControls"><button type="button" data-cal-view="day" class="'+(view==='day'?'on':'')+'">'+esc(c.day)+'</button><button type="button" data-cal-view="week" class="'+(view==='week'?'on':'')+'">'+esc(c.week)+'</button><button type="button" data-cal-view="month" class="'+(view==='month'?'on':'')+'">'+esc(c.month)+'</button><button type="button" data-cal-today>'+esc(c.today)+'</button><button type="button" data-cal-prev aria-label="'+esc(c.previous)+'">‹</button><button type="button" data-cal-next aria-label="'+esc(c.next)+'">›</button></div></div><div class="dabbirCalRange">'+esc(body.range)+'</div>'+body.html;
    qa('[data-cal-view]').forEach(btn=>btn.onclick=()=>{view=btn.dataset.calView;signature='';render()});
    q('[data-cal-today]')?.addEventListener('click',()=>{cursor=todayKey();signature='';render()});
    q('[data-cal-prev]')?.addEventListener('click',()=>move(-1));
    q('[data-cal-next]')?.addEventListener('click',()=>move(1));
    correctTodayMetric();
  }
  function correctTodayMetric(){
    const cards=qa('#dashCards .card.metric');if(cards.length<2)return;
    const count=activeAppointments().filter(a=>dayKey(a.starts_at)===todayKey()).length;
    const strong=cards[1]?.querySelector('strong');if(strong)strong.textContent=String(count);
  }
  const observer=new MutationObserver(()=>{if(q('#screen-appointments')?.classList.contains('active'))setTimeout(()=>render(),0);else setTimeout(correctTodayMetric,0)});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  setInterval(()=>{if(q('#screen-appointments')?.classList.contains('active'))render();correctTodayMetric()},1500);
  setTimeout(()=>{render(true);correctTodayMetric()},700);
  window.__dabbirInternalCalendarUi={render:()=>render(true),todayKey,businessTimezone,version:'internal-calendar-v1'};
})();`;

export default function handler(req,res){
  if(req.method!=='GET')return res.status(405).setHeader('allow','GET').end('Method Not Allowed');
  res.setHeader('content-type','application/javascript; charset=utf-8');
  res.setHeader('cache-control','public, max-age=300');
  res.setHeader('x-dabbir-internal-calendar-ui','v1');
  return res.status(200).send(script);
}
