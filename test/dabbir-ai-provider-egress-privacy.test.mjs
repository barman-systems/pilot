import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAiProviderEgressPolicy } from '../api/_ai-provider-reliability.js';

test('Vercel AI Gateway egress always enforces ZDR and prompt-training opt-out', () => {
  const options = {
    method: 'POST',
    body: JSON.stringify({
      model: 'minimax/minimax-m3',
      messages: [{ role: 'user', content: 'hello' }],
      providerOptions: { gateway: { user: 'business-1', tags: ['channel:whatsapp'] } },
    }),
  };
  const next = applyAiProviderEgressPolicy('vercel-ai-gateway', options);
  const body = JSON.parse(next.body);
  assert.equal(body.providerOptions.gateway.zeroDataRetention, true);
  assert.equal(body.providerOptions.gateway.disallowPromptTraining, true);
  assert.equal(body.providerOptions.gateway.user, 'business-1');
  assert.deepEqual(body.providerOptions.gateway.tags, ['channel:whatsapp']);
});

test('callers cannot weaken Gateway privacy controls', () => {
  const next = applyAiProviderEgressPolicy('vercel-ai-gateway', {
    body: JSON.stringify({providerOptions:{gateway:{zeroDataRetention:false,disallowPromptTraining:false}}}),
  });
  const gateway = JSON.parse(next.body).providerOptions.gateway;
  assert.equal(gateway.zeroDataRetention, true);
  assert.equal(gateway.disallowPromptTraining, true);
});

test('Gateway privacy enforcement fails closed on a missing or malformed JSON body', () => {
  assert.throws(() => applyAiProviderEgressPolicy('vercel-ai-gateway', {}), /AI_GATEWAY_PRIVACY_OPTIONS_REQUIRED/);
  assert.throws(() => applyAiProviderEgressPolicy('vercel-ai-gateway', {body:'not-json'}), /AI_GATEWAY_PRIVACY_OPTIONS_REQUIRED/);
});

test('direct providers are not sent Vercel-only provider options', () => {
  const options = {body:JSON.stringify({model:'openai/gpt-oss-20b',messages:[{role:'user',content:'hello'}]})};
  const next = applyAiProviderEgressPolicy('groq', options);
  assert.equal(next, options);
  assert.equal(JSON.parse(next.body).providerOptions, undefined);
});
