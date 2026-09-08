import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/calendar-performance-ui.js';
import {bookingBrowser} from '../api/_booking-lifecycle.js';

const BUSINESS='10000000-0000-4000-8000-000000000001';
const APPOINTMENT='20000000-0000-4000-8000-000000000001';
const CUSTOMER='30000000-0000-4000-8000-000000000001';
const countries={AE:'Asia/Dubai',SA:'Asia/Riyadh',KW:'Asia/Kuwait',QA:'Asia/Qatar',BH:'Asia/Bahrain',OM:'Asia/Muscat'};
async function clientSource(){
  let body='';
  const res={statusCode:200,status(value){this.statusCode=value;return this},setHeader(){return this},send(value){body=String(value);return this},end(value){body=String(value)}};
  await handler({method:'GET'},res);assert.equal(res.statusCode,200);
  // Take this component from the actual shipped generator AFTER its guarded
  // timezone/performance transforms. Unrelated screens need not be mounted.
  const start=body.indexOf('(()=>{\n  if(window.__dabbirAppointmentManagementUi)'),end=body.indexOf('\n})();',start);
  assert.ok(start>=0&&end>start);
  return bookingBrowser+'\n'+body.slice(start,end+'\n})();'.length);
}
const generatedClient=await clientSource();

// Execute the complete emitted browser script. The DOM shim retains the real
// rendered input values and calls the actual form submit handler and fetch path.
function fixture({country='SA',deviceTimezone='America/Los_Angeles',startsAt='2030-01-15T06:00:00.000Z',language='en',fetchImpl}={}){
  const elements=new Map(),calls=[],toasts=[],events=new Map();
  class Element{
    constructor(tag){this.tag=tag;this.dataset={};this.style={};this.children=[];this.value='';this.disabled=false;this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name)};}
    append(node){node.parentNode=this;this.children.push(node);if(node.id)elements.set(node.id,node)}
    set innerHTML(value){
      this.html=String(value);
      for(const match of this.html.matchAll(/<(form|input|select|button)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
        const node=new Element(match[1]);node.id=match[3];node.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]||'';node.disabled=/\bdisabled\b/.test(match[2]);
        if(match[1]==='select'){
          const rest=this.html.slice(match.index+match[0].length).split('</select>')[0];
          node.value=/<option value="([^"]+)"\s+selected/.exec(rest)?.[1]||/<option value="([^"]+)"/.exec(rest)?.[1]||'';
        }
        elements.set(node.id,node);
      }
    }
    get innerHTML(){return this.html||''}
    querySelector(selector){return selector.startsWith('#')?elements.get(selector.slice(1))||null:null}
    querySelectorAll(){return []}
    addEventListener(){}
    focus(){}
    remove(){if(this.id)elements.delete(this.id)}
  }
  const workspace={business:{id:BUSINESS,business_type:'clinic',country_code:country,timezone:countries[country]},branch_scope:{mode:'all'},appointments:[{id:APPOINTMENT,business_id:BUSINESS,customer_id:CUSTOMER,starts_at:startsAt,ends_at:'2030-01-15T07:00:00.000Z',status:'confirmed',simulated:false}],customers:[{id:CUSTOMER,display_name:'عميل الاختبار'}]};
  const document={documentElement:{lang:language},head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),querySelector:selector=>selector.startsWith('#')?elements.get(selector.slice(1))||null:null,addEventListener(){}};
  const window={addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn)},dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event)},confirm:()=>true};
  const browserIntl={...Intl,DateTimeFormat:new Proxy(Intl.DateTimeFormat,{construct(target,[locales,options={}]){return new target(locales,{timeZone:deviceTimezone,...options})}})};
  const sandbox={window,document,workspace,Intl:browserIntl,Date,URLSearchParams,Event,CustomEvent,localStorage:{getItem:()=>null},MutationObserver:class{observe(){}},setTimeout:()=>0,setInterval:()=>0,toast:message=>toasts.push(message),fetch:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,options,body});
    if(fetchImpl)return fetchImpl(url,options,body);
    return {ok:true,json:async()=>({ok:true,appointment:{...workspace.appointments[0],...body,starts_at:body.starts_at||workspace.appointments[0].starts_at}})};
  }};
  vm.createContext(sandbox);vm.runInContext(generatedClient,sandbox);
  return {window,workspace,elements,calls,toasts,document,Element,open:()=>window.__dabbirAppointmentManagement.open(APPOINTMENT),save:()=>elements.get('dabbirApptEditForm').onsubmit({preventDefault(){},submitter:{disabled:false}})};
}

