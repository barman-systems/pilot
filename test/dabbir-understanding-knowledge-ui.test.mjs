import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/dabbir-owner-decision-memory-ui.js';
const response=payload=>({ok:true,json:async()=>({ok:true,...payload})});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(fetch,lang='en',lateDashboard=false){
  let script,observer;
  handler({method:'GET'},{setHeader(){},end(s){script=s}});
  const all=[];
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.value='';this.classList={toggle(){}};all.push(this)}
    append(...nodes){for(const n of nodes){n.remove();n.parentNode=this;this.children.push(n)}}
    appendChild(n){this.append(n)}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null}
    setAttribute(k,v){this.attrs[k]=v}
    addEventListener(k,v){this['on'+k]=v}
    focus(){document.activeElement=this}
    showModal(){this.open=true;this.nativeModal=true}
    close(){this.open=false}
    get connected(){return this===document.documentElement||Boolean(this.parentNode?.connected)}
    querySelector(){return null}
    querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(n=>['button','input','select'].includes(n.tag))}
  }
  const document={createElement:t=>new Element(t),querySelector(selector){if(selector==='#dabbirActionCenter .dac-head')return lateDashboard?null:host;if(selector==='#screen-automations .hero'||selector==='#screen-automations')return autoHost;return all.find(n=>n.id===selector.slice(1)&&n.connected)||null},querySelectorAll(){return all.filter(n=>n.connected&&['button','input','select'].includes(n.tag))}};
  document.documentElement=new Element('html');document.documentElement.lang=lang;
  document.head=new Element('head');document.body=new Element('body');document.documentElement.append(document.head,document.body);
  const host=new Element('div'),autoHost=new Element('div');document.body.append(host,autoHost);
  const workspace={business:{id:'A'},membership:{role:'owner'}};
  const window={fetch};const notices=[];
  vm.runInNewContext(script,{window,workspace,document,MutationObserver:class{constructor(fn){observer=fn}observe(){}},setTimeout(){},requestAnimationFrame(fn){queueMicrotask(fn);return 1},toast:s=>notices.push(s),encodeURIComponent,Date,Promise});
  const nodes=()=>all.filter(n=>n.connected);
  return {workspace,notices,host,autoHost,mountDashboard(){lateDashboard=false;observer()},refresh:()=>window.__dabbirOwnerDecisionMemory.refresh(),observe:()=>observer(),button:s=>nodes().find(n=>n.tag==='button'&&n.textContent===s),nodes,open:()=>document.querySelector('#dabbirMemoryButton').onclick(),form:()=>nodes().find(n=>n.tag==='form'),input:name=>nodes().find(n=>n.name===name),text:()=>nodes().map(n=>n.textContent||'').join('|')};
}
const payload={services:[{id:'service-A',name:'Gold wash',active:true}],proposals:[],audit:[]};
for(const lang of ['ar','en'])test(lang+': owner must save then explicitly approve; revoke and restore read back new versions',async()=>{
  const calls=[];let status=null,version=0;const ui=harness(async(url,options={})=>{
    if(options.method==='POST'){const b=JSON.parse(options.body);calls.push(b);status={propose:'PROPOSED',approve:'OWNER_APPROVED',revoke:'REVOKED',rollback:'OWNER_APPROVED'}[b.action];version++;return response({result:{active:status==='OWNER_APPROVED'}})}
    return response(url.startsWith('/api/understanding')?{...payload,proposals:status?[{id:'proposal-A',entity_type:'service',alias:'VIP',target_id:'service-A',status,version}]:[]}:{});
  },lang);
  await ui.refresh();ui.open();ui.input('alias').value='VIP';ui.input('service').value='service-A';await ui.form().onsubmit({preventDefault(){}});
  assert.deepEqual(calls.map(x=>x.action),['propose']);assert.match(ui.text(),lang==='ar'?/بانتظار اعتمادك/:/Awaiting your approval/);
  await ui.button(lang==='ar'?'اعتماد المعنى':'Approve meaning').onclick();assert.equal(status,'OWNER_APPROVED');
  await ui.button(lang==='ar'?'إلغاء الاعتماد':'Revoke approval').onclick();assert.equal(status,'REVOKED');
  await ui.button(lang==='ar'?'إعادة اعتماد هذا الإصدار':'Approve this version again').onclick();assert.equal(version,4);assert.ok(calls.every(x=>x.business_id==='A'));
});
test('late tenant A reads cannot overwrite tenant B and detached A form cannot submit in B',async()=>{
  let finish;let delayed=false;const writes=[];const ui=harness(async(url,options={})=>{if(options.method==='POST'){writes.push(options);return response({})}if(url.includes('understanding')){if(delayed&&url.endsWith('=A'))return new Promise(r=>finish=r);return response({...payload,services:[{id:'service-'+ui.workspace.business.id,name:'Tenant '+ui.workspace.business.id,active:true}]})}return response({})});
  await ui.refresh();ui.open();const oldForm=ui.form();ui.input('alias').value='VIP';ui.input('service').value='service-A';delayed=true;const pending=ui.refresh();await flush();ui.workspace.business.id='B';await ui.refresh();ui.open();finish(response(payload));await pending;assert.match(ui.text(),/Tenant B/);assert.doesNotMatch(ui.text(),/Gold wash|Tenant A/);await oldForm.onsubmit({preventDefault(){}});assert.equal(writes.length,0);
});
test('duplicate submit sends one request; completion after business switch cannot reopen old dialog',async()=>{
  let finish;const writes=[];const ui=harness(async(url,options={})=>{if(options.method==='POST'){writes.push(options);return new Promise(r=>finish=r)}return response(url.includes('understanding')?payload:{})});
  await ui.refresh();ui.open();ui.input('alias').value='VIP';ui.input('service').value='service-A';const form=ui.form();const first=form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(writes.length,1);ui.workspace.business.id='B';await ui.refresh();finish(response({}));await first;assert.equal(ui.form(),undefined);assert.equal(ui.notices.length,0);
});
test('failed knowledge read gives retry, not an empty success or actionable form',async()=>{let fail=true;const ui=harness(async url=>{if(url.includes('understanding')&&fail)throw new Error('network');return response(url.includes('understanding')?payload:{})});await ui.refresh();ui.open();assert.match(ui.text(),/Could not load/);assert.equal(ui.form(),undefined);fail=false;await ui.button('Retry').onclick();assert.ok(ui.form())});
test('owner role removed closes knowledge and discards in-flight data',async()=>{const ui=harness(async url=>response(url.includes('understanding')?payload:{}));await ui.refresh();ui.open();ui.workspace.membership.role='employee';await ui.refresh();assert.equal(ui.form(),undefined);assert.equal(ui.button('DABBIR Policies'),undefined)});
test('untrusted alias remains text and cannot create markup',async()=>{const ui=harness(async url=>response(url.includes('understanding')?{...payload,proposals:[{id:'p',entity_type:'service',alias:'<img src=x onerror=alert(1)>',target_id:'service-A',status:'PROPOSED',version:1}]}:{}));await ui.refresh();ui.open();assert.match(ui.text(),/<img src=x/);assert.equal(ui.nodes().some(n=>n.tag==='img'),false);assert.ok(ui.nodes().every(n=>!n.innerHTML))});

