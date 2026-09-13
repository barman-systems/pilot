import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import activationUi from '../api/customer-activation-ui.js';

function harness({language='ar',type='services',role='owner',customers=0,verified=true,disabled=false}={}){
  let source='';
  activationUi({method:'GET'},{setHeader(){},end(value){source=value}});
  let panel,opened=0;
  const next={},retry={},calls=[],navigation=[];
  const appointment={disabled,click(){opened++}};
  const context=vm.createContext({
    window:{__dabbirUxFoundationV1:true},
    workspace:{business:{id:'A',business_type:type},membership:{role},ai:{configured:false},verified_metrics:{state:verified?'VERIFIED_EXACT_COUNTS':'UNAVAILABLE',customers,active_chats:0,ai_messages:0}},
    document:{
      documentElement:{lang:language},head:{append(){}},
      createElement:()=>({dataset:{},innerHTML:'',querySelectorAll:()=>[]}),
      querySelector:selector=>{
        if(selector==='#screen-dashboard')return {querySelector:()=>null,prepend(node){panel=node}};
        if(selector==='#dabbirActivation')return panel||null;
        if(selector==='#newApptBtn')return appointment;
        if(selector==='#daNextAction'&&panel?.innerHTML.includes('id="daNextAction"'))return next;
        if(selector==='#daRetry'&&panel?.innerHTML.includes('id="daRetry"'))return retry;
        return null;
      },
    },
    renderDashboard(){},renderAll(){},showScreen:name=>navigation.push(name),
    fetch:(url,options)=>new Promise(resolve=>{calls.push({url,options,resolve})}),
    setTimeout:()=>1,
  });
  vm.runInContext(source,context);
  return {
    context,calls,navigation,next,appointment,
    refresh:()=>context.window.__dabbirCustomerActivation.refresh(),
    render:()=>context.renderDashboard(),
    get html(){return panel?.innerHTML||''},
    get opened(){return opened},
    complete({profileStatus=200,whatsappStatus=200,ready=false}={}){
      const profile=ready?{facts:{about_business:'Known business',business_hours:'Sunday 9-17',contact_email:'test@example.invalid'}}:{facts:{}};
      const whatsapp=ready?{operational:true,state:'OPERATIONAL'}:{operational:false,state:'NOT_CONNECTED'};
      for(const [index,status,payload] of [[0,profileStatus,profile],[1,whatsappStatus,whatsapp]])calls[index].resolve(new Response(JSON.stringify({ok:status===200,...payload}),{status}));
    },
  };
}

for(const language of ['ar','en']){
  test(`${language}: the first owner appointment does not require WhatsApp, AI or full business setup`,async()=>{
    const ui=harness({language});
    const reading=ui.refresh();
    assert.match(ui.html,language==='ar'?/سجّل أول موعد/:/Record your first appointment/);
    assert.equal(ui.html.includes('100%'),false);
    ui.complete();await reading;
    assert.match(ui.html,language==='ar'?/إضافة أول موعد/:/Add first appointment/);
    assert.match(ui.html,language==='ar'?/ربط واتساب لاحقًا/:/connect WhatsApp later/);
    ui.next.onclick();
    assert.deepEqual(ui.navigation,['appointments']);
    assert.equal(ui.opened,1,'the existing appointment control opens in the same owner action');
    assert.equal(ui.calls.length,2);
    assert.ok(ui.calls.every(call=>!call.options.method||call.options.method==='GET'),'opening the form must not save or message anyone');
  });
}

test('WhatsApp status failure cannot block a manual first appointment or fabricate readiness',async()=>{
  const ui=harness();
  const reading=ui.refresh();ui.complete({whatsappStatus:503});await reading;
  assert.match(ui.html,/تعذر التحقق من إعداد هذا النشاط/);
  assert.match(ui.html,/id="daRetry"/);
  assert.equal(ui.html.includes('daProgress'),false);
  ui.next.onclick();
  assert.equal(ui.opened,1);
});

test('unknown customer counts are not treated as an empty account',async()=>{
  const ui=harness({verified:false});
  const reading=ui.refresh();ui.complete();await reading;
  assert.equal(ui.html.includes('إضافة أول موعد'),false);
  assert.match(ui.html,/أكمل معلومات نشاطك/);
});

test('an owner with historical customers is never asked to create another first chat when active chats are zero',async()=>{
  const ui=harness({customers:1});
  ui.context.workspace.ai.configured=true;
  const reading=ui.refresh();ui.complete({ready:true});await reading;
  assert.equal(ui.html.includes('إضافة أول موعد'),false);
  assert.equal(ui.html.includes('جرّب أول محادثة'),false);
  assert.match(ui.html,/راجع أولويات اليوم/);
  ui.next.onclick();
  assert.deepEqual(ui.navigation,['dashboard']);
});

for(const type of ['salon','car_wash','store','laundry']){
  test(`${type}: specialized setup keeps its existing journey instead of opening the generic appointment form`,async()=>{
    const ui=harness({type});
    const reading=ui.refresh();ui.complete();await reading;
    assert.equal(ui.html.includes('إضافة أول موعد'),false);
    assert.match(ui.html,/أكمل معلومات نشاطك/);
  });
}

test('employee roles do not receive the owner activation shortcut',async()=>{
  const ui=harness({role:'employee'});
  const reading=ui.refresh();ui.complete();await reading;
  assert.equal(ui.html.includes('إضافة أول موعد'),false);
});

test('a disabled appointment control cannot become an enabled activation shortcut',async()=>{
  const ui=harness({disabled:true});
  const reading=ui.refresh();ui.complete();await reading;
  assert.equal(ui.html.includes('إضافة أول موعد'),false);
});

test('an activation action retained from another business cannot open a form in the new business',async()=>{
  const ui=harness();
  const reading=ui.refresh();ui.complete();await reading;
  const stale=ui.next.onclick;
  ui.context.workspace.business.id='B';
  stale();
  assert.equal(ui.opened,0);
  assert.deepEqual(ui.navigation,[]);
});

test('the first appointment prompt disappears after verified customer data arrives',async()=>{
  const ui=harness();
  const reading=ui.refresh();ui.complete();await reading;
  assert.match(ui.html,/إضافة أول موعد/);
  ui.context.workspace.verified_metrics.customers=1;
  ui.render();
  assert.equal(ui.html.includes('إضافة أول موعد'),false);
});
