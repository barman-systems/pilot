import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDABBIRAiReply } from '../api/_ai-core.js';

test('AI requests reserve enough output budget for structured WhatsApp planner replies', async () => {
  let requestBody = null;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gemini-test',
        choices: [{ message: { content: '{"action":"REPLY","reply":"وعليكم السلام، كيف أقدر أساعدك؟","service_name":null,"worker_name":null,"requested_local":null,"selected_slot_index":null,"appointment_index":null,"reuse_last":false,"route_class":"SUPPORT"}' } }],
      }),
    };
  };

  const result = await generateDABBIRAiReply({
    project: 'dabbir_businesses',
    message: 'Return the structured planner JSON.',
    language: 'ar',
    env: { GEMINI_API_KEY: 'test-key', DABBIR_GEMINI_MODEL: 'gemini-test' },
    fetchImpl,
  });

  assert.equal(requestBody.max_tokens, 320);
  assert.equal(result.ok, true);
  assert.match(result.reply, /"action":"REPLY"/);
});
