// One read-only lifecycle and date policy for every booking surface.
// Elapsed time is NOT evidence of delivery, payment, cancellation or no-show.
export function createBookingLifecycle() {
  const terminal = new Set(['completed', 'done', 'cancelled', 'canceled', 'no_show', 'rejected']);
  const views = new Map();
  const status = row => String(row?.status || 'requested').trim().toLowerCase();
  const time = value => value == null || value === '' ? NaN : new Date(value).getTime();
  function timezone(business = {}) {
    const zones = {AE:'Asia/Dubai', SA:'Asia/Riyadh', KW:'Asia/Kuwait', QA:'Asia/Qatar', BH:'Asia/Bahrain', OM:'Asia/Muscat'};
    const country = String(business.country_code || business.locale?.split('-')[1] || 'AE').toUpperCase();
    const zone = business.timezone || zones[country] || 'Asia/Dubai';
    try { new Intl.DateTimeFormat('en', {timeZone:zone}); return zone; } catch { return zones[country] || 'Asia/Dubai'; }
  }
  function dayKey(value, business = {}) {
    const stamp = time(value);
    if (!Number.isFinite(stamp)) return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone:timezone(business), year:'numeric', month:'2-digit', day:'2-digit',
    }).formatToParts(new Date(stamp)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const wallDate = key => new Date(`${key}T12:00:00.000Z`);
  const wallKey = date => Number.isFinite(time(date)) ? new Date(date).toISOString().slice(0,10) : '';
  function addDays(key, n) { const date = wallDate(key); date.setUTCDate(date.getUTCDate() + n); return wallKey(date); }
  function period(view) {
    const day = view.day;
    if (view.allDates) return null;
    if (view.view === 'month') {
      const from = day.slice(0,7) + '-01', date = wallDate(from);
      date.setUTCMonth(date.getUTCMonth() + 1);
      return {from, to:wallKey(date)};
    }
    if (view.view === 'week') {
      const from = addDays(day, -(wallDate(day).getUTCDay() + 6) % 7);
      return {from, to:addDays(from,7)};
    }
    return {from:day, to:addDays(day,1)};
  }
  function localTimeToIso(raw,business={}) {
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw||''))return null;
    const target=Date.parse(raw+':00.000Z');if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,16)!==raw)return null;
    let value=target;
    for(let i=0;i<4;i++){
      const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone(business),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
      const observed=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second),next=value+target-observed;
      if(next===value)return new Date(value).toISOString();value=next;
    }
    return null;
  }
  function classify(row, business = {}, now = Date.now()) {
    if (terminal.has(status(row))) return 'history';
    const start = time(row?.starts_at), end = time(row?.ends_at);
    if (!Number.isFinite(start)) return 'review';
    // Preserve a genuinely running, overnight booking until its scheduled end.
    if (Number.isFinite(end) && end > start) return end <= time(now) ? 'review' : 'current';
    // Missing duration is not a licence to invent an end time.
    return dayKey(start,business) < dayKey(now,business) ? 'review' : 'current';
  }
  function inContext(row, workspace = {}) {
    if (!row?.id) return false;
    if (row.business_id && row.business_id !== workspace.business?.id) return false;
    const scope = workspace.branch_scope;
    if (scope?.branch_id && row.branch_id !== scope.branch_id) return false;
    if (scope?.mode === 'assigned' && Array.isArray(scope.branch_ids) && !scope.branch_ids.includes(row.branch_id)) return false;
    return true;
  }
  function inPeriod(row, range, business = {}) {
    if (!range) return true;
    const first = dayKey(row.starts_at,business);
    const end = time(row.ends_at), start = time(row.starts_at);
    const last = Number.isFinite(end) && end > start ? dayKey(end - 1,business) : first;
    return Boolean(first && first < range.to && last >= range.from);
  }
  const onDay = (row, day, business) => inPeriod(row,{from:day,to:addDays(day,1)},business);
  function select(rows = [], workspace = {}, options = {}) {
    const {scope='current', range=null, now=Date.now()} = options;
    return rows.filter(row => inContext(row,workspace))
      .filter(row => scope === 'all' || classify(row,workspace.business,now) === scope)
      .filter(row => inPeriod(row,range,workspace.business))
      .sort((a,b) => {
        const delta = (time(a.starts_at) || 0) - (time(b.starts_at) || 0);
        return (scope === 'current' ? delta : -delta) || String(a.id).localeCompare(String(b.id));
      });
  }
  function contextKey(workspace = {}) {
    const scope = workspace.branch_scope || {};
    return `${workspace.business?.id || ''}|${scope.branch_id || (scope.branch_ids || []).slice().sort().join(',') || 'all'}`;
  }
  function getView(workspace = {}, now = Date.now()) {
    const key = contextKey(workspace), today = dayKey(now,workspace.business);
    if (!views.has(key)) views.set(key,{scope:'current',view:'day',day:today,allDates:false,followToday:true});
    const state = views.get(key);
    if (state.followToday) state.day = today;
    return {...state};
  }
  function setView(workspace, patch = {}) {
    const state = getView(workspace), next = {...state, ...patch};
    if (!['current','review','history'].includes(next.scope) || !['day','week','month'].includes(next.view) || !/^\d{4}-\d{2}-\d{2}$/.test(next.day)) throw new Error('INVALID_BOOKING_VIEW');
    if (patch.scope && patch.scope !== state.scope && patch.allDates === undefined) next.allDates = patch.scope !== 'current';
    views.set(contextKey(workspace),next);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('dabbir:booking-view-changed'));
    return {...next};
  }
  function move(workspace, delta) {
    const state = getView(workspace);
    let day;
    if (state.view === 'month') { const date = wallDate(state.day.slice(0,7)+'-01'); date.setUTCMonth(date.getUTCMonth()+delta); day=wallKey(date); }
    else day = addDays(state.day, delta*(state.view==='week'?7:1));
    return setView(workspace,{day,allDates:false,followToday:false});
  }
  function labels(ar) {
    return ar ? {current:'الحالية',review:'تحتاج حسمًا',history:'السجل',allDates:'كل التواريخ',reviewHint:'انتهى الموعد ولم تُسجَّل النتيجة. حدّد ما حدث؛ لا تُحتسب الخدمة مكتملة تلقائيًا.',historyHint:'سجل محفوظ، وليس أعمالًا مطلوبة الآن.'}
      : {current:'Current',review:'Needs resolution',history:'History',allDates:'All dates',reviewHint:'The scheduled time elapsed without a recorded outcome. Record what happened; elapsed time does not mean completed.',historyHint:'Retained history, not current work.'};
  }
  function controls(workspace, rows, ar) {
    const state=getView(workspace), text=labels(ar);
    return '<div class="dabbirBookingScopes" role="group" aria-label="'+(ar?'عرض الحجوزات':'Booking view')+'">'+['current','review','history'].map(scope=>'<button type="button" data-booking-scope="'+scope+'" aria-pressed="'+(scope===state.scope)+'">'+text[scope]+'</button>').join('')+'</div>';
  }
  return {version:'booking-lifecycle-v1',localTimeToIso,status,terminal:row=>terminal.has(status(row)),timezone,dayKey,wallDate,wallKey,addDays,period,classify,inContext,inPeriod,onDay,select,contextKey,getView,setView,move,labels,controls};
}
export const bookingLifecycle = createBookingLifecycle();
export const bookingLifecycleBrowser = `(()=>{if(window.__dabbirBookingLifecycle)return;window.__dabbirBookingLifecycle=(${createBookingLifecycle.toString()})();const tick=()=>{if(!document.hidden&&document.querySelector('#screen-appointments.active'))window.dispatchEvent(new Event('dabbir:booking-view-changed'))};setInterval(tick,60000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);})();`;

