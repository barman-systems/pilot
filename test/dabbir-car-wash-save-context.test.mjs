import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/car-wash-booking-edit-ui.js';

let script='';
handler({method:'GET'},{setHeader(){return this},status(){return this},send(value){script=value;return this}});
const ID='appointment-a',BIZ='business-a';
const original=()=>({id:ID,customer_id:'customer-a',starts_at:'2026-09-03T10:00:00.000Z',ends_at:'2026-09-03T11:00:00.000Z',status:'confirmed',service_id:'service-a'});
const persisted=()=>({...original(),status:'completed',starts_at:'2026-09-03T11:00:00.000Z',ends_at:'2026-09-03T12:00:00.000Z'});
const success=(row=persisted())=>({ok:true,json:async()=>({ok:true,appointment:row})});

// Minimal DOM adapter: execute the real served script and submit its real handler.
// Layout and actual browser rendering are covered separately, not by this adapter.
function harness({respond=async()=>success(),type='car_wash',zone='Asia/Dubai',renderThrows=false}={}){
  const elements=new Map(),requests=[],toasts=[],timers=[];
  const stats={renders:0,legacyRenders:0,sanitizes:0,reloads:0,runtimeLoads:0};
  class Element{
    constructor(){this.value='';this.disabled=false;this.dataset={};const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)};}
    append(el){if(el.id)elements.set('#'+el.id,el)}
    focus(){}
    removeAttribute(){}
    set innerHTML(html){this.html=html;for(const match of html.matchAll(/<(?:form|input|select|button)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const el=new Element();el.id=match[2];el.value=match[1].match(/\bvalue="([^"]*)"/)?.[1]||'';elements.set('#'+el.id,el)}}
    get innerHTML(){return this.html||''}
  }
  const document={documentElement:{lang:'ar',dataset:{}},body:new Element(),head:new Element(),createElement:()=>new Element(),querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],addEventListener(){}};
  const context={document,Intl,Date,console,workspace:{business:{id:BIZ,business_type:type,timezone:zone},appointments:[original()],customers:[{id:'customer-a',display_name:'Synthetic customer'}]},current:'appointments',selectedConversationId:'conversation-a',calendarCursor:'2026-09-03',scrollY:640,addEventListener(){},MutationObserver:class{observe(){}},setTimeout:fn=>timers.push(fn),location:{reload(){stats.reloads++}},loadRuntime(){stats.runtimeLoads++},toast:msg=>toasts.push(msg),renderAppointments(){stats.legacyRenders++},__dabbirAppointmentManagement:{render(){stats.renders++;if(renderThrows)throw new Error('RENDER_FAILED')}},__dabbirCalendarLiveUi:{sanitize(){stats.sanitizes++}},fetch:async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return respond()}};
  context.window=context;vm.runInNewContext(script,context);
  context.__dabbirCarWashBookingEdit.openEditor(ID);
  const submitter={disabled:false};
  const submit=()=>{
    const form=elements.get('#dabbirCarWashPastEditForm');assert.ok(form,'editor opened');
    elements.get('#dabbirCarWashPastEditTime').value='2026-09-03T15:00';
    elements.get('#dabbirCarWashPastEditStatus').value='completed';
    return form.onsubmit({preventDefault(){},submitter});
  };
  const flushTimers=()=>{while(timers.length)timers.shift()()};
  return {context,elements,requests,toasts,stats,submit,submitter,flushTimers};
}

test('saved historical booking updates from the server row without resetting navigation',async()=>{
  const h=harness();await h.submit();h.flushTimers();
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/appointment-management');
  assert.equal(h.requests[0].body.business_id,BIZ);assert.equal(h.requests[0].body.starts_at,'2026-09-03T11:00:00.000Z');
  assert.deepEqual(h.context.workspace.appointments[0],persisted());
  assert.equal(h.context.current,'appointments');assert.equal(h.context.selectedConversationId,'conversation-a');
  assert.equal(h.context.calendarCursor,'2026-09-03');assert.equal(h.context.scrollY,640);
  assert.equal(h.stats.renders,1);assert.equal(h.stats.legacyRenders,1);assert.equal(h.stats.sanitizes,1);
  assert.equal(h.stats.reloads,0);assert.equal(h.stats.runtimeLoads,0);
  assert.equal(h.elements.get('#dabbirCarWashPastEditModal').classList.contains('open'),false);
  assert.deepEqual(h.toasts,['تم تعديل الحجز.']);assert.equal(h.submitter.disabled,false);
});

