import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePilotAiReply, getPilotAiConfig } from '../api/_ai-core.js';

test('free Groq AI is fail-closed when key is missing outside Vercel', async () => {
  const config = getPilotAiConfig({});
  assert.equal(config.provider, 'groq');
  assert.equal(config.model, 'openai/gpt-oss-20b');
  assert.equal(config.configured, false);
  assert.equal(config.cost_mode, 'FREE_TIER_ONLY');

  const result = await generatePilotAiReply({
    project: 'pilot_clinics',
    message: 'أريد موعد غداً',
    env: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'UNCONFIGURED');
  assert.equal(result.error, 'groq_api_key_missing');
});

test('Vercel AI Gateway fallback works when Groq secret is absent', async () => {
  let request;
  const result = await generatePilotAiReply({
    project: 'pilot_clinics',
    message: 'ابا موعد باجر العصر',
    language: 'ar',
    env: { VERCEL_ENV: 'production' },
    gatewayGenerateImpl: async (options) => {
      request = options;
      return { text: 'أكيد، أقدر أساعدك في تجهيز طلب موعد باجر العصر، لكن ما أقدر أؤكد التوفر قبل التحقق من التقويم.' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'vercel-ai-gateway');
  assert.equal(result.model, 'inclusionai/ling-3.0-tiny-free');
  assert.match(result.reply, /موعد/);
  assert.equal(result.guarded, false);
  assert.equal(request.model, 'inclusionai/ling-3.0-tiny-free');
  assert.match(request.system, /Gulf-friendly Arabic/);
  assert.equal(request.providerOptions.gateway.disallowPromptTraining, true);
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
  assert.equal(result.model, 'openai/gpt-oss-20b');
  assert.match(result.reply, /الموعد/);
  assert.equal(result.guarded, false);
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.body.model, 'openai/gpt-oss-20b');
  assert.equal(request.options.headers.authorization, 'Bearer test-only-key');
  assert.match(request.body.messages[0].content, /Never invent or guess phone numbers/);
});

test('invented business contact details are blocked after model generation', async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{
          message: {
            content: 'اتصل على +971 4 123 4567 أو احجز عبر www.fakeclinic.ae وسنؤكد الموعد.',
          },
        }],
      };
    },
  });

  const result = await generatePilotAiReply({
    project: 'pilot_clinics',
    message: 'أريد حجز موعد',
    language: 'ar',
    env: { GROQ_API_KEY: 'test-only-key' },
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'SUCCESS');
  assert.equal(result.guarded, true);
  assert.equal(result.grounding_state, 'UNVERIFIED_BUSINESS_CONTACT_BLOCKED');
  assert.doesNotMatch(result.reply, /971/);
  assert.doesNotMatch(result.reply, /fakeclinic/);
  assert.match(result.reply, /لن أخترع/);
});

test('unsupported PILOT project is rejected before provider call', async () => {
  let called = false;
  const result = await generatePilotAiReply({
    project: 'zajel',
    message: 'hello',
    env: { GROQ_API_KEY: 'test-only-key' },
    fetchImpl: async () => { called = true; throw new Error('must not call'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'REJECTED');
  assert.equal(called, false);
});
