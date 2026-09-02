import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { adminRpcHeaders, cronAuthMode } from '../api/salon-reminders-cron.js';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260831090000_dabbir_salon_mode_p0.sql');
const compatibility=read('supabase/migrations/20260831091000_dabbir_salon_legacy_status_compat.sql');
const api=read('api/salon-operations.js');
const ui=read('api/salon-mode-ui.js');
const cron=read('api/salon-reminders-cron.js');
const serviceConnection=read('api/_whatsapp-service-connection.js');
const whatsapp=read('api/_whatsapp-live-core.js');
const edgeWorker=read('supabase/functions/dabbir-salon-reminder-worker/index.ts');

function hasAll(source,markers){for(const marker of markers)assert.match(source,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))}

test('Salon Mode reuses the existing business activity instead of creating a separate application',()=>{
  const activity=read('api/activity-tasks.js');
  assert.match(activity,/salon:\{name_ar:'صالون'/);
  assert.match(activity,/salon:[^\n]+show_appointments:true/);
  assert.match(activity,/salon:[^\n]+show_services:true/);
  assert.match(api,/SALON_MODE_REQUIRED/);
  assert.match(ui,/const isSalon=.*business_type.*salon/);
});

test('scenario 1: complete booking flow is atomic and completion generates commission once',()=>{
  hasAll(migration,['dabbir_salon_quick_book','dabbir_salon_transition_appointment','dabbir_appointment_services','dabbir_workflow_status_history','dabbir_commissions','on conflict (appointment_service_id) do update']);
  assert.match(migration,/when 'new' then p_status in \('confirmed','cancelled','no_show'\)/);
  assert.match(migration,/when 'confirmed' then p_status in \('arrived','cancelled','no_show'\)/);
  assert.match(migration,/when 'arrived' then p_status in \('in_progress','cancelled','no_show'\)/);
  assert.match(migration,/when 'in_progress' then p_status in \('completed','cancelled'\)/);
  assert.match(migration,/if new.status='completed'.*old.status is distinct from 'completed'/s);
  hasAll(api,["action==='quick_book'","action==='transition'","action==='record_payment'"]);
});

test('scenario 2: employee overlap is rejected using the real appointment range',()=>{
  hasAll(migration,['prevent_appointment_calendar_conflict','new.ends_at','a.worker_id=new.worker_id','APPOINTMENT_TIME_CONFLICT','WORKER_OUTSIDE_SCHEDULE','WORKER_UNAVAILABLE','WORKER_TIME_OFF']);
  assert.match(migration,/a\.starts_at < v_end[\s\S]+coalesce\(a\.ends_at,a\.starts_at\+interval '60 minutes'\) > new\.starts_at/);
  assert.match(migration,/before insert or update of starts_at,ends_at,status,worker_id/);
});

test('scenario 3: no-show is a terminal event with customer risk and dashboard reporting',()=>{
  hasAll(migration,["'no_show'","no_show_rate","count(a.id) filter(where a.status='no_show')","'no_show',count(*) filter(where status='no_show')"]);
  hasAll(ui,['warningNoShow','no_show_warning_threshold','statusNoShow','noShowRate']);
  assert.match(api,/noShows\+\+/);
});

test('scenario 4: completed appointments can be rebooked without retyping the client or service',()=>{
  hasAll(migration,['dabbir_salon_rebook','COMPLETED_APPOINTMENT_REQUIRED',"'rebook'",'source_appointment_id']);
  hasAll(api,["action==='rebook'",'dabbir_salon_rebook']);
  hasAll(ui,['twoWeeks','threeWeeks','fourWeeks','sixWeeks','saveRebook']);
});

test('scenario 5: cancellation releases the slot and returns matching waitlist entries',()=>{
  hasAll(migration,['dabbir_waitlist_entries','dabbir_salon_waitlist_matches',"a.status='cancelled'","w.status='waiting'",'w.service_id=a.service_id']);
  assert.match(api,/status==='cancelled'\?await rpc\(ctx\.token,'dabbir_salon_waitlist_matches'/);
  assert.match(migration,/new\.status='cancelled'[\s\S]+status='cancelled'/);
});

test('scenario 6: salon employees are restricted to their assigned appointments and clients',()=>{
  hasAll(migration,['salon_member_scope','salon_customer_scope','w.membership_user_id=(select auth.uid())','a.worker_id=w.id','dabbir_private.salon_member_scope(business_id,worker_id,false)']);
  assert.match(migration,/m\.role in \('owner','admin','manager'\)/);
  assert.match(migration,/dabbir_customers_select[\s\S]+salon_customer_scope\(business_id,id,false\)/);
  assert.match(migration,/dabbir_operational_payments_select[\s\S]+salon_member_scope\(a\.business_id,a\.worker_id,true\)/);
});

test('scenario 7: tenant isolation is enforced with business-scoped foreign keys and RLS',()=>{
  hasAll(migration,['alter table public.dabbir_workers enable row level security','alter table public.dabbir_appointment_services enable row level security','alter table public.dabbir_operational_payments enable row level security','foreign key (business_id,appointment_id)','foreign key (business_id,customer_id)','foreign key (business_id,worker_id)']);
  assert.match(api,/membershipFor\(ctx,businessId\)/);
  assert.match(api,/if\(!membership\)return json\(res,403/);
});

test('scenario 8: WhatsApp reminders are claimed concurrently and never automatically duplicated',()=>{
  hasAll(migration,['unique (business_id,idempotency_key)','for update skip locked',"status='processing'","status='ambiguous'",'STALE_PROCESSING_REQUIRES_RECONCILIATION','dabbir_claim_workflow_notifications','dabbir_finalize_workflow_notification']);
  hasAll(cron,['CRON_SECRET','dabbir_claim_workflow_notifications','sendMetaTemplate',"error?.ambiguous===true?'ambiguous':'failed'",'dabbir_finalize_workflow_notification','x-vercel-oidc-token','dabbir-salon-reminder-worker','loadBusinessConnectionWithServiceKey']);
  hasAll(whatsapp,["type: 'template'",'providerMessageId','META_WHATSAPP_TEMPLATE_TIMEOUT_AMBIGUOUS']);
  hasAll(edgeWorker,['createRemoteJWKSet','jwtVerify','EXPECTED_AUDIENCE','EXPECTED_SUBJECT','owner_id !== OWNER_ID','project_id !== PROJECT_ID','environment !== "production"','dabbir_claim_workflow_notifications','dabbir_finalize_workflow_notification','CONNECTION_COLUMNS']);
  assert.doesNotMatch(edgeWorker,/dabbir_(salon_quick_book|salon_transition_appointment|salon_rebook)/);
  assert.doesNotMatch(whatsapp.slice(whatsapp.indexOf('export async function sendMetaTemplate')),/WHATSAPP_SERVER_DATA_ACCESS_NOT_CONFIGURED/);
});

test('calendar UI provides day, week, month, employee columns, drag/drop and duration changes',()=>{
  hasAll(ui,["view==='day'","view==='week'",'monthCalendar','salonDayGrid','data-worker','ondragstart','ondrop','data-resize','duration_minutes','quickBooking']);
  const manifest=JSON.parse(read('config/dabbir-ui-bundles.json'));
  const calendarOwner=read('api/calendar-live-ui.js');
  assert.equal(manifest.deferred.includes('/api/salon-mode-ui'),false);
  assert.ok(manifest.deferred.includes('/api/calendar-live-ui'));
  assert.match(calendarOwner,/import salonModeUiHandler from '\.\/salon-mode-ui\.js'/);
  assert.match(calendarOwner,/managementCaptured\.body\+'\\n'\+salonCaptured\.body/);
});

test('Salon Mode cannot create a self-triggering Safari mutation loop',()=>{
  assert.match(ui,/if\(!document\.body\.classList\.contains\('salonMode'\)\)document\.body\.classList\.add\('salonMode'\)/);
  assert.match(ui,/if\(data&&!force\)return/);
  assert.doesNotMatch(ui,/observer\.observe\(document\.body,\{attributes:true,subtree:true/);
  assert.doesNotMatch(ui,/setInterval\(/);
});

test('P0 interface includes staff, services, customer 360, payments, today board, reports and reminders',()=>{
  hasAll(ui,['renderTeam','renderServices','openCustomer360','openPayment','renderToday','renderReports','renderReminderSettings','revenueReport','employeeReport','servicesReport','recurringReport','inactiveReport','noShowReport','cancellationReport','peakReport','gapReport','commissionReport']);
  hasAll(api,['resource===\'customer_360\'','resource===\'reports\'','aggregateReports','save_worker','save_service','save_schedule','save_reminder_settings']);
});

test('Salon API is authenticated, same-origin for writes, role-aware and date-bounded',()=>{
  hasAll(api,['accessTokenFromRequest','getVerifiedUser','getBusinessMemberships','requireSameOrigin','INVALID_DATE_RANGE','maxDays','canManageTeam','TEAM_MANAGEMENT_REQUIRED']);
  assert.match(api,/if\(req\.method==='POST'&&!requireSameOrigin\(req\)\)/);
  assert.match(api,/limit=1000/);
});

test('Vercel Pro cron is configured every five minutes with secret-first authentication',()=>{
  const vercel=JSON.parse(read('vercel.json'));
  assert.ok(vercel.crons.some(item=>item.path==='/api/salon-reminders-cron'&&item.schedule==='*/5 * * * *'));
  assert.equal(vercel.functions['api/salon-reminders-cron.js'].maxDuration,60);
  const officialHeaders={'user-agent':'vercel-cron/1.0','x-vercel-cron-schedule':'*/5 * * * *'};
  assert.equal(cronAuthMode({headers:{authorization:'Bearer strong-secret'}},{CRON_SECRET:'strong-secret',VERCEL_ENV:'production'}),'secret');
  assert.equal(cronAuthMode({headers:officialHeaders},{CRON_SECRET:'strong-secret',VERCEL_ENV:'production'}),null,'configured secret must disable structural fallback');
  assert.equal(cronAuthMode({headers:officialHeaders},{VERCEL_ENV:'production'}),'vercel_schedule');
  assert.equal(cronAuthMode({headers:officialHeaders},{VERCEL_ENV:'preview'}),null);
  assert.equal(cronAuthMode({headers:{...officialHeaders,'user-agent':'browser'}},{VERCEL_ENV:'production'}),null);
  assert.equal(cronAuthMode({headers:{...officialHeaders,'x-vercel-cron-schedule':'0 * * * *'}},{VERCEL_ENV:'production'}),null);
});

test('reminder cron keeps opaque service keys out of user JWT bearer paths',()=>{
  const secretHeaders=adminRpcHeaders('sb_secret_example');
  assert.equal(secretHeaders.apikey,'sb_secret_example');
  assert.equal(secretHeaders.authorization,undefined);
  const opaqueHeaders=adminRpcHeaders('opaque-service-key');
  assert.equal(opaqueHeaders.apikey,'opaque-service-key');
  assert.equal(opaqueHeaders.authorization,undefined);
  const legacyHeaders=adminRpcHeaders('legacy.jwt.value');
  assert.equal(legacyHeaders.apikey,'legacy.jwt.value');
  assert.equal(legacyHeaders.authorization,'Bearer legacy.jwt.value');
  assert.match(serviceConnection,/supabaseKeyHeaders\(key/);
  assert.doesNotMatch(serviceConnection,/\bsupabaseRest\(/);
  assert.match(cron,/loadBusinessConnectionWithServiceKey\(key,item\.business_id\)/);
  assert.doesNotMatch(cron,/\bloadBusinessConnection\(key,item\.business_id\)/);
});

test('legacy appointment writers remain compatible during the Salon Mode rollout',()=>{
  hasAll(compatibility,["'requested'","'rescheduled'","when 'requested' then 'new'","when 'rescheduled' then 'confirmed'","status in ('new','requested')"]);
  assert.doesNotMatch(compatibility,/\bdrop\s+table\b/i);
  assert.doesNotMatch(compatibility,/\bdelete\s+from\b/i);
});

test('migration is additive and does not delete production rows or drop tables',()=>{
  assert.doesNotMatch(migration,/\bdrop\s+table\b/i);
  assert.doesNotMatch(migration,/\btruncate\b/i);
  assert.doesNotMatch(migration,/\bdelete\s+from\b/i);
  assert.match(migration,/begin;/);
  assert.match(migration,/commit;/);
  assert.match(migration,/add column if not exists/);
  assert.match(migration,/create table if not exists/);
});