test('a rejected write preserves the old row and keeps the editor available',async()=>{
  const h=harness({respond:async()=>({ok:false,json:async()=>({ok:false,error:'APPOINTMENT_MANAGEMENT_REQUIRED'})})});
  await h.submit();h.flushTimers();
  assert.deepEqual(h.context.workspace.appointments[0],original());assert.equal(h.stats.renders,0);assert.equal(h.stats.reloads,0);
  assert.equal(h.elements.get('#dabbirCarWashPastEditModal').classList.contains('open'),true);
  assert.match(h.toasts[0],/^تعذر تعديل الحجز/);assert.equal(h.submitter.disabled,false);
});

test('double submission sends one request and does not optimistically mutate the row',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r});const h=harness({respond:()=>pending});
  const first=h.submit();await h.submit();
  assert.equal(h.requests.length,1);assert.equal(h.submitter.disabled,true);
  assert.deepEqual(h.context.workspace.appointments[0],original());
  resolve(success());await first;assert.equal(h.submitter.disabled,false);
});

test('switching business before submitting prevents a stale write',async()=>{
  const h=harness();h.context.workspace={business:{id:'business-b',business_type:'car_wash'},appointments:[original()]};
  await h.submit();assert.equal(h.requests.length,0);assert.equal(h.stats.renders,0);
});

test('late success for another business cannot change the active business or navigation',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r});const h=harness({respond:()=>pending});
  const save=h.submit();h.context.workspace={business:{id:'business-b',business_type:'car_wash'},appointments:[original()]};h.context.current='customers';
  resolve(success());await save;h.flushTimers();
  assert.deepEqual(h.context.workspace.appointments[0],original());assert.equal(h.context.current,'customers');
  assert.equal(h.stats.renders,0);assert.equal(h.stats.reloads,0);assert.deepEqual(h.toasts,[]);
});

test('a successful response with an unrelated row is not copied into the booking',async()=>{
  const h=harness({respond:async()=>success({...persisted(),id:'unrelated'})});await h.submit();
  assert.deepEqual(h.context.workspace.appointments[0],original());assert.equal(h.stats.renders,0);
  assert.match(h.toasts[0],/^تم حفظ الحجز، لكن تعذر تحديث عرضه/);
});

test('a successful response with another business id is not copied into the booking',async()=>{
  const h=harness({respond:async()=>success({...persisted(),business_id:'business-b'})});await h.submit();
  assert.deepEqual(h.context.workspace.appointments[0],original());assert.equal(h.stats.renders,0);
  assert.match(h.toasts[0],/^تم حفظ الحجز، لكن تعذر تحديث عرضه/);
});

test('render failure is reported as a display problem, not a failed database write',async()=>{
  const h=harness({renderThrows:true});await h.submit();h.flushTimers();
  assert.deepEqual(h.context.workspace.appointments[0],persisted());assert.equal(h.stats.reloads,0);
  assert.match(h.toasts[0],/^تم حفظ الحجز، لكن تعذر تحديث عرضه/);assert.equal(h.submitter.disabled,false);
});

test('no-change server responses keep the booking and screen intact',async()=>{
  const h=harness({respond:async()=>({ok:true,json:async()=>({ok:true,state:'NO_CHANGE',appointment:original()})})});
  await h.submit();h.flushTimers();assert.deepEqual(h.context.workspace.appointments[0],original());
  assert.equal(h.context.current,'appointments');assert.equal(h.stats.reloads,0);
});

test('the in-place save retains the selected business timezone authority',async()=>{
  const h=harness({zone:'Asia/Riyadh'});await h.submit();
  assert.equal(h.requests[0].body.starts_at,'2026-09-03T12:00:00.000Z');
});

test('the historical editor does not open for a different business type',()=>{
  const h=harness({type:'salon'});assert.equal(h.elements.has('#dabbirCarWashPastEditForm'),false);
});

test('mobile controls use bounded grid sizing and an isolated LTR date field',()=>{
  assert.match(script,/grid-template-columns:minmax\(0,1fr\)/);
  assert.match(script,/box-sizing:border-box;width:100%;max-width:100%;min-width:0/);
  assert.match(script,/id="dabbirCarWashPastEditTime" type="datetime-local" dir="ltr"/);
  assert.match(script,/label for="dabbirCarWashPastEditTime"/);
  assert.doesNotMatch(script,/location\.reload\s*\(/);
});
