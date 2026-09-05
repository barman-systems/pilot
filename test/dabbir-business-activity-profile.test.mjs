import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import businessActivityProfileUiHandler from '../api/business-activity-profile-ui.js';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

function responseCapture(){
  return {
    statusCode:200,headers:{},body:'',
    status(code){this.statusCode=Number(code||200);return this},
    setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},
    end(body=''){this.body=String(body);return this},
    send(body=''){this.body=String(body);return this},
  };
}

test('activity-specific business UI compiles and removes delivery from salon mode',async()=>{
  const response=responseCapture();
  await businessActivityProfileUiHandler({method:'GET'},response);
  assert.equal(response.statusCode,200);
  assert.match(response.body,/delivery_policy/);
  assert.match(response.body,/hideDelivery/);
  assert.match(response.body,/salon/);
  assert.match(response.body,/تفاصيل الصالون/);
  assert.doesNotThrow(()=>new Function(response.body));
});

test('generic services profile asks only for missing owner-specific instructions',()=>{
  const source=read('api/business-activity-profile-ui.js');
  assert.match(source,/services:\{[\s\S]*?fields:\['customer_requirements','activity_operations'\]/);
  assert.match(source,/دبّر يقرأ الخدمات والأسعار ومدة كل خدمة تلقائيًا من قسم الخدمات/);
  assert.match(source,/تعليمات خاصة/);
});

test('car wash profile avoids worker selection and service-zone concepts',()=>{
  const source=read('api/business-activity-profile-ui.js');
  assert.match(source,/car_wash/);
  assert.match(source,/الخدمات والباقات والأسعار/);
  assert.doesNotMatch(source,/مناطق الخدمة|service zones?/i);
  assert.doesNotMatch(source,/اختيار العامل|select worker|worker selection/i);
});

test('activity profile persists only approved whitelisted knowledge keys',()=>{
  const source=read('api/business-activity-profile.js');
  for(const key of ['service_catalog','pricing_notes','team_specialists','appointment_details','customer_requirements','activity_operations'])assert.match(source,new RegExp(key));
  assert.match(source,/source:'owner_approved'/);
  assert.match(source,/status:'approved'/);
  assert.doesNotMatch(source,/service_role|supabase_service_role/i);
});

test('activity UI is aggregated through existing calendar bundle instead of adding a shell module',()=>{
  const calendar=read('api/calendar-live-ui.js');
  const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));
  assert.match(calendar,/business-activity-profile-ui/);
  assert.equal([...manifest.critical,...manifest.deferred].length,26);
  assert.equal(manifest.deferred.includes('/api/business-activity-profile-ui'),false);
});