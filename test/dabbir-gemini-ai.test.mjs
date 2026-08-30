import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDABBIRAiReply, getDABBIRAiConfig } from '../api/_ai-core.js';

test('Gemini free tier is primary when GEMINI_API_KEY is configured', async () => {
  const config = getDABBIRAiConfig({
    GEMINI_API_KEY: 'test-gemini-key',
    GROQ_API_KEY: 'test-groq-key',
    VERCEL_ENV: 'production',
  });

  assert.equal(config.provider, 'google-gemini');
  assert.equal(config.model, 'gemini-3.7-flash');
  assert.equal(config.configured, true);
  assert.equal(config.cost_mode, 'FREE_TIER_ONLY');
});

test('Gemini uses Google OpenAI-compatible endpoint and DABBIR grounding prompt', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          model: 'gemini-3.7-flash',
          choices: [{ message: { content: 'أكيد، أقدر أساعدك في الطلب.' } }],
        };
      },
    };
  };

  const result = await generateDABBIRAiReply({
    project: 'dabbir_businesses',
    message: 'أريد أعرف حالة طلبي',
    language: 'ar',
    env: { GEMINI_API_KEY: 'test-gemini-key' },
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'google-gemini');
  assert.equal(result.model, 'gemini-3.7-flash');
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer test-gemini-key');
  assert.equal(request.body.model, 'gemini-3.7-flash');
  assert.match(request.body.messages[0].content, /Never invent or guess phone numbers/);
  assert.match(request.body.messages[0].content, /Gulf-friendly Arabic/);
});

test('Gemini failure falls back to existing free provider when available', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (url.includes('generativelanguage.googleapis.com')) {
      return { ok: false, status: 429, async json() { return { error: { message: 'quota' } }; } };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { model: 'openai/gpt-oss-20b', choices: [{ message: { content: 'تم التحويل للمزود الاحتياطي بأمان.' } }] };
      },
    };
  };

  const result = await generateDABBIRAiReply({
    project: 'dabbir_businesses',
    message: 'مرحبا',
    language: 'ar',
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      GROQ_API_KEY: 'test-groq-key',
    },
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'groq');
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.match(calls[1].url, /api\.groq\.com/);
});
