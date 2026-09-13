import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/owner-action-center-core-ui.js';

function browser() {
  const nodes=new Map(),hooks=new Map(),requests=[],notices=[],routes=[];
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.attributes={};this.hidden=false;this._text='';}
    set id(value){this._id=value;nodes.set('#'+value,this)}
    get id(){return this._id}
    set textContent(value){this._text=String(value);this.children=[]}
    get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('')}
    set innerHTML(value){for(const match of String(value).matchAll(/<([a-z]+)[^>]*id="([^"]+)"[^>]*>/g)){const child=new Element(match[1]);child.id=match[2];this.append(child)}}
    append(...children){for(const child of children){this.children.push(child);child.parentNode=this}}
    prepend(child){this.children.unshift(child);child.parentNode=this}
    insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child);child.parentNode=this}
    replaceChildren(...children){this.children=[];this._text='';this.append(...children)}
    querySelector(selector){return nodes.get(selector)||null}
    addEventListener(name,fn){this.listeners[name]=fn}
    setAttribute(name,value){this.attributes[name]=String(value)}
    async click(){return this.listeners.click?.()}
  }
  const dash=new Element('section');dash.id='screen-dashboard';
  const cards=new Element();cards.id='dashCards';dash.append(cards);
  const workspace=business=>({business:{id:business,business_type:'salon',timezone:'Asia/Dubai'},user:{id:'owner'},branch_scope:{mode:'all'},conversations:[{id:'previous',business_id:business}],selected_conversation_id:'previous'});
  const context={document:{head:new Element('head'),createElement:tag=>new Element(tag),querySelector:selector=>nodes.get(selector)||null},workspace:workspace('A'),lang:'ar',current:'dashboard',selectedConversationId:'previous',URLSearchParams,Intl,Date,console:{error(){}},setTimeout,clearTimeout,renderDashboard(){},renderAll(){},toast:value=>notices.push(value),showScreen:name=>{context.current=name;routes.push(name)},fetch:(url)=>new Promise(resolve=>requests.push({url,resolve})),__dabbirUiLifecycle:{on:(event,id,fn)=>hooks.set(event+':'+id,fn)}};
  context.window=context;
  const response={status(){return this},setHeader(){return this},send(value){this.body=value;return this}};
  handler({method:'GET'},response);vm.runInNewContext(response.body,context);
  const complete=(request,data,ok=true)=>request.resolve({ok,status:ok?200:503,json:async()=>data});
  return {context,nodes,requests,notices,routes,workspace,complete,center:context.__dabbirOwnerActionCenter,hooks};
}

function priorities(business='A',count=12,handled=7) {
  return {ok:true,business_id:business,branch_scope:{mode:'all',branch_id:null},status:'needs_attention',handled:{available:handled!==null,verified_autonomous_today:handled},metrics:{urgent:count,warning:0},brief:{ar:'أولويات '+business,en:'Priorities '+business},items:Array.from({length:count},(_,i)=>({id:'conversation:'+business+i,type:'conversation',target:'conversations',entity_id:business+i,title_ar:'عميل '+business+i,title_en:'Customer '+business+i,severity:'critical',due_at:'2026-09-08T08:00:00Z'}))};
}

test('owner expands every priority beyond eight and keeps verified DABBIR work visible',async()=>{
  const b=browser(),p=b.center.refresh();b.complete(b.requests[0],priorities());await p;
  assert.equal(b.nodes.get('#dacItems').children.length,3);
  assert.match(b.nodes.get('#dacMetrics').textContent,/7عالجها/);
  assert.equal(b.nodes.get('#dacMoreWrap').hidden,false);
  await b.nodes.get('#dacMore').click();
  assert.equal(b.nodes.get('#dacItems').children.length,12);
  assert.equal(b.nodes.get('#dacMore').attributes['aria-expanded'],'true');
  await b.nodes.get('#dacMore').click();
  assert.equal(b.nodes.get('#dacItems').children.length,3);
});

test('unverified handled count stays unknown, and same-ID updated facts re-render',async()=>{
  const b=browser();let p=b.center.refresh();b.complete(b.requests[0],priorities('A',4,null));await p;
  assert.match(b.nodes.get('#dacMetrics').textContent,/—عالجها/);
  const data=priorities('A',4,9);data.items[0].title_ar='اسم جديد';data.items[0].detail_ar='تفاصيل جديدة';
  p=b.center.refresh();b.complete(b.requests[1],data);await p;
  assert.match(b.nodes.get('#dacItems').textContent,/اسم جديدتفاصيل جديدة/);
  assert.match(b.nodes.get('#dacMetrics').textContent,/9عالجها/);
});

