import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/chat-human-ui.js';

let script;handler({method:'GET'},{setHeader(){},end(body){script=body;}});
function harness({state='action_required',lang='ar',confirm=true,fail=false,onConfirm}={}){
 const nodes=new Map(),requests=[],notices=[],confirmations=[];
 class Element{
  constructor(id){this.id=id;this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.listeners={};this.classList={add(){},remove(){}};}
  addEventListener(event,fn){this.listeners[event]=fn;}
  set innerHTML(html){for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set('#'+m[1],new Element(m[1]));}
  appendChild(e){nodes.set('#'+e.id,e);}
  insertBefore(e){this.appendChild(e);}
  querySelectorAll(){return [];}
  closest(){return new Element('compose');}
 }
 for(const id of ['.chatHead','#messages','#composer','#sendBtn','#chatState'])nodes.set(id,new Element(id));
 nodes.get('#composer').dataset.dabbirHumanComposer='v3';nodes.get('#sendBtn').dataset.dabbirHumanComposer='v3';
 let conversation={id:'conversation-a',state};
 const ctx={window:{__dabbirConfirm:async input=>{confirmations.push(input);onConfirm?.(ctx);return confirm;}},workspace:{business:{id:'business-a'}},selectedConversation:()=>conversation,selectedConversationId:conversation.id,
  document:{documentElement:{lang},head:new Element('head'),createElement:()=>new Element(),querySelector:s=>nodes.get(s)||null},
  toast:t=>notices.push(t),queueMicrotask:fn=>fn(),setTimeout:fn=>fn(),
  loadRuntime:async()=>{},fetch:async(url,options)=>{requests.push({url,...JSON.parse(options.body)});if(!fail)conversation.state=requests.at(-1).action==='return_to_ai'?'waiting_customer':'human_active';return {ok:!fail,json:async()=>fail?{ok:false,error:'HANDOFF_MANAGEMENT_REQUIRED'}:{ok:true}};}};
 vm.runInNewContext(script,ctx);
 return {nodes,requests,notices,confirmations,ctx,click:id=>nodes.get(id).listeners.click(),conversation:()=>conversation};
}

for(const lang of ['ar','en'])test(`queued handoff exposes a direct governed return without takeover: ${lang}`,async()=>{
 const h=harness({lang}),button=h.nodes.get('#dabbirReturnToAiBtn');
 assert.equal(button.hidden,false);assert.equal(h.nodes.get('#composer').disabled,true);
 assert.match(button.textContent,/إعادة إلى DABBIR|Return to DABBIR/);
 await h.click('#dabbirReturnToAiBtn');
 assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0],{url:'/api/chat-control',action:'return_to_ai',business_id:'business-a',conversation_id:'conversation-a'});
 assert.match(h.confirmations[0].title,/إعادة المحادثة إلى دبّر|Return this conversation to DABBIR/);
 assert.equal(h.conversation().state,'waiting_customer');assert.equal(button.hidden,true);
});

test('direct queued return is hidden for an AI-owned conversation',()=>{
 const h=harness({state:'ai_active'});assert.equal(h.nodes.get('#dabbirReturnToAiBtn').hidden,true);assert.equal(h.nodes.get('#composer').disabled,true);
});

test('existing human-active return remains intact',async()=>{
 const h=harness({state:'human_active'});assert.equal(h.nodes.get('#composer').disabled,false);
 await h.click('#dabbirTakeoverBtn');assert.equal(h.requests[0].action,'return_to_ai');
});

test('the separate manual-takeover action remains explicit for a queued handoff',async()=>{
 const h=harness();await h.click('#dabbirTakeoverBtn');assert.equal(h.requests[0].action,'takeover');
 assert.match(h.confirmations[0].title,/استلام المحادثة يدويًا/);
});

test('cancelling direct return makes no request and retains human attention',async()=>{
 const h=harness({confirm:false});await h.click('#dabbirReturnToAiBtn');assert.equal(h.requests.length,0);assert.equal(h.conversation().state,'action_required');
});

test('a conversation switch during confirmation cannot return another customer to AI',async()=>{
 const h=harness({onConfirm:ctx=>{ctx.selectedConversationId='conversation-b';}});await h.click('#dabbirReturnToAiBtn');assert.equal(h.requests.length,0);
});

test('permission failure retains the handoff and reports no successful return',async()=>{
 const h=harness({fail:true});await h.click('#dabbirReturnToAiBtn');assert.equal(h.conversation().state,'action_required');
 assert.equal(h.notices.length,1);assert.match(h.notices[0],/تعذر إعادة/);assert.match(h.notices[0],/HANDOFF_MANAGEMENT_REQUIRED/);assert.equal(h.nodes.get('#dabbirReturnToAiBtn').disabled,false);
});
