import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/dabbir-contextual-navigation-ui.js';

function browserHarness({businessId='business-a'}={}){
  let script='';
  const response={setHeader(){return response},status(){return response},send(value){script=String(value)}};
  handler({method:'GET'},response);
  const queued=[],observers=[],hooks=new Map(),navigations=[],notices=[];
  let focused=null,screen='notifications';
  const notify=node=>{
    for(const observer of observers)if(observer.node===node&&observer.options.childList)queued.push(observer.callback);
  };
  function element(tag='div',text=''){
    const attributes=new Map(),classes=new Set(),listeners=new Map();
    const node={tagName:tag.toUpperCase(),textContent:text,children:[],dataset:{},style:{},hidden:false,
      setAttribute(name,value){attributes.set(name,String(value))},getAttribute:name=>attributes.get(name),
      addEventListener(name,callback){listeners.set(name,callback)},
      click(){listeners.get('click')?.({target:node})},
      append(child){child.parent=node;node.children.push(child);notify(node)},
      remove(){if(node.parent){const parent=node.parent;parent.children=parent.children.filter(child=>child!==node);node.parent=null;notify(parent)}},
      replaceChildren(...children){node.children.forEach(child=>child.parent=null);node.children=children;children.forEach(child=>child.parent=node);notify(node)},
      getClientRects:()=>node.hidden?[]:[{}],
      scrollIntoView(){node.scrolled=(node.scrolled||0)+1},focus(){focused=node},
      querySelector(selector){
        const match=child=>selector==='[data-dabbir-whatsapp-notice-action]'?child.dataset.dabbirWhatsappNoticeAction!==undefined:
          selector==='.grow'?child.className==='grow':child.tagName===selector.toUpperCase();
        const find=parent=>{for(const child of parent.children){if(match(child))return child;const nested=find(child);if(nested)return nested}return null};
        return find(node);
      },
      classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name),toggle(name,on){on?classes.add(name):classes.delete(name)}}
    };
    return node;
  }
  function notice(type,title){
    const row=element();row.dataset.noticeType=type;
    const grow=element();grow.className='grow';grow.append(element('b',title));grow.append(element('small','Needs attention'));row.append(grow);
    return row;
  }
  function integration(title){const card=element();card.append(element('h3',title));return card}
  let list=element();
  const whatsapp=notice('channel_issues','واتساب'),handoff=notice('handoffs','Customer waiting'),appointment=notice('appointments','Bookings'),otherChannel=notice('channel_issues','Email');
  list.replaceChildren(whatsapp,handoff,appointment,otherChannel);
  const cards=[integration('Calendar'),integration('واتساب'),integration('Payments')];
  const document={documentElement:{lang:'ar',dataset:{}},body:element(),createElement:element,addEventListener(){},
    querySelector:selector=>selector==='#noticeList'?list:selector==='#screen-integrations.active'&&screen==='integrations'?{}:null,
    querySelectorAll:selector=>selector==='#noticeList [data-notice-type="channel_issues"]'?list.children.filter(row=>row.dataset.noticeType==='channel_issues'):selector==='#integrationGrid .integration'?cards:[]
  };
  class MutationObserver{
    constructor(callback){this.callback=callback;observers.push(this)}
    observe(node,options){this.node=node;this.options=options}
    disconnect(){this.node=null}
  }
  const window={__dabbirUiLifecycle:{on(event,name,callback){hooks.set(event,callback)}}};
  const context=vm.createContext({document,window,MutationObserver,workspace:businessId?{business:{id:businessId},membership:{role:'owner'}}:null,
    setTimeout:callback=>queued.push(callback),T:()=>({whatsapp:document.documentElement.lang==='en'?'WhatsApp':'واتساب'}),
    showScreen(name){navigations.push(name);screen=name;hooks.get('afterNavigate')?.()},toast:message=>notices.push(message),
    fetch(){throw new Error('Navigation must not perform an external action')}
  });
  vm.runInContext(script,context);
  const flush=()=>{let count=0;while(queued.length){assert.ok(++count<100,'navigation should settle without an observer loop');queued.shift()()}};
  flush();
  return {document,window,context,hooks,observers,navigations,notices,whatsapp,handoff,appointment,otherChannel,cards,notice,flush,
    action:row=>row.querySelector('[data-dabbir-whatsapp-notice-action]'),focused:()=>focused,
    changeBusiness:id=>{context.workspace=id?{business:{id},membership:{role:'owner'}}:null},
    navigate:name=>{screen=name},replaceRows:(...rows)=>list.replaceChildren(...rows),
    replaceHost:()=>{const previous=list;list=element();return previous}
  };
}

