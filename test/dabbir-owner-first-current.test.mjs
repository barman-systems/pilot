import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import themeHandler from '../api/dabbir-owner-first-theme.js';
import homeHandler from '../api/dabbir-owner-home-ui.js';
import navHandler from '../api/dabbir-owner-nav-ui.js';

function render(handler){
  const headers=new Map();let statusCode=200;let body='';
  const res={status(code){statusCode=code;return this},setHeader(name,value){headers.set(String(name).toLowerCase(),String(value));return this},end(value=''){body=String(value??'');return this}};
  handler({method:'GET'},res);
  return {headers,statusCode,body};
}

test('rebased owner-first clients parse and keep the approved DABBIR identity direction',()=>{
  const theme=render(themeHandler),home=render(homeHandler),nav=render(navHandler);
  for(const result of [theme,home,nav]){assert.equal(result.statusCode,200);assert.doesNotThrow(()=>new Function(result.body));}
  assert.match(theme.body,/--dabbir-brand-purple:#7c5cff/);
  assert.match(theme.body,/--dabbir-brand-blue:#3e8cff/);
  assert.match(theme.body,/--dabbir-brand-cyan:#46d9ff/);
  assert.match(theme.body,/\.logo,.dabbirTopLogo,.dabbirAiIdentity img,.dabbirAiStatusLogo\{border-color:transparent/);
  assert.doesNotMatch(theme.body,/\.logo\{background:/);
  assert.doesNotMatch(theme.body,/\.dabbirTopLogo\{background:/);
});

test('owner home stays exception-first while preserving all business details',()=>{
  const {body}=render(homeHandler);
  assert.match(body,/let expanded=false/);
  assert.match(body,/body\.append\(cards,grid\)/);
  assert.match(body,/عرض تفاصيل النشاط/);
  assert.match(body,/Show business details/);
  assert.match(body,/body&&actionCenter&&body\.contains\(actionCenter\)/);
});

test('owner navigation groups rather than deletes advanced screens',()=>{
  const {body}=render(navHandler);
  assert.match(body,/dashboard','conversations','appointments','customers','tasks/);
  assert.match(body,/!CORE\.has\(screen\).*items\.append\(button\)/s);
  assert.match(body,/المزيد/);
  assert.match(body,/'More'/);
});

test('current production layers stay intact and verified metrics retain final authority',async()=>{
  const source=await readFile(new URL('../api/app-recovery.js',import.meta.url),'utf8');
  const required=['/api/dabbir-owner-decision-memory-ui','/api/platform-customer-support-ui','/api/dabbir-mobile-shell-v3','/api/dabbir-owner-nav-ui','/api/dabbir-owner-home-ui','/api/dabbir-owner-first-theme','/api/verified-metrics-ui'];
  for(const path of required)assert.ok(source.includes(path),`missing ${path}`);
  const mobile=source.indexOf('/api/dabbir-mobile-shell-v3');
  const nav=source.indexOf('/api/dabbir-owner-nav-ui');
  const home=source.indexOf('/api/dabbir-owner-home-ui');
  const theme=source.indexOf('/api/dabbir-owner-first-theme');
  const metrics=source.indexOf('/api/verified-metrics-ui');
  assert.ok(mobile<nav&&nav<home&&home<theme&&theme<metrics);
});
