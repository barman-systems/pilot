import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const core = fs.readFileSync(new URL('../api/_ai-core.js', import.meta.url), 'utf8');
const operator = fs.readFileSync(new URL('../api/_dabbir-autonomous-agent.js', import.meta.url), 'utf8');

test('production Groq direct model matches the current free direct fallback used by DABBIR', () => {
  assert.equal(vercel.env?.DABBIR_GROQ_MODEL, 'openai/gpt-oss-20b');
  assert.doesNotMatch(vercel.env?.DABBIR_GROQ_MODEL || '', /llama-3\.3-70b-versatile/);
  assert.match(core, /DEFAULT_MODEL\s*=\s*'openai\/gpt-oss-20b'/);
  assert.match(operator, /DIRECT_GROQ_MODEL=.*'openai\/gpt-oss-20b'/);
});
