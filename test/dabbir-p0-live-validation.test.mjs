import assert from 'node:assert/strict';
import test from 'node:test';

const MODULE = '../api/dabbir-p0-live-validation.js';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

async function load() {
  return (await import(`${MODULE}?test=${Date.now()}-${Math.random()}`)).default;
}

test('P0 validation probe is invisible outside its exact preview branch', async () => {
  const previous = { env: process.env.VERCEL_ENV, ref: process.env.VERCEL_GIT_COMMIT_REF };
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL_GIT_COMMIT_REF = 'main';
  const res = response();
  await (await load())({ method: 'GET' }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'NOT_FOUND');
  previous.env === undefined ? delete process.env.VERCEL_ENV : process.env.VERCEL_ENV = previous.env;
  previous.ref === undefined ? delete process.env.VERCEL_GIT_COMMIT_REF : process.env.VERCEL_GIT_COMMIT_REF = previous.ref;
});

test('P0 validation probe fails closed when Preview still targets a non-test database', async () => {
  const names = ['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','SUPABASE_URL','SUPABASE_DATA_URL','DABBIR_WHATSAPP_ACCESS_TOKEN','DABBIR_WHATSAPP_PHONE_NUMBER_ID','DABBIR_WHATSAPP_TEST_RECIPIENT'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_GIT_COMMIT_REF = 'feat/dabbir-market-reality-killer-job';
  process.env.SUPABASE_URL = 'https://production-ref.supabase.co';
  process.env.SUPABASE_DATA_URL = 'https://production-ref.supabase.co';
  delete process.env.DABBIR_WHATSAPP_ACCESS_TOKEN;
  delete process.env.DABBIR_WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.DABBIR_WHATSAPP_TEST_RECIPIENT;
  const res = response();
  await (await load())({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.database_target, 'non_test_database_blocked');
  assert.equal(res.body.database_safe_for_test_execution, false);
  assert.equal(res.body.live_execution_allowed, false);
  assert.equal(res.body.secrets_exposed, false);
  assert.equal(JSON.stringify(res.body).includes('production-ref'), false);
  for (const name of names) previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name];
});