test('the shipped deferred bundle mounts owner knowledge, beyond the historical module-order comment',async()=>{
  const fs=await import('node:fs');
  const manifest=JSON.parse(fs.readFileSync('config/dabbir-ui-bundles.json','utf8'));
  assert.equal(manifest.deferred.filter(x=>x==='/api/owner-action-center-ui').length,1);
  assert.equal(manifest.critical.length+manifest.deferred.length,26);
  const {default:composed}=await import('../api/owner-action-center-ui.js');
  let client;composed({method:'GET'},{setHeader(){},status(){return this},send(s){client=s}});
  assert.match(client,/owner-decision-memory-ui-v2/);
  const bundle=fs.readFileSync('public/dabbir-ui-deferred.js','utf8');
  assert.match(bundle,/owner-decision-memory-ui-v2/);
  assert.match(bundle,/معاني الخدمات/);
  assert.match(bundle,/\/api\/understanding-knowledge/);
});


test('a control mounted in hidden automations moves to the dashboard once its host arrives',async()=>{
  const ui=harness(async url=>response(url.includes('understanding')?payload:{}),'en',true);
  await ui.refresh();const button=ui.button('DABBIR Policies');assert.equal(button.parentNode,ui.autoHost);
  ui.mountDashboard();await flush();assert.equal(ui.button('DABBIR Policies'),button);assert.equal(button.parentNode,ui.host);
  ui.observe();await flush();assert.equal(ui.host.children.filter(n=>n===button).length,1);
});


test('knowledge approval opens in the browser modal top layer above onboarding overlays',async()=>{
  const ui=harness(async url=>response(url.includes('understanding')?payload:{}));
  await ui.refresh();ui.open();const modal=ui.nodes().find(n=>n.id==='dabbirMemoryOverlay');
  assert.equal(modal.tag,'dialog');assert.equal(modal.nativeModal,true);assert.equal(modal.open,true);
  assert.equal(modal.attrs['aria-labelledby'],'dabbirMemoryTitle');
  modal.oncancel({preventDefault(){}});assert.equal(modal.open,false);assert.equal(modal.connected,false);
});

test('refresh retains an owner draft in the same tenant and a successful save clears it',async()=>{
  let writes=0;const ui=harness(async(url,options={})=>{if(options.method==='POST')writes++;return response(url.includes('understanding')?payload:{})});
  await ui.refresh();ui.open();ui.input('alias').value='VIP';ui.input('alias').oninput?.();ui.input('service').value='service-A';ui.input('service').onchange?.();
  await ui.refresh();assert.equal(ui.input('alias').value,'VIP');assert.equal(ui.input('service').value,'service-A');
  await ui.form().onsubmit({preventDefault(){}});assert.equal(writes,1);assert.equal(ui.input('alias').value,'');assert.equal(ui.input('service').value,'');
});

test('draft inputs cannot survive a tenant switch or be changed by detached tenant controls',async()=>{
  const ui=harness(async url=>response(url.includes('understanding')?payload:{}));await ui.refresh();ui.open();
  const alias=ui.input('alias');alias.value='Tenant A private draft';alias.oninput?.();
  ui.workspace.business.id='B';await ui.refresh();ui.open();alias.oninput?.();
  assert.equal(ui.input('alias').value,'');assert.equal(ui.input('service').value,'');
});
