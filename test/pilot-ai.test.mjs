import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDABBIRAiReply, getDABBIRAiConfig } from '../api/_ai-core.js';

test('free Groq AI is fail-closed when key is missing outside Vercel', async () => {
  const config = getDABBIRAiConfig({});
  assert.equal(config.provider, 'groq');
  assert.equal(config.model, 'openai/gpt-oss-20b');
  assert.equal(config.configured, false);
  assert.equal(config.cost_mode, 'FREE_TIER_ONLY');

  const result = await generateDABBIRAiReply({ project: 'pilot_clinics', message: 'أريد موعد غداً', env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'UNCONFIGURED');
  assert.equal(result.error, 'groq_api_key_missing');
});

test('Vercel AI Gateway uses OIDC environment token when present', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'أكيد، أقدر أساعدك في تجهيز طلب موعد باجر العصر.' } }] }; } };
  };

  const result = await generateDABBIRAiReply({
    project: 'pilot_clinics',
    message: 'ابا موعد باجر العصر',
    language: 'ar',
    env: { VERCEL_ENV: 'production', VERCEL_OIDC_TOKEN: 'test-oidc-token' },
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'vercel-ai-gateway');
  assert.equal(result.auth_mode, 'OIDC_ENV');
  assert.equal(request.options.headers.authorization, 'Bearer test-oidc-token');
});

test('Vercel AI Gateway resolves Project OIDC token at runtime when env token is absent', async () => {
  let request;
  let oidcCalls = 0;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'هلا، حاضر. أقدر أساعدك في طلب الموعد بدون ادعاء أن الحجز تم.' } }] }; } };
  };

  const result = await generateDABBIRAiReply({
    project: 'pilot_clinics',
    message: 'هلا، ابا موعد باجر العصر',
    language: 'ar',
    env: { VERCEL_ENV: 'production' },
    oidcGetter: async () => { oidcCalls += 1; return 'runtime-project-oidc-token'; },
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.auth_mode, 'VERCEL_PROJECT_OIDC');
  assert.equal(oidcCalls, 1);
  assert.equal(request.url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer runtime-project-oidc-token');
  assert.equal(request.body.model, getDABBIRAiConfig({ VERCEL_ENV: 'production' }).model);
  assert.match(request.body.messages[0].content, /Gulf-friendly Arabic/);
});

test('Vercel Gateway fails closed when Project OIDC resolution returns no token', async () => {
  let providerCalled = false;
  const result = await generateDABBIRAiReply({
    project: 'pilot_clinics',
    message: 'هلا',
    env: { VERCEL_ENV: 'production' },
    oidcGetter: async () => undefined,
    fetchImpl: async () => { providerCalled = true; throw new Error('provider must not be called'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'UNCONFIGURED');
  assert.equal(result.error, 'gateway_credential_missing');
  assert.equal(result.auth_mode, 'MISSING');
  assert.equal(providerCalled, false);
});

test('free Groq AI uses configured model and returns provider output', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'أكيد، أقدر أساعدك في طلب الموعد.' } }] }; } };
  };

  const result = await generateDABBIRAiReply({
    project: 'pilot_clinics',
    message: 'أريد موعد غداً',
    language: 'ar',
    env: { GROQ_API_KEY: 'test-only-key', DABBIR_AI_MODEL: 'openai/gpt-oss-20b' },
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'groq');
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer test-only-key');
  assert.match(request.body.messages[0].content, /Never invent or guess phone numbers/);
});

test('invented business contact details are blocked after model generation', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, async json() { return { choices: [{ message: { content: 'اتصل على +971 4 123 4567 أو احجز عبر www.fakeclinic.ae وسنؤكد الموعد.' } }] }; } });
  const result = await generateDABBIRAiReply({ project: 'pilot_clinics', message: 'أريد حجز موعد', language: 'ar', env: { GROQ_API_KEY: 'test-only-key' }, fetchImpl: fakeFetch });
  assert.equal(result.ok, true);
  assert.equal(result.guarded, true);
  assert.doesNotMatch(result.reply, /971|fakeclinic/);
  assert.match(result.reply, /لن (?:أخترع|أخمّن)/);
});

test('unsupported DABBIR project is rejected before provider call', async () => {
  let called = false;
  const result = await generateDABBIRAiReply({ project: 'zajel', message: 'hello', env: { GROQ_API_KEY: 'test-only-key' }, fetchImpl: async () => { called = true; throw new Error('must not call'); } });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'REJECTED');
  assert.equal(called, false);
});
