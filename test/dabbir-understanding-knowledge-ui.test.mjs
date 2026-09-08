import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/dabbir-owner-decision-memory-ui.js';
const response=payload=>({ok:true,json:async()=>({ok:true,...payload})});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(fetch,lang='en'){
  let script,observer;
  handler({method:'GET'},{setHeader(){},end(s){script=s}});
  const all=[];
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.value='';this.classList={toggle(){}};all.push(this)}
    append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n)}}
    appendChild(n){this.append(n)}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null}
    setAttribute(k,v){this.attrs[k]=v}
    addEventListener(k,v){this['on'+k]=v}
    focus(){document.activeElement=this}
    get connected(){return this===document.documentElement||Boolean(this.parentNode?.connected)}
    querySelector(){return null}
    querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(n=>['button','input','select'].includes(n.tag))}
  }
  const document={createElement:t=>new Element(t),querySelector(selector){if(selector==='#dabbirActionCenter .dac-head')return host;return all.find(n=>n.id===selector.slice(1)&&n.connected)||null},querySelectorAll(){return all.filter(n=>n.connected&&['button','input','select'].includes(n.tag))}};
  document.documentElement=new Element('html');document.documentElement.lang=lang;
  document.head=new Element('head');document.body=new Element('body');document.documentElement.append(document.head,document.body);
  const host=new Element('div');document.body.append(host);
  const workspace={business:{id:'A'},membership:{role:'owner'}};
  const window={fetch};const notices=[];
  vm.runInNewContext(script,{window,workspace,document,MutationObserver:class{constructor(fn){observer=fn}observe(){}},setTimeout(){},requestAnimationFrame(fn){queueMicrotask(fn);return 1},toast:s=>notices.push(s),encodeURIComponent,Date,Promise});
  const nodes=()=>all.filter(n=>n.connected);
  return {workspace,notices,refresh:()=>window.__dabbirOwnerDecisionMemory.refresh(),observe:()=>observer(),button:s=>nodes().find(n=>n.tag==='button'&&n.textContent===s),nodes,open:()=>document.querySelector('#dabbirMemoryButton').onclick(),form:()=>nodes().find(n=>n.tag==='form'),input:name=>nodes().find(n=>n.name===name),text:()=>nodes().map(n=>n.textContent||'').join('|')};
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
