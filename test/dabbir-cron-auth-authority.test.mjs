import test from 'node:test';
import assert from 'node:assert/strict';
import reminder from '../api/salon-reminders-cron.js';
import calendar from '../api/calendar-outbox-cron.js';
import whatsapp from '../api/dabbir-whatsapp-ai-cron.js';
import daily from '../api/dabbir-daily-operator-cron.js';
import billing from '../api/dabbir-ai-billing-reconcile-cron.js';
import recovery from '../api/dabbir-ai-provider-recovery-cron.js';
import intelligence from '../api/dabbir-intelligence-maintenance-cron.js';
import composio from '../api/dabbir-composio-readiness-cron.js';
import executive from '../api/barman-executive-cron.js';

test('every cron handler rejects spoofed scheduler identity before any external call',async()=>{
 const prior={secret:process.env.CRON_SECRET,environment:process.env.VERCEL_ENV,fetch:globalThis.fetch};
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unauthorized external call');};
 const handlers=[reminder,calendar,whatsapp,daily,billing,recovery,intelligence,composio,executive];
 try {
  process.env.VERCEL_ENV='production';
  for(const secret of [undefined,'configured-cron-secret']){
   if(secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=secret;
   for(const handler of handlers)for(const schedule of ['*/2 * * * *','*/5 * * * *','15 5 * * *','23 2 * * *','17 * * * *']){
    const res={statusCode:null,setHeader(){return this;},end(body){this.body=JSON.parse(body);}};
    await handler({method:'GET',headers:{'user-agent':'vercel-cron/1.0','x-vercel-cron-schedule':schedule,authorization:'Bearer forged'}},res);
    assert.equal(res.statusCode,401);assert.equal(res.body.ok,false);
   }
  }
  assert.equal(calls,0);
 } finally {
  globalThis.fetch=prior.fetch;
  if(prior.secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prior.secret;
  if(prior.environment===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior.environment;
 }
});