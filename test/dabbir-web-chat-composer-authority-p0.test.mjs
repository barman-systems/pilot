import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/chat-human-ui.js';

let script='';
handler({method:'GET'},{statusCode:0,setHeader(){},end(body){script=body;}});

function harness({channel='web',state='ai_active',source='dabbir_web_runtime'}={}){
  const nodes=new Map(),requests=[],notices=[],loads=[];
  class Element{
    constructor(key){this.key=key;this.id=String(key).replace(/^#/, '');this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.value='';this.placeholder='';this.textContent='';this.listeners={};this.className='';this.classList={add(){},remove(){}};}
    addEventListener(event,fn){this.listeners[event]=fn;}
    cloneNode(){const x=new Element(this.key);x.dataset={...this.dataset};x.disabled=this.disabled;x.hidden=this.hidden;x.value=this.value;x.placeholder=this.placeholder;x.textContent=this.textContent;return x;}
    replaceWith(next){for(const [key,value] of nodes.entries())if(value===this){next.key=key;nodes.set(key,next);break;}}
    closest(){return nodes.get('.compose');}
    set innerHTML(html){for(const m of html.matchAll(/id="([^"]+)"/g)){const key='#'+m[1];if(!nodes.has(key))nodes.set(key,new Element(key));}}
    appendChild(child){nodes.set('#'+child.id,child);}
    append(...children){for(const child of children)this.appendChild(child);}
    insertBefore(child){this.appendChild(child);}
    querySelectorAll(){return [];}
    querySelector(){return null;}
    prepend(){}
    focus(){}
  }
  for(const key of ['.chatHead','.compose','#messages','#composer','#sendBtn','#chatState','#translateAll'])nodes.set(key,new Element(key));
  const conversation={id:'conversation-a',customer_id:'customer-a',channel_type:channel,state};
  const customer={id:'customer-a',metadata:{source}};
  const workspace={business:{id:'business-a'},conversations:[conversation],customers:[customer],messages:[],messages_loaded:true};
  const ctx={
    window:{confirm:()=>true},workspace,selectedConversation:()=>conversation,selectedConversationId:conversation.id,
    document:{documentElement:{lang:'ar'},createElement:()=>new Element('created'),querySelector:key=>nodes.get(key)||null},
    toast:text=>notices.push(text),queueMicrotask:fn=>fn(),setTimeout:fn=>fn(),
    renderMessages(){},
    loadRuntime:async(...args)=>{loads.push(args);},
    fetch:async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
      if(url==='/api/chat-customer')return {ok:true,json:async()=>({ok:true,customer_message:{id:'customer-message',conversation_id:conversation.id,sender_type:'customer',body:body.message},ai_message:{id:'ai-message',conversation_id:conversation.id,sender_type:'ai',body:'رد'}})};
      if(url==='/api/chat-control')return {ok:true,json:async()=>({ok:true,result:{message:{id:'human-message',conversation_id:conversation.id,sender_type:'human',body:body.message}}})};
      throw new Error('unexpected '+url);
    },
  };
  vm.runInNewContext(script,ctx);
  return {
    nodes,requests,notices,loads,workspace,conversation,
    async send(text){const input=nodes.get('#composer'),button=nodes.get('#sendBtn');input.value=text;return button.listeners.click?.();},
  };
}

test('internal web test owns an enabled customer composer and sends only through chat-customer',async()=>{
  const h=harness();
  assert.equal(h.nodes.get('#composer').disabled,false);
  assert.match(h.nodes.get('#composer').placeholder,/اختبار DABBIR/);
  await h.send('ابا اغسل سيارتي الحين');
  assert.equal(h.requests.length,1);
  assert.deepEqual(h.requests[0],{url:'/api/chat-customer',body:{business_id:'business-a',conversation_id:'conversation-a',message:'ابا اغسل سيارتي الحين'}});
  assert.equal(h.workspace.messages.some(m=>m.id==='customer-message'),true);
  assert.equal(h.workspace.messages.some(m=>m.id==='ai-message'),true);
  assert.deepEqual(h.loads.at(-1),['business-a','conversation-a']);
});

test('live WhatsApp AI-owned conversation is read-only in owner workspace and cannot impersonate customer',async()=>{
  const h=harness({channel:'whatsapp',source:'whatsapp'});
  assert.equal(h.nodes.get('#composer').disabled,true);
  await h.send('this must not send');
  assert.equal(h.requests.length,0);
});

test('human-active conversation keeps staff reply authority through chat-control',async()=>{
  const h=harness({channel:'whatsapp',state:'human_active',source:'whatsapp'});
  assert.equal(h.nodes.get('#composer').disabled,false);
  await h.send('رد موظف');
  assert.equal(h.requests.length,1);
  assert.deepEqual(h.requests[0],{url:'/api/chat-control',body:{action:'human_message',business_id:'business-a',conversation_id:'conversation-a',message:'رد موظف'}});
  assert.equal(h.workspace.messages.some(m=>m.id==='human-message'),true);
});
