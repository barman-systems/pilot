import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/appointment-management-ui.js';
function harness(){
 let script;const res={setHeader(){return this},status(){return this},send(s){script=s}};handler({method:'GET'},res);
 const messages=[],pending=[],listeners={},elements=new Map();let opened=false,backs=0;
 const element=()=>({setAttribute(){},append(){},classList:{add(){opened=true},remove(){opened=false},contains(){return false}},querySelectorAll(){return []},focus(){},value:'',dataset:{}});
 const document={documentElement:{lang:'ar'},head:{append(){}},body:{append(n){elements.set('#'+n.id,n)}},activeElement:element(),createElement:element,querySelector(selector){if(selector==='#dabbirApptEditModal.open')return opened?elements.get('#dabbirApptEditModal'):null;return elements.get(selector)||null},addEventListener(name,fn){listeners[name]=fn}};
 for(const id of ['dabbirApptEditCancel','dabbirApptEditForm','dabbirApptEditTime'])elements.set('#'+id,element());
 const history={state:{dabbirPage:'dashboard'},pushState(s){this.state=s},replaceState(s){this.state=s},back(){backs++;this.state={dabbirPage:'dashboard'}}};
 const ctx={document,history,URLSearchParams,Date,Intl,localStorage:{getItem(){return null}},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},workspace:{business:{id:'business-a'},branch_scope:{branch_id:'branch-a'},appointments:[]},toast:m=>messages.push(m),fetch:()=>new Promise(resolve=>pending.push(resolve)),window:{addEventListener(name,fn){listeners[name]=fn},__dabbirUiLifecycle:{on(name,key,fn){listeners.scope=fn}}}};
 vm.runInNewContext(script,ctx);
 return {ctx,messages,pending,listeners,history,get opened(){return opened},get backs(){return backs},api:ctx.window.__dabbirAppointmentManagement,reply(index,{status=200}={}){pending[index]({ok:status===200,status,json:async()=>({ok:status===200,can_manage:false,appointment:{id:'record-a',business_id:'business-a',starts_at:'2099-01-01T12:00:00Z'}})})}};
}
test('detail opens the fetched record even when the current appointment list is empty',async()=>{const h=harness();const request=h.api.openRecord('record-a');h.reply(0);await request;assert.equal(h.opened,true);assert.equal(h.history.state.dabbirAppointmentDetail,true);h.api.closeModal();assert.equal(h.opened,false);assert.equal(h.backs,1)});
test('a late success cannot reopen a record after changing branch',async()=>{const h=harness();const request=h.api.openRecord('record-a');h.ctx.workspace.branch_scope.branch_id='branch-b';h.reply(0);await request;assert.equal(h.opened,false)});
test('a late error from another branch is not shown in the new context',async()=>{const h=harness();const request=h.api.openRecord('record-a');h.ctx.workspace.branch_scope.branch_id='branch-b';h.reply(0,{status:403});await request;assert.deepEqual(h.messages,[])});
test('switching branch closes details without navigating back into the old scope',async()=>{const h=harness();const request=h.api.openRecord('record-a');h.reply(0);await request;h.ctx.workspace.branch_scope.branch_id='branch-b';h.listeners.scope();assert.equal(h.opened,false);assert.equal(h.backs,0);assert.equal(h.history.state.dabbirAppointmentDetail,undefined)});
test('latest record request wins over an earlier response',async()=>{const h=harness();const old=h.api.openRecord('record-old');const next=h.api.openRecord('record-a');h.reply(1);await next;h.reply(0,{status:404});await old;assert.equal(h.opened,true);assert.deepEqual(h.messages,[])});
