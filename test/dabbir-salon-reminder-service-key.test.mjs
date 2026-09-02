import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adminRpcHeaders } from '../api/salon-reminders-cron.js';

const cron=fs.readFileSync(new URL('../api/salon-reminders-cron.js',import.meta.url),'utf8');
const serviceConnection=fs.readFileSync(new URL('../api/_whatsapp-service-connection.js',import.meta.url),'utf8');

test('opaque Supabase service keys never enter user JWT bearer paths',()=>{
  const opaque=adminRpcHeaders('opaque-service-key');
  assert.equal(opaque.apikey,'opaque-service-key');
  assert.equal(opaque.authorization,undefined);
  assert.match(serviceConnection,/supabaseKeyHeaders\(key/);
  assert.doesNotMatch(serviceConnection,/\bsupabaseRest\(/);
  assert.match(cron,/loadBusinessConnectionWithServiceKey\(key,item\.business_id\)/);
  assert.doesNotMatch(cron,/\bloadBusinessConnection\(key,item\.business_id\)/);
});

test('legacy JWT-shaped service keys retain compatibility only when actually JWT-shaped',()=>{
  const legacy=adminRpcHeaders('legacy.jwt.value');
  assert.equal(legacy.authorization,'Bearer legacy.jwt.value');
});
