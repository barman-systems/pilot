import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import salonModeUiHandler from '../api/salon-mode-ui.js';
import {applySalonProductModelPatches} from '../api/salon-product-model-ui-patches.js';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function captureResponse(){return {statusCode:200,headers:{},body:'',status(code){this.statusCode=Number(code);return this},setHeader(key,value){this.headers[String(key).toLowerCase()]=value;return this},send(body=''){this.body=String(body);return this},end(body=''){this.body=String(body);return this}}}
function emittedSalon(){const res=captureResponse();salonModeUiHandler({method:'GET'},res);assert.equal(res.statusCode,200);return res.body}

test('Salon data model keeps services standalone and assigns them to employees through worker_services',()=>{
  const api=read('api/salon-operations.js');
  const migration=read('supabase/migrations/20260831090000_dabbir_salon_mode_p0.sql');
  assert.match(migration,/create table if not exists public\.dabbir_worker_services/);
  assert.match(migration,/join public\.dabbir_worker_services ws[\s\S]+ws\.worker_id=p_worker_id[\s\S]+ws\.active/);
  assert.match(api,/action==='assign_worker_service'/);
  const serviceBlock=api.slice(api.indexOf("if(action==='save_service')"),api.indexOf("if(action==='save_waitlist')"));
  assert.doesNotMatch(serviceBlock,/worker_id/,'creating a service must not require an employee');
});

test('Salon quick booking is employee-first and services are filtered by that employee',()=>{
  const patched=applySalonProductModelPatches(emittedSalon());
  const booking=patched.slice(patched.indexOf('function openQuickBooking()'),patched.indexOf('function transitionButtons'));
  assert.ok(booking.indexOf('id="sqWorker"')<booking.indexOf('id="sqService"'),'employee selector must appear before service selector');
  assert.match(booking,/q\('#sqWorker'\)\.onchange=syncServices/);
  assert.match(booking,/x\.worker_id===wid&&x\.active/);
  assert.match(booking,/services\.filter\(s=>allowed\.has\(s\.id\)\)/);
  assert.doesNotMatch(booking,/q\('#sqService'\)\.onchange=syncWorkers/);
});

test('New employee form can assign multiple existing services at creation time',()=>{
  const patched=applySalonProductModelPatches(emittedSalon());
  const team=patched.slice(patched.indexOf('function renderTeam()'),patched.indexOf('function workerRow'));
  assert.match(team,/data-new-worker-service=/);
  assert.match(team,/qa\('\[data-new-worker-service\]:checked'\)/);
  assert.match(team,/action:'assign_worker_service'/);
  assert.match(team,/worker_id:workerId/);
});

test('Salon setup messages describe the real business state instead of reversing ownership',()=>{
  const patched=applySalonProductModelPatches(emittedSalon());
  assert.match(patched,/employeeRequired:'أضيفي موظفة أولًا\.'/);
  assert.match(patched,/serviceCatalogRequired:'أضيفي خدمة أولًا\.'/);
  assert.match(patched,/employeeServicesRequired:'أسندي خدمة واحدة على الأقل للموظفة من شاشة الموظفات\.'/);
  assert.doesNotMatch(patched,/أضيفي خدمة واربطيها بموظفة أولًا/);
});

test('Salon month snapshot stays within the API 45-day maximum',()=>{
  const patched=applySalonProductModelPatches(emittedSalon());
  assert.match(patched,/const monthStart=startWeek\(new Date\(cursor\.getFullYear\(\),cursor\.getMonth\(\),1\)\)/);
  assert.match(patched,/view==='month'\?plus\(monthStart,42\)/);
  assert.doesNotMatch(patched,/view==='month'\?45/);
});
