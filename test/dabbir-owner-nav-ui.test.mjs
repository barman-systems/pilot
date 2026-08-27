import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from '../api/dabbir-owner-nav-ui.js';

function renderClient(){
  const headers=new Map();let statusCode=200;let body='';
  const res={status(code){statusCode=code;return this},setHeader(name,value){headers.set(String(name).toLowerCase(),String(value));return this},end(value=''){body=String(value??'');return this}};
  handler({method:'GET'},res);return {statusCode,headers,body};
}

test('owner nav client is valid and keeps daily owner screens as core',()=>{
  const result=renderClient();
  assert.equal(result.statusCode,200);
  assert.equal(result.headers.get('x-dabbir-owner-nav'),'owner-nav-v1');
  assert.doesNotThrow(()=>new Function(result.body));
  assert.match(result.body,/dashboard','conversations','appointments','customers','tasks/);
  assert.match(result.body,/dabbirNavMore/);
});

test('owner nav groups every non-core nav button instead of deleting it',()=>{
  const {body}=renderClient();
  assert.match(body,/!CORE\.has\(screen\).*items\.append\(button\)/s);
  assert.match(body,/items\.querySelectorAll\('\.navBtn'\)\.length===0/);
});

test('owner nav opens More automatically when an advanced screen is active',()=>{
  const {body}=renderClient();
  assert.match(body,/items\.querySelector\('\.navBtn\.active'\)/);
  assert.match(body,/if\(active&&!expanded\)\{expanded=true/);
});

test('owner nav provides Arabic and English More labels and loads before owner home/theme',async()=>{
  const {body}=renderClient();
  assert.match(body,/المزيد/);
  assert.match(body,/'More'/);
  const source=await readFile(new URL('../api/app-recovery.js',import.meta.url),'utf8');
  const nav=source.indexOf('/api/dabbir-owner-nav-ui');
  const home=source.indexOf('/api/dabbir-owner-home-ui');
  const theme=source.indexOf('/api/dabbir-owner-first-theme');
  assert.ok(nav>0&&home>nav&&theme>home);
});
