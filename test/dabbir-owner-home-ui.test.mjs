import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from '../api/dabbir-owner-home-ui.js';

function renderClient(){
  const headers=new Map();
  let statusCode=200;
  let body='';
  const res={
    status(code){statusCode=code;return this},
    setHeader(name,value){headers.set(String(name).toLowerCase(),String(value));return this},
    end(value=''){body=String(value??'');return this},
  };
  handler({method:'GET'},res);
  return {statusCode,headers,body};
}

test('owner home client is valid JavaScript and defaults details to collapsed',()=>{
  const result=renderClient();
  assert.equal(result.statusCode,200);
  assert.equal(result.headers.get('x-dabbir-owner-home'),'owner-home-v1');
  assert.doesNotThrow(()=>new Function(result.body));
  assert.match(result.body,/let expanded=false/);
  assert.match(result.body,/body\.hidden=!expanded/);
});

test('owner home moves legacy metrics and operational detail grid behind one toggle',()=>{
  const {body}=renderClient();
  assert.match(body,/#dashCards/);
  assert.match(body,/dash\.querySelector\('\.grid2'\)/);
  assert.match(body,/body\.append\(cards,grid\)/);
  assert.match(body,/dabbirOwnerDetailsToggle/);
  assert.match(body,/aria-expanded/);
});

test('Today action center is repaired back outside collapsed business details if injected later',()=>{
  const {body}=renderClient();
  assert.match(body,/#dabbirActionCenter/);
  assert.match(body,/body&&actionCenter&&body\.contains\(actionCenter\)/);
  assert.match(body,/wrap\.parentNode\.insertBefore\(actionCenter,wrap\)/);
  assert.match(body,/MutationObserver\(\(\)=>\{\s*if\(document\.querySelector\('#screen-dashboard'\)\)install\(\)/);
});

test('owner home provides Arabic and English labels',()=>{
  const {body}=renderClient();
  assert.match(body,/عرض تفاصيل النشاط/);
  assert.match(body,/إخفاء تفاصيل النشاط/);
  assert.match(body,/Show business details/);
  assert.match(body,/Hide business details/);
});

test('owner home loads after the action center and before the final visual theme',async()=>{
  const source=await readFile(new URL('../api/app-recovery.js',import.meta.url),'utf8');
  const action=source.indexOf('/api/owner-action-center-ui');
  const home=source.indexOf('/api/dabbir-owner-home-ui');
  const theme=source.indexOf('/api/dabbir-owner-first-theme');
  assert.ok(home>action);
  assert.ok(theme>home);
});
