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

test('Salon data model keeps services standalone and employee-service assignment remains optional metadata',()=>{
  const api=read('api/salon-operations.js');
  const migration=read('supabase/migrations/20260831090000_dabbir_salon_mode_p0.sql');
  assert.match(migration,/create table if not exists public\.dabbir_worker_services/);
  assert.match(api,/action==='assign_worker_service'/);
  const serviceBlock=api.slice(api.indexOf("if(action==='save_service')"),api.indexOf("if(action==='save_waitlist')"));
  assert.doesNotMatch(serviceBlock,/worker_id/,'creating a service must not require an employee');
});

test('Salon quick booking opens with no employees, services, customer details, or selected time',()=>{
  const patched=applySalonProductModelPatches(emittedSalon());
  const booking=patched.slice(patched.indexOf('function openQuickBooking()'),patched.indexOf('function transitionButtons'));
  assert.doesNotMatch(booking,/notify\(t\.employeeRequired\)/);
  assert.doesNotMatch(booking,/notify\(t\.serviceCatalogRequired\)/);
  assert.doesNotMatch(booking,/notify\(t\.employeeServicesRequired\)/);
  assert.doesNotMatch(booking,/id="sqName"[^>]*required/);
  assert.doesNotMatch(booking,/id="sqPhone"[^>]*required/);
  assert.doesNotMatch(booking,/id="sqWorker"[^>]*required/);
  assert.doesNotMatch(booking,/id="sqService"[^>]*required/);
  assert.doesNotMatch(booking,/id="sqTime"[^>]*required/);
  assert.match(booking,/starts_at:q\('#sqTime'\)\.value\?new Date\(q\('#sqTime'\)\.value\)\.toISOString\(\):null/);
  assert.doesNotMatch(booking,/worker_services.*filter/);
});

test('Salon quick-book RPC accepts customer, service, worker, and time as optional inputs',()=>{
  const migration=read('supabase/migrations/20260902220500_dabbir_salon_booking_no_prerequisites_v1.sql');
  assert.match(migration,/p_customer_name text default ''/);
  assert.match(migration,/p_service_id uuid default null/);
  assert.match(migration,/p_worker_id uuid default null/);
  assert.match(migration,/p_starts_at timestamptz default null/);
  assert.match(migration,/v_start timestamptz := coalesce\(p_starts_at,now\(\)\+interval '30 minutes'\)/);
  assert.match(migration,/if v_service_id is not null then[\s\S]+insert into public\.dabbir_appointment_services/);
  assert.doesNotMatch(migration,/WORKER_SERVICE_NOT_AVAILABLE/);
});

test('Unassigned salon bookings remain visible in day and week calendars',()=>{
  const patched=applySalonProductModelPatches(emittedSalon());
  assert.match(patched,/unassigned:'غير مسند'/);
  const day=patched.slice(patched.indexOf('function dayCalendar()'),patched.indexOf('function weekCalendar()'));
  const week=patched.slice(patched.indexOf('function weekCalendar()'),patched.indexOf('function monthCalendar()'));
  assert.match(day,/hasUnassigned=rows\.some\(a=>!a\.worker_id\)/);
  assert.match(day,/w\.unassigned\?!a\.worker_id:a\.worker_id===w\.id/);
  assert.match(week,/unassigned=dayRows\.filter\(a=>!a\.worker_id\)/);
  assert.match(week,/t\.unassigned/);
});

test('New employee form can assign multiple existing services at creation time',()=>{
  const patched=applySalonProductModelPatches(emittedSalon());
  const team=patched.slice(patched.indexOf('function renderTeam()'),patched.indexOf('function workerRow'));
  assert.match(team,/data-new-worker-service=/);
  assert.match(team,/qa\('\[data-new-worker-service\]:checked'\)/);
  assert.match(team,/action:'assign_worker_service'/);
  assert.match(team,/worker_id:workerId/);
});

test('Salon setup messages no longer block quick booking',()=>{
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