for(const [country,timezone] of Object.entries(countries)){
  test(`the ${country} owner edits business-local time independently of the phone timezone`,async()=>{
    const f=fixture({country});f.open();
    const expected=country==='AE'||country==='OM'?'2030-01-15T10:00':'2030-01-15T09:00';
    assert.equal(f.elements.get('dabbirApptEditTime').value,expected,timezone);
    f.elements.get('dabbirApptEditTime').value='2030-01-15T11:30';
    await f.save();
    assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].body.starts_at,country==='AE'||country==='OM'?'2030-01-15T07:30:00.000Z':'2030-01-15T08:30:00.000Z');
    assert.equal(f.calls[0].body.business_id,BUSINESS);
    assert.equal(f.calls[0].body.appointment_id,APPOINTMENT);
    assert.equal(f.workspace.appointments[0].starts_at,f.calls[0].body.starts_at);
  });
}

test('changing only booking status preserves a timestamp with seconds and does not reschedule the appointment',async()=>{
  const original='2030-01-15T06:00:37.125Z',f=fixture({country:'AE',startsAt:original});f.open();
  f.elements.get('dabbirApptEditStatus').value='completed';
  await f.save();
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].body.status,'completed');
  assert.equal(Object.hasOwn(f.calls[0].body,'starts_at'),false);
  assert.equal(f.workspace.appointments[0].starts_at,original);
});

test('calendar appointment times use the business zone rather than the traveling owner phone zone',()=>{
  const f=fixture({country:'SA',deviceTimezone:'Pacific/Honolulu'});
  const screen=new f.Element('section');screen.id='screen-appointments';f.document.body.append(screen);
  const lifecycle=f.window.__dabbirBookingLifecycle,reader=f.window.__dabbirBookingReader;
  lifecycle.setView(f.workspace,{view:'day',day:'2030-01-15',followToday:false});
  Object.assign(reader.entry(f.workspace),{ready:true,rows:f.workspace.appointments,total:1});
  f.window.__dabbirAppointmentManagement.render();
  const calendar=f.elements.get('dabbirGenericCalendar').innerHTML;
  const expected=new Intl.DateTimeFormat('en-AE',{timeZone:'Asia/Riyadh',hour:'numeric',minute:'2-digit'}).format(new Date(f.workspace.appointments[0].starts_at));
  assert.ok(calendar.includes('class="dabbirGenericTimelineTime">'+expected+'</div>'));
  assert.ok(calendar.includes('data-calendar-appt="'+APPOINTMENT+'"'));
});

test('iPhone-safe mutation request retains the explicit same-origin client header',async()=>{
  const f=fixture();f.open();f.elements.get('dabbirApptEditStatus').value='arrived';await f.save();
  assert.equal(f.calls[0].options.headers['x-dabbir-client'],'web');
  assert.equal(f.calls[0].options.credentials,'same-origin');
});

test('double submit sends one mutation and a changed business context prevents the stale edit',async()=>{
  let resolve;
  const pending=new Promise(done=>resolve=done);
  const f=fixture({fetchImpl:()=>pending});f.open();f.elements.get('dabbirApptEditStatus').value='arrived';
  const first=f.save();await f.save();assert.equal(f.calls.length,1);
  resolve({ok:true,json:async()=>({ok:true,appointment:{...f.workspace.appointments[0],status:'arrived'}})});await first;
  f.open();f.workspace.business={...f.workspace.business,id:'10000000-0000-4000-8000-000000000002'};
  await f.save();assert.equal(f.calls.length,1);
});
