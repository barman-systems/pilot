import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import handler from '../api/dabbir-contextual-navigation-ui.js';

function browserHarness(){
  let script='';
  const response={setHeader(){return response},status(){return response},send(value){script=String(value)}};
  handler({method:'GET'},response);
  const queued=[],observers=[],hooks=new Map();
  function element(){
    const attributes=new Map(),classes=new Set(),listeners=new Map();
    const node={dataset:{},setAttribute(name,value){attributes.set(name,String(value))},getAttribute(name){return attributes.get(name)},addEventListener(name,callback){listeners.set(name,callback)},listeners};
    const notify=name=>{for(const observer of observers)if(observer.node===node&&observer.options.attributeFilter.includes(name))queued.push(observer.callback)};
    node.classList={contains:name=>classes.has(name),add(name){classes.add(name);notify('class')},remove(name){classes.delete(name);notify('class')},toggle(name,force){const on=force??!classes.has(name);on?classes.add(name):classes.delete(name);notify('class');return on}};
    let hidden=false;
    Object.defineProperty(node,'hidden',{get:()=>hidden,set(value){hidden=Boolean(value);notify('hidden')}});
    return node;
  }
  const menu=element(),side=element(),nodes=new Map([['#menuBtn',menu],['#side',side]]);
  const document={documentElement:{lang:'ar',dataset:{}},body:element(),querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[],addEventListener(){}};
  class MutationObserver{
    constructor(callback){this.callback=callback;observers.push(this)}
    observe(node,options){this.node=node;this.options=options}
    disconnect(){this.node=null}
  }
  const window={__dabbirUiLifecycle:{on(event,name,callback){hooks.set(event,callback)}}};
  vm.runInNewContext(script,{document,window,MutationObserver,setTimeout:callback=>queued.push(callback),requestAnimationFrame:callback=>queued.push(callback)});
  const flush=()=>{while(queued.length)queued.shift()()};
  flush();
  return {menu,side,nodes,document,window,hooks,observers,flush,element};
}

test('mobile menu exposes its Arabic name, controlled panel, and actual open/close state',()=>{
  const h=browserHarness();
  assert.equal(h.menu.getAttribute('aria-label'),'القائمة الرئيسية');
  assert.equal(h.menu.getAttribute('aria-controls'),'side');
  assert.equal(h.menu.getAttribute('aria-expanded'),'false');
  h.side.classList.add('open');h.flush();
  assert.equal(h.menu.getAttribute('aria-expanded'),'true');
  // Navigation closes the panel without clicking the menu button again.
  h.side.classList.remove('open');h.flush();
  assert.equal(h.menu.getAttribute('aria-expanded'),'false');
});

test('mobile menu name follows language changes and hidden panels are not announced as expanded',()=>{
  const h=browserHarness();
  h.document.documentElement.lang='en';h.hooks.get('afterLanguage')();h.flush();
  assert.equal(h.menu.getAttribute('aria-label'),'Main navigation');
  h.side.classList.add('open');h.flush();
  assert.equal(h.menu.getAttribute('aria-expanded'),'true');
  h.side.hidden=true;h.flush();
  assert.equal(h.menu.getAttribute('aria-expanded'),'false');
  h.side.hidden=false;h.side.classList.add('hidden');h.flush();
  assert.equal(h.menu.getAttribute('aria-expanded'),'false');
});

test('repeated renders keep one narrow visibility observer and reconnect to a replaced sidebar',()=>{
  const h=browserHarness();
  h.window.__dabbirContextualNavigation.refresh();h.window.__dabbirContextualNavigation.refresh();
  assert.equal(h.observers.filter(observer=>observer.node).length,1);
  assert.deepEqual(Array.from(h.observers[0].options.attributeFilter),['class','hidden']);
  assert.equal(h.observers[0].options.subtree,undefined);
  const next=h.element();next.classList.add('open');h.nodes.set('#side',next);
  h.window.__dabbirContextualNavigation.refresh();h.flush();
  assert.equal(h.menu.getAttribute('aria-expanded'),'true');
  assert.equal(h.observers.filter(observer=>observer.node).length,1);
  h.side.classList.add('hidden');h.flush();
  assert.equal(h.menu.getAttribute('aria-expanded'),'true');
});
