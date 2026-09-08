import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import handler from '../api/timezone-ui.js';

let script = '';
handler({method:'GET'}, {setHeader(){}, end(value){script=value;}});
const success = () => ({ok:true, json:async()=>({ok:true, appointment:{id:'saved-appointment'}})});
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sharedRuntime=read('index.html').split('\n').find(line=>line.startsWith('async function loadRuntime('));
const workspaceWrapper=read('api/business-workspaces-ui.js').split('\n').find(line=>line.includes('function patchRuntime()'));
const activationWrapper=read('api/customer-activation-ui.js').split('\n').find(line=>line.includes('const base=loadRuntime;loadRuntime=async function'));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// Execute the served capture listener; the legacy onsubmit must never receive it.
// All fetches are isolated, so this exercises no booking or customer mutations.
function harness({respond=async()=>success(),language='ar',buttonPresent=true,load=async()=>{},branchScope=null,realRuntime=false}={}){
  const requests=[],toasts=[],listeners=[],attributes=new Map();
  const stats={legacySubmits:0,resets:0,runtimeLoads:0,renders:0,gates:[],busy:[],loadErrors:0};
  const button={disabled:false,textContent:language==='ar'?'حفظ':'Save'};
  const customer={value:'Synthetic customer'},time={value:'2026-09-09T14:30'};
  const fields=[{dataset:{apptKey:'phone'},value:'+971500000000'},{dataset:{apptKey:'duration'},value:'45'}];
  const classes=new Set(['open']);
  const observers=[];
  const notifyClass=()=>observers.filter(observer=>observer.target===modal).forEach(observer=>observer.pending.push({type:'attributes',attributeName:'class'}));
  const modal={classList:{contains:value=>classes.has(value),remove(value){classes.delete(value);notifyClass();},add(value){classes.add(value);notifyClass();}}};
  const form={dataset:{},querySelector:()=>null,querySelectorAll:()=>fields,
    setAttribute:(name,value)=>attributes.set(name,String(value)),getAttribute:name=>attributes.get(name)??null,removeAttribute:name=>attributes.delete(name),
    addEventListener:(name,callback,capture)=>listeners.push({name,callback,capture}),
    reset(){stats.resets++;customer.value='';time.value='';},
    onsubmit(){stats.legacySubmits++;button.disabled=true;}
  };
  const nodes={'#appointmentForm':form,'#appointmentModal':modal,'#apptTime':time,'#apptCustomer':customer,'#saveApptBtn':buttonPresent?button:null};
  const context={document:{documentElement:{lang:language,dataset:{}},querySelector:selector=>nodes[selector]??null,querySelectorAll:()=>[],addEventListener(){}},
    workspace:{user:{id:'owner-a'},business:{id:'business-a',business_type:'salon',timezone:'Asia/Dubai',country_code:'AE',currency_code:'AED'}},selectedConversationId:null,
    Intl,Date,URLSearchParams,crypto:webcrypto,dabbirBranchContext:{scope:()=>branchScope},MutationObserver:class{constructor(callback){this.callback=callback;this.pending=[];observers.push(this);}observe(target){this.target=target;}takeRecords(){return this.pending.splice(0);}},setTimeout(){},requestAnimationFrame(){},
    toast:value=>toasts.push(value),T:()=>({saved:language==='ar'?'تم الحفظ':'Saved',invalid:language==='ar'?'تعذر الحفظ':'Save failed',savingWorking:language==='ar'?'جارٍ الحفظ…':'Saving…'}),
    fetch:(url,options)=>{requests.push({url,headers:options.headers,body:JSON.parse(options.body)});return respond();},
    loadRuntime:async(...args)=>{stats.runtimeLoads++;return load(...args);},
    api:async(...args)=>{stats.runtimeLoads++;return load(...args);},
    showGate:value=>stats.gates.push(value),renderAll:()=>{stats.renders++;},
    activeId:()=>context.workspace?.business?.id,localStorage:{setItem(){}},renderSwitch(){},renderPortfolio(){},
    setBusy:value=>stats.busy.push(value),trackUx:()=>{stats.loadErrors++;},t:()=>({loadError:'Load failed'})
  };
  context.window=context;
  if(realRuntime){
    vm.runInNewContext(sharedRuntime,context);
    vm.runInNewContext(workspaceWrapper+';patchRuntime();',context);
    vm.runInNewContext(activationWrapper,context);
  }
  vm.runInNewContext(script,context);
  const submit=()=>{
    const event={prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
    const pending=[];
    for(const listener of listeners.filter(item=>item.name==='submit'&&item.capture)){
      pending.push(listener.callback(event));if(event.stopped)break;
    }
    if(!event.stopped)pending.push(form.onsubmit(event));
    assert.equal(event.prevented,true);assert.equal(event.stopped,true);
    return Promise.all(pending);
  };
  const inputEvent=()=>listeners.filter(listener=>listener.name==='input').forEach(listener=>listener.callback({}));
  return {requests,toasts,stats,button,form,modal,customer,time,submit,context,inputEvent};
}

test('two rapid submits dispatch one booking request and expose a busy save button',async()=>{
  const pending=deferred(),h=harness({respond:()=>pending.promise});
  const first=h.submit(),second=h.submit();
  try{
    assert.equal(h.requests.length,1);
    assert.equal(h.button.disabled,true);assert.equal(h.button.textContent,'جارٍ الحفظ…');
    assert.equal(h.form.getAttribute('aria-busy'),'true');
    assert.equal(h.stats.resets,0);assert.equal(h.stats.legacySubmits,0);
  }finally{pending.resolve(success());await Promise.all([first,second]);}
  assert.equal(h.button.disabled,false);assert.equal(h.button.textContent,'حفظ');
  assert.equal(h.form.getAttribute('aria-busy'),null);
  assert.equal(h.stats.resets,1);assert.equal(h.stats.runtimeLoads,1);
  assert.deepEqual(h.toasts,['تم الحفظ']);
  assert.equal(h.requests[0].url,'/api/adaptive-appointment');
  const {idempotency_key,...booking}=h.requests[0].body;
  assert.match(idempotency_key,/^[0-9a-f-]{36}$/);
  assert.equal(h.requests[0].headers['x-dabbir-client'],'web');
  assert.deepEqual(booking,{business_id:'business-a',branch_id:null,business_type:'salon',customer_name:'Synthetic customer',starts_at:'2026-09-09T10:30:00.000Z',details:{phone:'+971500000000',duration:'45'}});
});

test('a rejected request preserves inputs and unlocks an explicit retry',async()=>{
  let calls=0;
  const h=harness({respond:async()=>++calls===1?{ok:false,json:async()=>({ok:false,error:'APPOINTMENT_INPUT_REQUIRED'})}:success()});
  await h.submit();
  assert.equal(h.button.disabled,false);assert.equal(h.button.textContent,'حفظ');
  assert.equal(h.form.getAttribute('aria-busy'),null);assert.equal(h.stats.resets,0);
  assert.equal(h.customer.value,'Synthetic customer');assert.equal(h.modal.classList.contains('open'),true);
  assert.equal(h.toasts.includes('تم الحفظ'),false);assert.equal(h.stats.runtimeLoads,0);
  await h.submit();assert.equal(h.requests.length,2);assert.equal(h.stats.resets,1);
});

test('a network failure is not a successful save and the owner can retry explicitly',async()=>{
  let calls=0;
  const h=harness({respond:async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return success();}});
  await h.submit();
  assert.equal(h.button.disabled,false);assert.equal(h.button.textContent,'حفظ');
  assert.equal(h.form.getAttribute('aria-busy'),null);assert.equal(h.stats.resets,0);
  assert.equal(h.modal.classList.contains('open'),true);assert.equal(h.time.value,'2026-09-09T14:30');
  assert.deepEqual(h.toasts,['تعذر تأكيد حفظ الموعد. حاول مجددًا من النموذج نفسه.']);assert.equal(h.requests.length,1);
  await h.submit();assert.equal(h.requests.length,2);assert.equal(h.stats.resets,1);
  assert.equal(h.requests[0].body.idempotency_key,h.requests[1].body.idempotency_key);
});

