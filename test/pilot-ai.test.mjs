import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePilotAiReply, getPilotAiConfig } from '../api/_ai-core.js';

test('free Groq AI is fail-closed when key is missing outside Vercel', async () => {
  const config = getPilotAiConfig({});
  assert.equal(config.provider, 'groq');
  assert.equal(config.model, 'openai/gpt-oss-20b');
  assert.equal(config.configured, false);
  assert.equal(config.cost_mode, 'FREE_TIER_ONLY');

  const result = await generatePilotAiReply({ project: 'pilot_clinics', message: 'أريد موعد غداً', env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'UNCONFIGURED');
  assert.equal(result.error, 'groq_api_key_missing');
});

test('Vercel AI Gateway uses OIDC when Groq secret is absent', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'أكيد، أقدر أساعدك في تجهيز طلب موعد باجر العصر، لكن ما أقدر أؤكد التوفر قبل التحقق من التقويم.' } }] };
      },
    };
  };

  const result = await generatePilotAiReply({
    project: 'pilot_clinics',
    message: 'ابا موعد باجر العصر',
    language: 'ar',
    env: { VERCEL_ENV: 'production', VERCEL_OIDC_TOKEN: 'test-oidc-token' },
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'vercel-ai-gateway');
  assert.equal(result.model, 'minimax/minimax-m2.7-free');
  assert.match(result.reply, /موعد/);
  assert.equal(request.url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer test-oidc-token');
  assert.equal(request.body.model, 'minimax/minimax-m2.7-free');
  assert.match(request.body.messages[0].content, /Gulf-friendly Arabic/);
});

test('Vercel Gateway fails closed when no OIDC or API key exists', async () => {
  const result = await generatePilotAiReply({
    project: 'pilot_clinics',
    message: 'هلا',
    env: { VERCEL_ENV: 'production' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'UNCONFIGURED');
  assert.equal(result.error, 'gateway_credential_missing');
});

test('free Groq AI uses configured model and returns provider output', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'أكيد، أقدر أساعدك في طلب الموعد.' } }] };
      },
    };
  };

  const result = await generatePilotAiReply({
    project: 'pilot_clinics',
    message: 'أريد موعد غداً',
    language: 'ar',
    env: { GROQ_API_KEY: 'test-only-key', PILOT_AI_MODEL: 'openai/gpt-oss-20b' },
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
  const result = await generatePilotAiReply({ project: 'pilot_clinics', message: 'أريد حجز موعد', language: 'ar', env: { GROQ_API_KEY: 'test-only-key' }, fetchImpl: fakeFetch });
  assert.equal(result.ok, true);
  assert.equal(result.guarded, true);
  assert.doesNotMatch(result.reply, /971|fakeclinic/);
  assert.match(result.reply, /لن أخترع/);
});

test('unsupported PILOT project is rejected before provider call', async () => {
  let called = false;
  const result = await generatePilotAiReply({ project: 'zajel', message: 'hello', env: { GROQ_API_KEY: 'test-only-key' }, fetchImpl: async () => { called = true; throw new Error('must not call'); } });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'REJECTED');
  assert.equal(called, false);
});