// One coalesced, RLS-scoped, paginated reader; never replace the workspace's
// historical data with a filtered view or let a late response switch context.
export function installBookingReader(lifecycle) {
  const cache=new Map();
  const recordRequests=new Map();
  const validId=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
  const emit=()=>window.dispatchEvent(new Event('dabbir:booking-data-changed'));
  const key=w=>lifecycle.contextKey(w)+'|'+JSON.stringify(lifecycle.getView(w));
  function entry(w) { const k=key(w); if(!cache.has(k))cache.set(k,{rows:[],customers:[],records:new Map(),recordCustomers:new Map(),ready:false,loading:false,error:null,has_more:false,next_offset:0,total:null,loadedAt:0,epoch:0}); return cache.get(k); }
  async function ensure(w, more=false, force=false) {
    if(!w?.business?.id)return;
    const viewKey=key(w),item=entry(w);
    if(item.loading||(!force&&!more&&item.ready&&Date.now()-item.loadedAt<60000)||(!force&&!more&&item.error&&Date.now()-item.loadedAt<60000))return;
    const state=lifecycle.getView(w),range=lifecycle.period(state),epoch=item.epoch;
    const params=new URLSearchParams({business_id:w.business.id,scope:state.scope,offset:String(more?item.next_offset:0)});
    if(w.branch_scope?.branch_id)params.set('branch_id',w.branch_scope.branch_id);
    else if(w.branch_scope?.mode==='all')params.set('branch_id','all');
    if(range){params.set('from',range.from);params.set('to',range.to)}
    item.loading=true;item.error=null;
    try {
      const response=await fetch('/api/appointment-management?'+params,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json();
      if(!response.ok||!body?.ok||!Array.isArray(body.appointments))throw new Error(body?.error||'BOOKING_READ_FAILED');
      if(item.epoch!==epoch)return;
      if(body.business_id!==w.business.id||body.branch_id!==(w.branch_scope?.branch_id||null))throw new Error('BOOKING_CONTEXT_MISMATCH');
      const merge=(a,b)=>[...new Map([...a,...b].map(row=>[row.id,row])).values()];
      item.rows=merge(more?item.rows:[],body.appointments);
      item.customers=merge(more?item.customers:[],body.customers||[]);
      // A successful refresh supersedes direct reads, including ones still in
      // flight. Pagination supersedes only the records in its accepted page.
      // Failed reads retain the last verified data and never advance this fence.
      item.epoch++;
      for(const requestKey of recordRequests.keys())if(requestKey.startsWith(viewKey+'|record:'))recordRequests.delete(requestKey);
      if(!more){item.records.clear();item.recordCustomers.clear()}
      else {
        for(const row of body.appointments)item.records.delete(row.id);
        for(const customer of body.customers||[])item.recordCustomers.delete(customer.id);
      }
      item.ready=true;item.has_more=body.has_more;item.next_offset=body.next_offset;item.total=body.total;
    } catch(error) { if(item.epoch===epoch)item.error=String(error?.message||error); }
    finally { item.loading=false;item.loadedAt=Date.now();emit(); }
  }
  function ensureRecord(w,id) {
    if(!validId(id)||!validId(w?.business?.id))return Promise.reject(new Error('INVALID_APPOINTMENT_ID'));
    const viewKey=key(w),requestKey=viewKey+'|record:'+id,item=entry(w),epoch=item.epoch;
    if(recordRequests.has(requestKey))return recordRequests.get(requestKey);
    const businessId=w.business.id,branchId=w.branch_scope?.branch_id||null;
    const state=lifecycle.getView(w),range=lifecycle.period(state);
    const context={business:{...w.business},branch_scope:{...w.branch_scope}};
    const current=()=>cache.get(viewKey)===item&&item.epoch===epoch&&key(w)===viewKey;
    const params=new URLSearchParams({business_id:businessId,appointment_id:id,scope:state.scope});
    if(branchId)params.set('branch_id',branchId);
    else if(w.branch_scope?.mode==='all')params.set('branch_id','all');
    if(range){params.set('from',range.from);params.set('to',range.to)}
    const request=(async()=>{
      const response=await fetch('/api/appointment-management?'+params,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const body=await response.json();
      if(!current())throw new Error('BOOKING_CONTEXT_CHANGED');
      if(!response.ok||!body?.ok)throw new Error(body?.error||'BOOKING_READ_FAILED');
      const row=body.appointment;
      if(body.business_id!==businessId||body.branch_id!==branchId||body.scope!==state.scope||row?.id!==id||row?.business_id!==businessId||!lifecycle.inContext(row,context)||!Array.isArray(body.customers))throw new Error('BOOKING_CONTEXT_MISMATCH');
      // A direct record must not advance or replace the paginated collection.
      item.records.set(id,row);
      for(const customer of body.customers)if(customer.id===row.customer_id)item.recordCustomers.set(customer.id,customer);
      emit();return row;
    })();
    recordRequests.set(requestKey,request);
    // Rejections are passed to the caller; no failed read is cached as success.
    const cleanup=()=>{if(recordRequests.get(requestKey)===request)recordRequests.delete(requestKey)};
    request.then(cleanup,cleanup);
    return request;
  }
  function rows(w) {
    const item=entry(w),state=lifecycle.getView(w);
    return lifecycle.select(item.ready?item.rows:[],w,{scope:state.scope,range:lifecycle.period(state)});
  }
  function status(w,ar) {
    const item=entry(w);
    if(item.error)return '<p class="dabbirBookingScopeHint" role="alert">'+(ar?'تعذر تحميل الحجوزات.':'Bookings could not be loaded.')+' <button type="button" data-booking-retry>'+(ar?'إعادة المحاولة':'Retry')+'</button></p>';
    if(!item.ready||item.loading)return '<p class="dabbirBookingScopeHint" role="status">'+(ar?'جارٍ تحميل الحجوزات…':'Loading bookings…')+'</p>';
    return '<p class="dabbirBookingScopeHint">'+item.rows.length+(item.total===null?'':' / '+item.total)+'</p>'+(item.has_more?'<button type="button" data-booking-more>'+(ar?'عرض المزيد':'Load more')+'</button>':'');
  }
  function bind(host,w) {
    host.querySelector('[data-booking-more]')?.addEventListener('click',()=>{void ensure(w,true);emit()});
    host.querySelector('[data-booking-retry]')?.addEventListener('click',()=>{void ensure(w,false,true);emit()});
  }
  function invalidate(w) {
    const prefix=lifecycle.contextKey(w)+'|';
    for(const [k,item] of cache)if(k.startsWith(prefix)){item.epoch++;cache.delete(k)}
    for(const k of recordRequests.keys())if(k.startsWith(prefix))recordRequests.delete(k);
    emit();
  }
  const customer=(w,id)=>entry(w).recordCustomers.get(id)||entry(w).customers.find(row=>row.id===id);
  // Once the scoped reader is ready, a stale workspace snapshot cannot restore
  // a booking absent from its cache. The caller can request that exact ID again.
  const find=(w,id)=>{const item=entry(w);return item.records.get(id)||item.rows.find(row=>row.id===id)||(!item.ready?(w.appointments||[]).find(row=>row.id===id):undefined)};
  return {entry,ensure,ensureRecord,rows,status,bind,invalidate,customer,find};
}
export const bookingReaderBrowser = `(()=>{if(!window.__dabbirBookingReader)window.__dabbirBookingReader=(${installBookingReader.toString()})(window.__dabbirBookingLifecycle)})();`;
export const bookingBrowser = bookingLifecycleBrowser+'\n'+bookingReaderBrowser;