test('invalid JSON never claims success and releases the pending state',async()=>{
  const h=harness({respond:async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid JSON');}})});
  await h.submit();assert.equal(h.stats.resets,0);assert.equal(h.stats.runtimeLoads,0);
  assert.equal(h.button.disabled,false);assert.equal(h.form.getAttribute('aria-busy'),null);
  assert.equal(h.modal.classList.contains('open'),true);assert.deepEqual(h.toasts,['تعذر تأكيد حفظ الموعد. حاول مجددًا من النموذج نفسه.']);
});

test('keyboard submission is guarded even if a submit button cannot be found',async()=>{
  const pending=deferred(),h=harness({buttonPresent:false,respond:()=>pending.promise});
  const first=h.submit(),second=h.submit();
  try{assert.equal(h.requests.length,1);assert.equal(h.form.getAttribute('aria-busy'),'true');}
  finally{pending.resolve(success());await Promise.all([first,second]);}
  assert.equal(h.stats.resets,1);assert.equal(h.form.getAttribute('aria-busy'),null);
});

test('local validation does not lock the form or prevent a corrected time',async()=>{
  const h=harness();h.time.value='invalid';await h.submit();
  assert.equal(h.requests.length,0);assert.equal(h.button.disabled,false);
  h.time.value='2026-09-09T14:30';await h.submit();assert.equal(h.requests.length,1);
});

test('the lock lasts through runtime refresh and releases when that refresh fails',async()=>{
  const pending=deferred(),h=harness({load:()=>pending.promise});
  const first=h.submit();await new Promise(resolve=>setImmediate(resolve));
  h.customer.value='Another synthetic customer';h.time.value='2026-09-10T14:30';
  const second=h.submit();
  try{assert.equal(h.requests.length,1);assert.equal(h.button.disabled,true);}
  finally{pending.reject(new Error('RUNTIME_REFRESH_FAILED'));await Promise.all([first,second]);}
  assert.equal(h.button.disabled,false);assert.equal(h.form.getAttribute('aria-busy'),null);
  assert.equal(h.toasts.includes('تعذر الحفظ'),false);
  assert.deepEqual(h.toasts,['تم الحفظ']);
  assert.equal(h.customer.value,'Another synthetic customer');
});

test('English busy feedback restores the original control state',async()=>{
  const pending=deferred(),h=harness({language:'en',respond:()=>pending.promise});
  h.form.setAttribute('aria-busy','false');const first=h.submit();
  try{assert.equal(h.button.disabled,true);assert.equal(h.button.textContent,'Saving…');}
  finally{pending.resolve(success());await first;}
  assert.equal(h.button.textContent,'Save');assert.equal(h.button.disabled,false);
  assert.equal(h.form.getAttribute('aria-busy'),'false');
});

test('the selected branch is sent explicitly and never replaced by the primary branch',async()=>{
  const h=harness({branchScope:{business_id:'business-a',mode:'selected',branch_id:'selected-branch'}});
  await h.submit();assert.equal(h.requests[0].body.branch_id,'selected-branch');
});

test('a branch context for another business cannot dispatch a booking',async()=>{
  const h=harness({branchScope:{business_id:'business-b',mode:'selected',branch_id:'foreign-branch'}});
  await h.submit();assert.equal(h.requests.length,0);assert.equal(h.button.disabled,false);
  assert.match(h.toasts[0],/تغيّر النشاط/);
});

test('different details get their own key and restoring an unknown intent keeps its old key',async()=>{
  const h=harness({respond:async()=>{throw new TypeError('lost response');}});
  await h.submit();h.time.value='2026-09-10T14:30';await h.submit();h.time.value='2026-09-09T14:30';await h.submit();
  const keys=h.requests.map(request=>request.body.idempotency_key);
  assert.notEqual(keys[0],keys[1]);assert.equal(keys[0],keys[2]);
});

test('a confirmed save releases its intent so a new form can create a separate booking',async()=>{
  const h=harness();await h.submit();h.customer.value='Synthetic customer';h.time.value='2026-09-09T14:30';await h.submit();
  assert.notEqual(h.requests[0].body.idempotency_key,h.requests[1].body.idempotency_key);
});

test('owner-facing errors use localized messages and never raw diagnostics',async()=>{
  for(const language of ['ar','en']){
    const h=harness({language,respond:async()=>({ok:false,json:async()=>({ok:false,error:'private stack detail',message_ar:'اختر فرعًا محددًا.',message_en:'Select a branch.'})})});
    await h.submit();assert.deepEqual(h.toasts,[language==='ar'?'اختر فرعًا محددًا.':'Select a branch.']);
  }
  const h=harness({respond:async()=>({ok:false,json:async()=>({ok:false,error:'private stack detail'})})});
  await h.submit();assert.doesNotMatch(h.toasts.join(' '),/private stack/);
});

test('an incomplete success response preserves the retry intent and input',async()=>{
  let calls=0;const h=harness({respond:async()=>++calls===1?{ok:true,json:async()=>({ok:true})}:success()});
  await h.submit();assert.equal(h.stats.resets,0);assert.equal(h.modal.classList.contains('open'),true);
  await h.submit();assert.equal(h.requests[0].body.idempotency_key,h.requests[1].body.idempotency_key);
});

for(const changed of ['business','branch','account']){
  test('a late POST cannot reset the form or refresh after changing '+changed,async()=>{
    const pending=deferred(),scope={business_id:'business-a',branch_id:'branch-a',mode:'selected'};
    const h=harness({respond:()=>pending.promise,branchScope:scope});const saving=h.submit();
    if(changed==='business'){h.context.workspace={user:{id:'owner-a'},business:{id:'business-b'}};scope.business_id='business-b';}
    if(changed==='branch')scope.branch_id='branch-b';
    if(changed==='account')h.context.workspace.user.id='owner-b';
    h.customer.value='A newer draft';const active=h.context.workspace;
    pending.resolve(success());await saving;
    assert.equal(h.stats.resets,0);assert.equal(h.stats.runtimeLoads,0);assert.equal(h.context.workspace,active);
    assert.equal(h.customer.value,'A newer draft');assert.equal(h.modal.classList.contains('open'),true);
    assert.equal(h.button.disabled,false);assert.deepEqual(h.toasts,[]);
  });
}

test('late failures cannot show an error for a different active draft',async()=>{
  for(const failure of ['network','http']){
    const pending=deferred(),h=harness({respond:()=>pending.promise});const saving=h.submit();
    h.context.workspace.user.id='owner-b';h.customer.value='New owner draft';
    if(failure==='network')pending.reject(new TypeError('late request failed'));
    else pending.resolve({ok:false,json:async()=>({ok:false,message_ar:'خطأ قديم'})});
    await saving;assert.deepEqual(h.toasts,[]);assert.equal(h.stats.resets,0);assert.equal(h.button.disabled,false);
  }
});

test('another actor receives another intent key even for identical business and form values',async()=>{
  const h=harness({respond:async()=>{throw new TypeError('unknown result');}});
  await h.submit();h.context.workspace.user.id='owner-b';await h.submit();h.context.workspace.user.id='owner-a';await h.submit();
  const keys=h.requests.map(request=>request.body.idempotency_key);
  assert.notEqual(keys[0],keys[1]);assert.equal(keys[0],keys[2]);
});

test('editing inputs during POST preserves the newer draft and its open form',async()=>{
  const pending=deferred(),h=harness({respond:()=>pending.promise});const saving=h.submit();
  h.customer.value='Newer synthetic customer';h.time.value='2026-09-10T14:30';
  pending.resolve(success());await saving;
  assert.equal(h.stats.resets,0);assert.equal(h.stats.runtimeLoads,0);assert.equal(h.customer.value,'Newer synthetic customer');
  assert.equal(h.time.value,'2026-09-10T14:30');assert.equal(h.modal.classList.contains('open'),true);assert.deepEqual(h.toasts,[]);
});

test('closing and reopening the same form cannot let an old response clear it',async()=>{
  const pending=deferred(),h=harness({respond:()=>pending.promise});const saving=h.submit();
  h.modal.classList.remove('open');h.modal.classList.add('open');
  pending.resolve(success());await saving;
  assert.equal(h.stats.resets,0);assert.equal(h.stats.runtimeLoads,0);assert.equal(h.modal.classList.contains('open'),true);
  // Reconciliation of that unchanged draft still uses the successful old key.
  await h.submit();assert.equal(h.requests[0].body.idempotency_key,h.requests[1].body.idempotency_key);
});

test('an input edit followed by restoring its value still protects the newly edited form',async()=>{
  const pending=deferred(),h=harness({respond:()=>pending.promise});const saving=h.submit();
  h.customer.value='Temporary edit';h.inputEvent();h.customer.value='Synthetic customer';h.inputEvent();
  pending.resolve(success());await saving;assert.equal(h.stats.resets,0);assert.equal(h.stats.runtimeLoads,0);
});

test('unchanged draft refresh failures remain understandable as a display error',async()=>{
  const h=harness({load:async()=>{throw new Error('refresh failed');}});await h.submit();
  assert.match(h.toasts.at(-1),/تم حفظ الموعد.*تعذر تحديث/);assert.equal(h.button.disabled,false);
});

for(const outcome of ['success','unauthorized','network']){
  test('shared runtime and both wrappers discard late GET '+outcome+' after a context change',async()=>{
    const pending=deferred(),h=harness({realRuntime:true,load:()=>pending.promise});const old=h.context.workspace;
    const saving=h.submit();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.stats.runtimeLoads,1);
    const active={user:{id:'owner-b'},business:{id:'business-b'}};
    h.context.workspace=active;h.context.selectedConversationId='new-conversation';
    h.modal.classList.add('open');h.customer.value='New business draft';
    if(outcome==='network')pending.reject(new TypeError('stale GET failure'));
    else pending.resolve({r:{ok:outcome==='success',status:outcome==='success'?200:401},j:{...old,ok:true,selected_conversation_id:'old-conversation'}});
    await saving;
    assert.equal(h.context.workspace,active);assert.equal(h.context.selectedConversationId,'new-conversation');
    assert.equal(h.customer.value,'New business draft');assert.equal(h.modal.classList.contains('open'),true);
    assert.equal(h.stats.renders,0);assert.deepEqual(h.stats.gates,[]);assert.equal(h.stats.loadErrors,0);
    assert.deepEqual(h.stats.busy,[true,false]);assert.deepEqual(h.toasts,['تم الحفظ']);assert.equal(h.button.disabled,false);
  });
}

test('shared runtime guard protects a form reopened during refresh in the same context',async()=>{
  const pending=deferred(),h=harness({realRuntime:true,load:()=>pending.promise});const old=h.context.workspace;
  const saving=h.submit();await new Promise(resolve=>setImmediate(resolve));
  h.modal.classList.add('open');h.customer.value='New draft in same business';
  pending.resolve({r:{ok:true,status:200},j:{...old,ok:true,appointments:[{id:'saved-appointment'}]}});await saving;
  assert.equal(h.context.workspace,old);assert.equal(h.stats.renders,0);assert.equal(h.customer.value,'New draft in same business');
});

test('shared runtime still updates workspace, selected conversation, view, and busy flags when current',async()=>{
  const pending=deferred(),h=harness({realRuntime:true,load:()=>pending.promise});const saving=h.submit();
  await new Promise(resolve=>setImmediate(resolve));
  const updated={...h.context.workspace,ok:true,selected_conversation_id:'current-conversation',appointments:[{id:'saved-appointment'}]};
  pending.resolve({r:{ok:true,status:200},j:updated});await saving;
  assert.equal(h.context.workspace,updated);assert.equal(h.context.selectedConversationId,'current-conversation');
  assert.equal(h.stats.renders,1);assert.deepEqual(h.stats.gates,['app']);assert.deepEqual(h.stats.busy,[true,false]);
});