test('activity adaptation hides unrelated work without replacing verified DABBIR impact',async()=>{
  const b=browser(),data=priorities('A',1,8);data.items[0].type='appointment';
  data.items.push({...data.items[0],id:'stock:1',type:'inventory',title_ar:'مخزون'});
  b.context.workspace.business.business_type='store';let p=b.center.refresh();b.complete(b.requests[0],data);await p;
  assert.equal(b.nodes.get('#dacItems').children.length,1);
  assert.match(b.nodes.get('#dacItems').textContent,/مخزون/);
  assert.match(b.nodes.get('#dacMetrics').textContent,/8عالجها/);
  b.context.workspace.business.business_type='salon';p=b.center.refresh();b.complete(b.requests[1],data);await p;
  assert.equal(b.nodes.get('#dacItems').children.length,1);
  assert.doesNotMatch(b.nodes.get('#dacItems').textContent,/مخزون/);
});

test('switching businesses starts the new read immediately and ignores older success',async()=>{
  const b=browser(),a=b.center.refresh();b.context.workspace=b.workspace('B');const next=b.center.refresh();
  assert.equal(b.requests.length,2);
  assert.equal(b.nodes.get('#dacItems').children.length,0);
  b.complete(b.requests[1],priorities('B'));await next;b.complete(b.requests[0],priorities('A'));await a;
  assert.equal(b.nodes.get('#dabbirActionCenter').dataset.businessId,'B');
  assert.match(b.nodes.get('#dacItems').textContent,/عميل B/);
  assert.doesNotMatch(b.nodes.get('#dacItems').textContent,/عميل A/);
  assert.equal(b.context.workspace.owner_action_center.business_id,'B');
});

test('a stale failure cannot erase the active business success',async()=>{
  const b=browser(),a=b.center.refresh();b.context.workspace=b.workspace('B');const next=b.center.refresh();
  b.complete(b.requests[1],priorities('B'));await next;b.complete(b.requests[0],{ok:false,error:'OLD_ERROR'},false);await a;
  assert.equal(b.nodes.get('#dabbirActionCenter').dataset.state,'needs_attention');
  assert.match(b.nodes.get('#dacItems').textContent,/عميل B/);
});

test('failed refresh removes stale green success and can be retried',async()=>{
  const b=browser();let p=b.center.refresh();b.complete(b.requests[0],priorities('A',0));await p;
  p=b.center.refresh();b.complete(b.requests[1],{ok:false,error:'FAILED'},false);await p;
  assert.equal(b.nodes.get('#dabbirActionCenter').dataset.state,'error');
  assert.equal(b.nodes.get('#dacItems').children.length,0);
  assert.equal(b.context.workspace.owner_action_center,undefined);
  p=b.center.refresh();b.complete(b.requests[2],priorities('A',2));await p;
  assert.equal(b.nodes.get('#dacItems').children.length,2);
});

test('priority opens the requested conversation after an exact scoped read',async()=>{
  const b=browser();const item=priorities().items[0];let query;
  b.context.api=async url=>{query=url;return {r:{ok:true},j:{...b.workspace('A'),ok:true,selected_conversation_id:item.entity_id,conversations:[{id:item.entity_id,business_id:'A'}],messages:[]}}};
  assert.equal(await b.center.open(item,'A'),true);
  assert.match(query,/business_id=A&conversation_id=A0/);
  assert.equal(b.context.selectedConversationId,'A0');
  assert.deepEqual(b.routes,['conversations']);
});

test('missing or wrong conversation never opens the previously selected customer',async()=>{
  const b=browser();const item=priorities().items[0];
  b.context.api=async()=>({r:{ok:true},j:{...b.workspace('A'),ok:true}});
  assert.equal(await b.center.open(item,'A'),false);
  assert.equal(b.context.selectedConversationId,'previous');
  assert.deepEqual(b.routes,[]);
  assert.equal(b.notices.length,1);
});

test('conversation response after a business switch cannot restore the old workspace',async()=>{
  const b=browser();let resolve;b.context.api=()=>new Promise(done=>{resolve=done});
  const opening=b.center.open(priorities().items[0],'A');b.context.workspace=b.workspace('B');
  resolve({r:{ok:true},j:{...b.workspace('A'),ok:true,selected_conversation_id:'A0',conversations:[{id:'A0',business_id:'A'}]}});
  assert.equal(await opening,false);assert.equal(b.context.workspace.business.id,'B');assert.deepEqual(b.routes,[]);
});

test('two rapid priority clicks show the latest requested customer even when responses reverse',async()=>{
  const b=browser(),pending=[];b.context.api=()=>new Promise(done=>pending.push(done));
  const items=priorities().items,first=b.center.open(items[0],'A'),second=b.center.open(items[1],'A');
  const result=id=>({r:{ok:true},j:{...b.workspace('A'),ok:true,selected_conversation_id:id,conversations:[{id,business_id:'A'}]}});
  pending[1](result('A1'));await second;pending[0](result('A0'));await first;
  assert.equal(b.context.selectedConversationId,'A1');assert.deepEqual(b.routes,['conversations']);
});

