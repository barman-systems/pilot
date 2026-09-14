import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PassThrough } from 'node:stream';
import handler,{coordinate} from '../api/public-car-wash.js';

const source=fs.readFileSync(new URL('../booking.html',import.meta.url),'utf8');
function node(){const classes=new Set();return {value:'',disabled:false,textContent:'',innerHTML:'',href:'',open:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){on?classes.add(x):classes.delete(x)}},removeAttribute(name){delete this[name]},setAttribute(name,value){this[name]=value},focus(){},querySelectorAll(){return []}}}
async function fixture(geolocation){
  const nodes=new Map(),requests=[];const q=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)};
  const context=vm.createContext({URLSearchParams,Intl,Date,Number,console,location:{search:'?slug=synthetic-car-wash'},navigator:{geolocation},window:{scrollTo(){}},document:{documentElement:{lang:'ar',dir:'rtl'},querySelector:q,querySelectorAll(){return []}},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>options?.method==='POST'?{ok:true,booking:{id:'synthetic'}}:{ok:true,catalog:{business:{name:'Synthetic'},offers:[]}}}}});
  // Remove only the lexical IIFE boundary so the VM can inspect private state; function bodies are unchanged.
  const shipped=source.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(shipped.replace(/^\s*\(\(\)=>\{/, '').replace(/\}\)\(\);\s*$/, ''),context);
  await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext("vehicle='saloon';offer={id:'40000000-0000-4000-8000-000000000001',name_ar:'غسيل',name_en:'Wash',saloon_price_aed:30};selectedSlot='2026-10-01T10:00:00Z';",context);
  q('#customerName').value='Synthetic User';q('#customerPhone').value='+000000000001';
  return {q,context,requests,run:code=>vm.runInContext(code,context)};
}
test('GPS success sends the actual captured coordinates and accepts a valid equator coordinate',async()=>{
  const f=await fixture({getCurrentPosition(success){success({coords:{latitude:0,longitude:54.1234567}})}});
  f.run('setLocation()');assert.equal(f.q('#submitBtn').disabled,false);await f.run('submit()');
  const body=JSON.parse(f.requests.find(x=>x.options?.method==='POST').options.body);
  assert.equal(body.location_lat,0);assert.equal(body.location_lng,54.123457);
});
for(const scenario of ['denied','unsupported'])test('GPS '+scenario+' opens actionable manual fallback without fabricating a location',async()=>{
  const f=await fixture(scenario==='denied'?{getCurrentPosition(_success,error){error({code:1})}}:undefined);
  f.run('setLocation()');assert.equal(f.run('carLocation'),null);assert.equal(f.q('#manualLocation').open,true);assert.equal(f.q('#submitBtn').disabled,true);
  f.q('#manualCoordinates').value='24.4539, 54.3773';f.run('manualLocation()');
  assert.equal(f.q('#submitBtn').disabled,false);await f.run('submit()');
  const body=JSON.parse(f.requests.find(x=>x.options?.method==='POST').options.body);
  assert.equal(body.location_lat,24.4539);assert.equal(body.location_lng,54.3773);
});
test('missing or malformed required information never enables confirmation',async()=>{
  const f=await fixture();
  for(const raw of ['', '24.4,', ',54.4','91,54','24,181','null,null','0x10,0x20','24 54','NaN,54','near the entrance']){
    f.q('#manualCoordinates').value=raw;f.run('manualLocation()');assert.equal(f.q('#submitBtn').disabled,true,raw);assert.equal(f.run('carLocation'),null,raw);
  }
  f.q('#locationLabel').value='Bay 12 beside the main entrance';f.run('renderSummary()');assert.equal(f.q('#submitBtn').disabled,true,'description cannot replace required coordinates');
});
test('late GPS cannot overwrite a manually selected location; language switching refreshes location state',async()=>{
  let success;const f=await fixture({getCurrentPosition(callback){success=callback}});
  f.run('setLocation()');f.q('#manualCoordinates').value='24.4,54.4';f.run('manualLocation()');success({coords:{latitude:1,longitude:2}});
  assert.equal(f.run('carLocation.lat'),24.4);
  f.run("lang='en';applyLang()");assert.match(f.q('#locationStatus').textContent,/Coordinates entered/);
  f.run("lang='ar';applyLang()");assert.match(f.q('#locationStatus').textContent,/تم إدخال/);
});
test('all public booking copy keys remain bilingual and non-empty',async()=>{
  const f=await fixture();const copies=JSON.parse(f.run('JSON.stringify(copy)'));
  assert.deepEqual(Object.keys(copies.ar).sort(),Object.keys(copies.en).sort());
  for(const values of Object.values(copies))for(const value of Object.values(values))assert.ok(typeof value==='string'&&value.trim());
});
test('API rejects null, blank, boolean, malformed and out-of-range coordinates before RPC',async()=>{
  for(const value of [null,undefined,'',' ',true,false,[],{},'0x10','Infinity','NaN',91])assert.ok(Number.isNaN(coordinate(value,90)),String(value));
  assert.equal(coordinate(0,90),0);assert.equal(coordinate('0',90),0);assert.equal(coordinate('-24.4',90),-24.4);
  for(const value of [null,'',false]){
    const req=new PassThrough();req.method='POST';req.headers={host:'test.invalid',origin:'https://test.invalid'};
    let status,body;const res={set statusCode(x){status=x},setHeader(){},end(x){body=JSON.parse(x)}};
    const promise=handler(req,res);req.end(JSON.stringify({slug:'synthetic-car-wash',offer_id:'40000000-0000-4000-8000-000000000001',vehicle_type:'saloon',starts_at:'2026-10-01T10:00:00Z',customer_name:'Synthetic User',customer_phone:'+000000000001',location_lat:value,location_lng:54}));await promise;
    assert.equal(status,400);assert.equal(body.error,'INVALID_BOOKING_INPUT');
  }
});
