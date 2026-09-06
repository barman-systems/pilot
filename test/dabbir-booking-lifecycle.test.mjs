import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createBookingLifecycle,installBookingReader} from '../api/_booking-lifecycle.js';
import {bookingQuery,bookingDayStart} from '../api/_booking-query.js';
import calendarHandler from '../api/calendar-performance-ui.js';
const NOW=Date.parse('2026-09-06T04:35:00Z');
const business={id:'business-a',timezone:'Asia/Dubai'};
const workspace={business,branch_scope:{mode:'selected',branch_id:'branch-a'}};
const row=(id,status,start='2026-09-03T10:00:00Z',end='2026-09-03T11:00:00Z')=>({id,business_id:business.id,branch_id:'branch-a',status,starts_at:start,ends_at:end});
const original=[row('completed','completed'),row('past-1','confirmed'),row('past-2','confirmed')];
const types=['clinic','store','salon','laundry','real_estate','creator','services','car_wash','other'];
for(const business_type of types)test(`${business_type}: screenshot's expired rows are not current and are never auto-completed`,()=>{
  const lifecycle=createBookingLifecycle(),w={...workspace,business:{...business,business_type}},copy=structuredClone(original);
  assert.deepEqual(lifecycle.select(copy,w,{scope:'current',now:NOW}),[]);
  assert.deepEqual(lifecycle.select(copy,w,{scope:'review',now:NOW}).map(a=>a.id),['past-1','past-2']);
  assert.deepEqual(lifecycle.select(copy,w,{scope:'history',now:NOW}).map(a=>a.id),['completed']);
  assert.deepEqual(copy,original,'classification must not mutate operational or payment truth');
});

