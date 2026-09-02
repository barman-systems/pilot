import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/calendar-performance-ui.js';

const root=new URL('../',import.meta.url);
const bundles=JSON.parse(fs.readFileSync(new URL('config/dabbir-ui-bundles.json',root),'utf8'));

function response(){
  return {
    statusCode:200,
    headers:{},
    body:'',
    status(code){this.statusCode=Number(code);return this},
    setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},
    send(body=''){this.body=String(body);return this},
    end(body=''){this.body=String(body);return this},
  };
}

test('owner bundle uses the event-scoped calendar performance route',()=>{
  assert.ok(bundles.deferred.includes('/api/calendar-performance-ui'));
  assert.equal(bundles.deferred.includes('/api/calendar-live-ui'),false);
});

test('calendar performance route removes navigation-wide DOM observers and booking polling',async()=>{
  const res=response();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['x-dabbir-calendar-performance-ui'],'v1-event-scoped');

  const body=res.body;
  assert.doesNotMatch(body,/observer\.observe\(document\.body,\{subtree:true,attributes:true,attributeFilter:\['class'\]\}\)/);
  assert.doesNotMatch(body,/observer\.observe\(document\.body,\{subtree:true,childList:true,attributes:true,attributeFilter:\['class'\]\}\)/);
  assert.doesNotMatch(body,/setInterval\(\(\)=>\{if\(workspace\?\.business\?\.id&&workspace\.business\.id!==lastBusiness\)load\(true\)\},1200\)/);
  assert.doesNotMatch(body,/setInterval\(\(\)=>\{if\(q\('#screen-appointments'\)\?\.classList\.contains\('active'\)\)render\(\)\},1500\)/);

  assert.match(body,/profileLanguageObserver\.observe\(document\.documentElement,\{attributes:true,attributeFilter:\['lang','dir'\]\}\)/);
  assert.match(body,/baseRenderAllProfile/);
  assert.match(body,/activationObserver\.observe\(calendarScreen,\{attributes:true,attributeFilter:\['class'\]\}\)/);
  assert.match(body,/screenObserver\.observe\(appointmentScreen,\{attributes:true,attributeFilter:\['class'\]\}\)/);
  assert.match(body,/tableObserver\.observe\(appointmentTable,\{childList:true\}\)/);
});
