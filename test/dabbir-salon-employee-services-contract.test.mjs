import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {applySalonBookingContractPatch} from '../api/salon-booking-contract-patch.js';

const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'api/salon-mode-ui.js'),'utf8');
const patched=applySalonBookingContractPatch(source);

test('Salon booking chooses employee first and then only that employee services',()=>{
  assert.match(patched,/workerSelect\.innerHTML=.*workers\.map/);
  assert.match(patched,/filter\(x=>x\.worker_id===wid&&x\.active\)/);
  assert.match(patched,/eligible=services\.filter\(s=>allowed\.has\(s\.id\)\)/);
  assert.match(patched,/workerSelect\.onchange=syncServices/);
  assert.doesNotMatch(patched,/q\('#sqService'\)\.onchange=syncWorkers/);
  assert.match(patched,/insertBefore\(workerField,serviceField\)/);
});

test('Services remain standalone and worker assignment stays many-to-many',()=>{
  assert.match(source,/action:'save_service'/);
  assert.doesNotMatch(source,/action:'save_service'[^\n]*worker_id/);
  assert.match(source,/action:'assign_worker_service',worker_id:workerId,service_id:input\.dataset\.assignService/);
});

test('Salon month snapshot stays inside API date-range guard',()=>{
  assert.match(patched,/monthStart=startWeek\(new Date\(cursor\.getFullYear\(\),cursor\.getMonth\(\),1\)\)/);
  assert.match(patched,/to=view==='month'\?plus\(monthStart,42\)/);
  assert.doesNotMatch(patched,/view==='month'\?45/);
});

test('Empty-state language describes employee service ownership instead of service owning employee',()=>{
  assert.match(patched,/أضيفي موظفة وحددي الخدمات التي تقدمها/);
  assert.match(patched,/Add an employee, assign the services they provide/);
  assert.doesNotMatch(patched,/أضيفي خدمة واربطيها بموظفة أولًا/);
});
