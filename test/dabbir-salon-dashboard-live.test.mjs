import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/salon-dashboard-live-ui.js';

const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('api/salon-dashboard-live-ui.js',root),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('config/dabbir-ui-bundles.json',root),'utf8'));

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

test('Salon Today live refresh is loaded after the calendar bundle',()=>{
  const calendar=manifest.deferred.indexOf('/api/calendar-performance-ui');
  const live=manifest.deferred.indexOf('/api/salon-dashboard-live-ui');
  assert.ok(calendar>=0);
  assert.ok(live>calendar);
});

test('Salon Today refreshes from the authoritative Salon snapshot without continuous polling',()=>{
  assert.match(source,/window\.__dabbirSalonMode/);
  assert.match(source,/salon\.refresh\(\)/);
  assert.match(source,/visibilitychange/);
  assert.match(source,/baseShowScreen/);
  assert.match(source,/baseRenderAll/);
  assert.match(source,/data-salon-live-refresh/);
  assert.doesNotMatch(source,/setInterval\s*\(/);
});

test('Salon Today live UI route exposes the event-scoped release marker',async()=>{
  const res=response();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['x-dabbir-salon-dashboard-live-ui'],'v1-event-scoped');
  assert.match(res.body,/__dabbirSalonDashboardLive/);
});