test('an appointment outside the current business scope never opens an editor',async()=>{
  const b=browser();let opened=0;
  b.context.__dabbirBookingReader={find:()=>({id:'booking',business_id:'B'})};
  b.context.__dabbirBookingLifecycle={inContext:()=>false};
  b.context.__dabbirAppointmentManagement={open:()=>{opened++}};
  assert.equal(await b.center.open({type:'appointment',entity_id:'booking'},'A'),false);
  assert.equal(opened,0);assert.deepEqual(b.routes,[]);
});

test('appointment priority opens its scoped editor directly',async()=>{
  const b=browser();const opened=[];
  b.context.__dabbirBookingReader={find:()=>({id:'booking',business_id:'A'})};
  b.context.__dabbirBookingLifecycle={inContext:()=>true};
  b.context.__dabbirAppointmentManagement={open:id=>opened.push(id)};
  assert.equal(await b.center.open({type:'appointment',entity_id:'booking'},'A'),true);
  assert.deepEqual(opened,['booking']);assert.deepEqual(b.routes,['appointments']);
});

test('the same business under a different owner session cannot accept old priority data',async()=>{
  const b=browser(),old=b.center.refresh();b.context.workspace.user.id='different-owner';
  const next=b.center.refresh();assert.equal(b.requests.length,2);
  b.complete(b.requests[0],priorities());await old;
  assert.equal(b.nodes.get('#dacItems').children.length,0);
  b.complete(b.requests[1],priorities('A',1));await next;
  assert.equal(b.nodes.get('#dacItems').children.length,1);
});

test('branch changes request the selected branch and reject a late response from the previous branch',async()=>{
  const b=browser();
  const scope=id=>({mode:'selected',branch_id:id});
  b.context.workspace.branch_scope=scope('first');
  const first=b.center.refresh();
  assert.match(b.requests[0].url,/branch_id=first/);
  b.context.workspace.branch_scope=scope('second');
  const second=b.center.refresh();
  assert.match(b.requests[1].url,/branch_id=second/);
  const data={...priorities('A',1),branch_scope:scope('second')};
  data.items[0].title_ar='عميل الفرع الثاني';data.items[0].scope='business';
  b.complete(b.requests[1],data);await second;
  b.complete(b.requests[0],{...priorities(),branch_scope:scope('first')});await first;
  assert.match(b.nodes.get('#dacItems').textContent,/عميل الفرع الثاني/);
  assert.match(b.nodes.get('#dacItems').textContent,/على مستوى النشاط/);
  assert.match(b.nodes.get('#dacMetrics').textContent,/في النشاط/);
});

test('wrong or missing branch scope is an error, never a cacheable dashboard',async()=>{
  for(const branch_scope of [undefined,{mode:'all',branch_id:null},{mode:'selected',branch_id:'wrong'}]){
    const b=browser();b.context.workspace.branch_scope={mode:'selected',branch_id:'expected'};
    const pending=b.center.refresh();b.complete(b.requests[0],{...priorities(),branch_scope});await pending;
    assert.equal(b.nodes.get('#dabbirActionCenter').dataset.state,'error');
    assert.equal(b.context.workspace.owner_action_center,undefined);
    assert.equal(b.nodes.get('#dacMetrics').children.length,0);
  }
});

test('an old unresolved appointment loads its review day and opens the exact editor',async()=>{
  const b=browser();let view,loaded=false;const opened=[];
  b.context.__dabbirBookingReader={find:()=>loaded?{id:'old',business_id:'A'}:null,ensureRecord:async(w,id)=>{assert.equal(id,'old');assert.equal(view.scope,'review');assert.equal(view.followToday,false);loaded=true}};
  b.context.__dabbirBookingLifecycle={dayKey:()=> '2026-09-01',setView:(w,next)=>{view=next},inContext:()=>true};
  b.context.__dabbirAppointmentManagement={open:id=>opened.push(id)};
  assert.equal(await b.center.open({type:'appointment',entity_id:'old',due_at:'2026-09-01T08:00:00Z',lifecycle_scope:'review'},'A'),true);
  assert.equal(view.day,'2026-09-01');assert.deepEqual(opened,['old']);
});

test('conversation drill-down validates the selected branch in both query and response',async()=>{
  const b=browser();b.context.workspace.branch_scope={mode:'selected',branch_id:'branch'};
  let query;
  b.context.api=async url=>{query=url;return {r:{ok:true},j:{...b.workspace('A'),ok:true,branch_scope:{mode:'selected',branch_id:'wrong'},selected_conversation_id:'A0',conversations:[{id:'A0',business_id:'A',branch_id:'wrong'}]}}};
  assert.equal(await b.center.open(priorities().items[0],'A'),false);
  assert.match(query,/branch_id=branch/);assert.deepEqual(b.routes,[]);
});