test('terminal lifecycle states leave current immediately, including future terminal bookings',()=>{
  const life=createBookingLifecycle();
  for(const status of ['completed','cancelled','canceled','no_show','done',' COMPLETED '])assert.equal(life.classify(row('x',status,'2026-09-07T10:00Z','2026-09-07T11:00Z'),business,NOW),'history');
});
test('running overnight work stays current until the real end, with an exact boundary',()=>{
  const life=createBookingLifecycle(),a=row('overnight','in_progress','2026-09-05T19:45:00Z','2026-09-06T05:00:00Z');
  assert.equal(life.classify(a,business,NOW),'current');
  assert.equal(life.onDay(a,'2026-09-06',business),true);
  assert.equal(life.classify(a,business,Date.parse(a.ends_at)),'review');
  assert.equal(a.status,'in_progress');
});
test('unknown durations use business day, not device timezone or invented service completion',()=>{
  const life=createBookingLifecycle(),a=row('x','confirmed','2026-09-05T20:10:00Z',null);
  assert.equal(life.classify(a,business,NOW),'current');
  assert.equal(life.classify(a,{...business,timezone:'Asia/Riyadh'},NOW),'review');
  assert.equal(life.classify({...a,starts_at:null},business,NOW),'review');
});
test('current selected date is not diluted by future, completed, cancelled or other branches',()=>{
  const life=createBookingLifecycle(),items=[...original,row('today','confirmed','2026-09-06T10:00:00Z','2026-09-06T11:00:00Z'),row('tomorrow','confirmed','2026-09-07T10:00:00Z','2026-09-07T11:00:00Z')];
  items.push({...items[3],id:'foreign-business',business_id:'other'},{...items[3],id:'foreign-branch',branch_id:'branch-b'});
  const range=life.period({view:'day',day:'2026-09-06'});
  assert.deepEqual(life.select(items,workspace,{range,now:NOW}).map(x=>x.id),['today']);
  const all={business,branch_scope:{mode:'all'}};
  assert.deepEqual(life.select(items,all,{range,now:NOW}).map(x=>x.id),['foreign-branch','today']);
});
test('week/month boundaries, month ends and exclusive midnight are stable wall dates',()=>{
  const life=createBookingLifecycle();
  assert.deepEqual(life.period({view:'week',day:'2026-09-06'}),{from:'2026-08-31',to:'2026-09-07'});
  assert.deepEqual(life.period({view:'month',day:'2026-01-31'}),{from:'2026-01-01',to:'2026-02-01'});
  const a=row('x','completed','2026-09-05T19:00:00Z','2026-09-05T20:00:00Z');
  assert.equal(life.onDay(a,'2026-09-06',business),false);
});
test('view and date scope are isolated by business and branch, with automatic midnight rollover',()=>{
  const life=createBookingLifecycle();
  life.getView(workspace,NOW);
  life.setView(workspace,{scope:'history'});
  assert.equal(life.getView(workspace,NOW).allDates,true);
  const other={...workspace,branch_scope:{mode:'selected',branch_id:'branch-b'}};
  assert.equal(life.getView(other,NOW).scope,'current');
  assert.equal(life.getView(other,NOW+86400000).day,'2026-09-07');
  life.setView(other,{day:'2026-09-03',followToday:false,view:'day',allDates:false});
  assert.equal(life.getView(other,NOW+86400000).day,'2026-09-03');
});
test('business-local time conversion handles GCC and DST and rejects invalid dates',()=>{
  const life=createBookingLifecycle();
  assert.equal(life.localTimeToIso('2026-09-06T08:35',business),'2026-09-06T04:35:00.000Z');
  assert.equal(life.localTimeToIso('2026-09-06T08:35',{timezone:'Asia/Riyadh'}),'2026-09-06T05:35:00.000Z');
  assert.equal(life.localTimeToIso('2026-03-08T02:30',{timezone:'America/New_York'}),null);
  assert.equal(life.localTimeToIso('2026-02-30T10:00',business),null);
  assert.equal(bookingDayStart('2026-09-06',business),'2026-09-05T20:00:00.000Z');
  assert.equal(bookingDayStart('2026-03-09',{timezone:'America/New_York'}),'2026-03-09T04:00:00.000Z');
});
test('database scopes filter before limit and use end time plus business-day fallback',()=>{
  const current=decodeURIComponent(bookingQuery({business,scope:'current',from:'2026-09-06',to:'2026-09-07',now:NOW}));
  assert.match(current,/status\.not\.in\.\(completed,cancelled,no_show\)/);
  assert.match(current,/ends_at\.gt\.2026-09-06T04:35:00.000Z/);
  assert.match(current,/and\(ends_at\.is\.null,starts_at\.gte\.2026-09-05T20:00:00.000Z\)/);
  assert.match(current,/starts_at\.lt\.2026-09-06T20:00:00.000Z/);
  const review=decodeURIComponent(bookingQuery({business,scope:'review',now:NOW}));
  assert.match(review,/or\(starts_at\.is\.null,ends_at\.lte\./);
  assert.match(review,/starts_at\.lt\.2026-09-05T20:00:00.000Z/);
  assert.equal(decodeURIComponent(bookingQuery({business,scope:'history',now:NOW})),'and=(status.in.(completed,cancelled,no_show))');
  assert.throws(()=>bookingQuery({business,scope:'invalid',now:NOW}),/INVALID_BOOKING_SCOPE/);
  assert.throws(()=>bookingQuery({business,scope:'current',from:'2026-09-07',to:'2026-09-06',now:NOW}),/INVALID_BOOKING_DATE_RANGE/);
});
test('actual combined UI parses, preserves patch guards and installs one shared reader only',async()=>{
  const res={statusCode:200,body:'',status(c){this.statusCode=c;return this},setHeader(){return this},send(s){this.body=s;return this},end(s){this.body=s;return this}};
  await calendarHandler({method:'GET'},res);assert.equal(res.statusCode,200);new vm.Script(res.body);
  assert.equal((res.body.match(/function installBookingReader/g)||[]).length,1);
  assert.match(res.body,/supportsHistoricalEdit:true/);
  assert.match(res.body,/if\(!w\?\.business\|\|businessType\(\)==='salon'\)return/);
  assert.match(res.body,/for\(let h=0;h<24;h\+\+\)/);
});

test('reader coalesces pagination, fences late context replies and exposes errors instead of false emptiness',async t=>{
  const life=createBookingLifecycle(),events=[];
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('unconfigured fetch')});
  const oldWindow=globalThis.window;
  globalThis.window={dispatchEvent:event=>events.push(event.type)};
  t.after(()=>{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow});
  const reader=installBookingReader(life),w={business:{...business},branch_scope:{mode:'selected',branch_id:'branch-a'}};
  let resolve,calls=0;
  globalThis.fetch=async()=>{calls++;return new Promise(r=>{resolve=r})};
  const first=reader.ensure(w);await reader.ensure(w);assert.equal(calls,1);
  life.setView(w,{scope:'history'});
  resolve({ok:true,json:async()=>({ok:true,business_id:business.id,branch_id:'branch-a',appointments:[row('old-response','confirmed')],total:1,has_more:false,next_offset:1})});await first;
  assert.deepEqual(reader.rows(w),[],'old view response must not replace the newly selected view');
  globalThis.fetch=async()=>({ok:false,json:async()=>({ok:false,error:'AUTH_REQUIRED'})});
  await reader.ensure(w);assert.equal(reader.entry(w).ready,false);assert.match(reader.status(w,true),/role="alert"/);
  assert.deepEqual(w.business,business);assert.equal(events.includes('dabbir:booking-data-changed'),true);
});
