import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/dabbir-navigation-event-bridge-ui.js';

const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('api/dabbir-navigation-event-bridge-ui.js',root),'utf8');
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

test('Salon Today freshness reuses the existing navigation bridge shell slot',()=>{
  assert.equal(manifest.deferred.includes('/api/salon-dashboard-live-ui'),false);
  assert.equal(manifest.deferred.filter(x=>x==='/api/dabbir-navigation-event-bridge-ui').length,1);
});

test('Salon Today refreshes from the authoritative Salon snapshot without continuous polling',()=>{
  assert.match(source,/window\.__dabbirSalonMode/);
  assert.match(source,/salon\.refresh\(\)/);
  assert.match(source,/visibilitychange/);
  assert.match(source,/pageshow/);
  assert.match(source,/baseShowScreen/);
  assert.match(source,/baseRenderAllSalonFreshness/);
  assert.match(source,/data-salon-live-refresh/);
  assert.match(source,/SALON_REFRESH_STALE_MS=8000/);
  assert.doesNotMatch(source,/setInterval\s*\(/);
});

test('navigation bridge still exposes its canonical route marker with Salon freshness included',async()=>{
  const res=response();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['x-dabbir-navigation-event-bridge'],'v6-real-iphone-touch');
  assert.match(res.body,/salon_snapshot_refresh_event_scoped:true/);
  assert.match(res.body,/salon_manual_refresh_control:true/);
});
