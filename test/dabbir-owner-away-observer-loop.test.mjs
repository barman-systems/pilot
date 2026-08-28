import test from 'node:test';
import assert from 'node:assert/strict';
import awayUiHandler from '../api/dabbir-owner-away-ui.js';

function renderClient(){
  let body='';
  const headers=new Map();
  const res={
    status(){return this},
    setHeader(k,v){headers.set(String(k).toLowerCase(),String(v));return this},
    end(v=''){body=String(v);return this},
    set statusCode(v){this._status=v},
    get statusCode(){return this._status||200},
  };
  awayUiHandler({method:'GET'},res);
  return {body,headers};
}

test('owner-away MutationObserver cannot self-trigger forever after owner workspace renders',()=>{
  const {body}=renderClient();
  assert.match(body,/const nextLabel=active\?/);
  assert.match(body,/if\(button\.textContent!==nextLabel\)button\.textContent=nextLabel/);
  assert.doesNotMatch(body,/button\.textContent=mode\?\.active\?/);
  assert.match(body,/let observerFrame=0/);
  assert.match(body,/function scheduleObservedSync\(\)/);
  assert.match(body,/new MutationObserver\(scheduleObservedSync\)/);
});

test('owner-away inactive state is cached instead of refetched on every DOM mutation',()=>{
  const {body}=renderClient();
  assert.match(body,/let modeLoaded=false/);
  assert.match(body,/checkedBusiness===id&&modeLoaded/);
  assert.match(body,/mode=payload\.mode\|\|null;checkedBusiness=id;modeLoaded=true;renderButton\(\)/);
  assert.match(body,/catch\{mode=null;checkedBusiness=id;modeLoaded=true;renderButton\(\)\}/);
});
