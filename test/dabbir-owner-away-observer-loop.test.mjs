import test from 'node:test';
import assert from 'node:assert/strict';
import awayUiHandler from '../api/dabbir-owner-away-ui.js';
import memoryUiHandler from '../api/dabbir-owner-decision-memory-ui.js';

function renderClient(handler){
  let body='';
  const headers=new Map();
  const res={
    status(){return this},
    setHeader(k,v){headers.set(String(k).toLowerCase(),String(v));return this},
    end(v=''){body=String(v);return this},
    set statusCode(v){this._status=v},
    get statusCode(){return this._status||200},
  };
  handler({method:'GET'},res);
  return {body,headers};
}

test('owner-away MutationObserver cannot self-trigger forever after owner workspace renders',()=>{
  const {body}=renderClient(awayUiHandler);
  assert.match(body,/const nextLabel=active\?/);
  assert.match(body,/if\(button\.textContent!==nextLabel\)button\.textContent=nextLabel/);
  assert.doesNotMatch(body,/button\.textContent=mode\?\.active\?/);
  assert.match(body,/let observerFrame=0/);
  assert.match(body,/function scheduleObservedSync\(\)/);
  assert.match(body,/new MutationObserver\(scheduleObservedSync\)/);
});

test('owner-away inactive state is cached instead of refetched on every DOM mutation',()=>{
  const {body}=renderClient(awayUiHandler);
  assert.match(body,/let modeLoaded=false/);
  assert.match(body,/checkedBusiness===id&&modeLoaded/);
  assert.match(body,/mode=payload\.mode\|\|null;checkedBusiness=id;modeLoaded=true;renderButton\(\)/);
  assert.match(body,/catch\{mode=null;checkedBusiness=id;modeLoaded=true;renderButton\(\)\}/);
});

test('owner decision-memory MutationObserver cannot self-trigger through its button label',()=>{
  const {body}=renderClient(memoryUiHandler);
  assert.match(body,/const hasCandidate=state\.candidates\.length>0/);
  assert.match(body,/const nextLabel=hasCandidate\?/);
  assert.match(body,/if\(button\.textContent!==nextLabel\)button\.textContent=nextLabel/);
  assert.doesNotMatch(body,/button\.textContent=state\.candidates\.length\?/);
  assert.match(body,/let observerFrame=0/);
  assert.match(body,/function scheduleObservedSync\(\)/);
  assert.match(body,/new MutationObserver\(scheduleObservedSync\)/);
});