test('WhatsApp issue has one native action; other notices retain their own purpose',()=>{
  const h=browserHarness(),button=h.action(h.whatsapp);
  assert.ok(button,'A WhatsApp issue must offer a direct path to its settings');
  assert.equal(button.tagName,'BUTTON');assert.equal(button.type,'button');
  assert.equal(button.textContent,'إعداد واتساب');assert.equal(button.style.minHeight,'44px');
  assert.equal(h.action(h.handoff),null);assert.equal(h.action(h.appointment),null);assert.equal(h.action(h.otherChannel),null);
  h.window.__dabbirContextualNavigation.refresh();h.window.__dabbirContextualNavigation.refresh();h.flush();
  assert.equal(h.action(h.whatsapp),button);assert.equal(h.whatsapp.querySelector('.grow').children.length,3);
});

test('one click reaches and focuses the exact WhatsApp card without starting a connection',()=>{
  const h=browserHarness();h.action(h.whatsapp).click();h.flush();
  assert.deepEqual(h.navigations,['integrations']);
  assert.equal(h.cards[1].scrolled,1);assert.equal(h.focused(),h.cards[1].querySelector('h3'));
  assert.equal(h.focused().getAttribute('tabindex'),'-1');
  assert.equal(h.cards[0].scrolled,undefined);assert.equal(h.cards[2].scrolled,undefined);assert.deepEqual(h.notices,[]);
});

test('independent notice replacement retains the action without polling or observing descendants',()=>{
  const h=browserHarness(),next=h.notice('channel_issues','واتساب');
  h.replaceRows(next);h.flush();assert.ok(h.action(next));
  assert.equal(h.observers.filter(observer=>observer.node).length,1);
  const options=h.observers[0].options;assert.equal(options.childList,true);assert.equal(options.subtree,undefined);
  const previous=h.replaceHost();h.window.__dabbirContextualNavigation.refresh();
  assert.equal(h.observers.some(observer=>observer.node===previous),false);
  assert.equal(h.observers.filter(observer=>observer.node).length,1);
});

test('language changes update the action and select the translated destination without unhiding preferences',()=>{
  const h=browserHarness();h.whatsapp.style.display='none';
  h.document.documentElement.lang='en';h.whatsapp.querySelector('b').textContent='WhatsApp';h.cards[1].querySelector('h3').textContent='WhatsApp';
  h.hooks.get('afterLanguage')();h.flush();
  assert.equal(h.action(h.whatsapp).textContent,'WhatsApp settings');assert.equal(h.whatsapp.style.display,'none');
  h.action(h.whatsapp).click();h.flush();assert.equal(h.focused(),h.cards[1].querySelector('h3'));
});

test('stale business action cannot navigate, and an in-flight focus cannot follow a business switch',()=>{
  const h=browserHarness();h.changeBusiness('business-b');h.action(h.whatsapp).click();h.flush();
  assert.deepEqual(h.navigations,[]);assert.equal(h.notices.length,1);
  h.window.__dabbirContextualNavigation.refresh();h.action(h.whatsapp).click();h.changeBusiness('business-c');h.flush();
  assert.deepEqual(h.navigations,['integrations']);assert.equal(h.focused(),null);
});

test('navigation away cancels deferred focus; unavailable card gives recovery without focusing a different integration',()=>{
  const h=browserHarness();h.action(h.whatsapp).click();h.navigate('dashboard');h.flush();assert.equal(h.focused(),null);
  h.cards[1].hidden=true;h.action(h.whatsapp).click();h.flush();assert.equal(h.focused(),null);
  assert.equal(h.notices.length,1);assert.match(h.notices[0],/حدّث الصفحة/);
});

test('signed-out notices offer no business action and logout removes an existing action',()=>{
  const anonymous=browserHarness({businessId:null});assert.equal(anonymous.action(anonymous.whatsapp),null);
  const h=browserHarness();h.changeBusiness(null);h.hooks.get('afterRender')();h.flush();assert.equal(h.action(h.whatsapp),null);
});
