import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDABBIRAiReply, getDABBIRAiConfig, getDABBIRAiRedundancy } from '../api/_ai-core.js';

test('Gateway is primary when configured even when direct provider credentials exist', () => {
  const env = {
    GEMINI_API_KEY: 'test-gemini-key',
    GROQ_API_KEY: 'test-groq-key',
    CLOUDFLARE_API_TOKEN: 'test-cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'account',
    VERCEL_ENV: 'production',
    AI_GATEWAY_API_KEY: 'test-gateway-key',
    DABBIR_AI_GATEWAY_MODEL: 'google/gemini-3.7-flash',
  };
  const config = getDABBIRAiConfig(env);
  const redundancy = getDABBIRAiRedundancy(env);

  assert.equal(config.provider, 'vercel-ai-gateway');
  assert.equal(config.model, 'google/gemini-3.7-flash');
  assert.equal(config.configured, true);
  assert.equal(redundancy.gateway_primary_configured, true);
  assert.equal(redundancy.routing_mode, 'GATEWAY_PRIMARY_DIRECT_RECOVERY');
  assert.equal(redundancy.direct_provider_count, 3);
});

test('Gemini can still operate directly when no Gateway is configured', async () => {
  const config = getDABBIRAiConfig({
    GEMINI_API_KEY: 'test-gemini-key',
    GROQ_API_KEY: 'test-groq-key',
  });

  assert.equal(config.provider, 'google-gemini');
  assert.equal(config.model, 'gemini-3.7-flash');
  assert.equal(config.configured, true);
  assert.equal(config.cost_mode, 'FREE_TIER_ONLY');
});

test('healthy Gateway serves the customer path without touching Gemini, Groq or Cloudflare', async () => {
  const calls = [];
  const result = await generateDABBIRAiReply({
    project: 'dabbir_businesses',
    message: 'مرحبا',
    language: 'ar',
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      GROQ_API_KEY: 'test-groq-key',
      CLOUDFLARE_API_TOKEN: 'test-cloudflare',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      VERCEL_ENV: 'production',
      AI_GATEWAY_API_KEY: 'test-gateway-key',
      DABBIR_AI_GATEWAY_MODEL: 'google/gemini-3.7-flash',
    },
    fetchImpl: async (url, options) => {
      calls.push({url:String(url),body:JSON.parse(options.body)});
      return new Response(JSON.stringify({model:'google/gemini-3.7-flash',choices:[{message:{content:'أهلًا، كيف أساعدك؟'}}]}),{status:200,headers:{'content-type':'application/json'}});
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'vercel-ai-gateway');
  assert.equal(result.telemetry.routing_mode, 'GATEWAY_PRIMARY_DIRECT_RECOVERY');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /ai-gateway\.vercel\.sh/);
  assert.equal(calls.some(call=>/googleapis|api\.groq\.com|api\.cloudflare\.com/.test(call.url)), false);
});

test('direct providers are reached only as recovery after a hard Gateway failure', async () => {
  const calls = [];
  const result = await generateDABBIRAiReply({
    project: 'dabbir_businesses',
    message: 'مرحبا',
    language: 'ar',
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      GROQ_API_KEY: 'test-groq-key',
      VERCEL_ENV: 'production',
      AI_GATEWAY_API_KEY: 'test-gateway-key',
      DABBIR_AI_GATEWAY_MODEL: 'google/gemini-3.7-flash',
    },
    fetchImpl: async (url) => {
      calls.push(String(url));
      if(String(url).includes('ai-gateway.vercel.sh')) return new Response('{}',{status:402});
      if(String(url).includes('generativelanguage.googleapis.com')) return new Response(JSON.stringify({model:'gemini-3.7-flash',choices:[{message:{content:'تم عبر مسار الاستعادة'}}]}),{status:200,headers:{'content-type':'application/json'}});
      return new Response('{}',{status:500});
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'google-gemini');
  assert.equal(result.telemetry.routing_mode, 'GATEWAY_PRIMARY_DIRECT_RECOVERY');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /ai-gateway\.vercel\.sh/);
  assert.match(calls[1], /generativelanguage\.googleapis\.com/);
});

test('Gemini uses Google OpenAI-compatible endpoint and DABBIR grounding prompt in direct-only mode', async () => {
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

test('Gemini direct-only failure falls back to Groq when available', async () => {
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