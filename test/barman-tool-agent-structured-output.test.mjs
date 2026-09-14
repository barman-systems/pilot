import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// This regression must run behind the repository's bounded, fail-closed dependency audit gate.
const broker=fs.readFileSync(new URL('../api/barman-tool-agent-broker.js',import.meta.url),'utf8');

test('tool-agent requests machine-enforced JSON schema instead of trusting prompt-only JSON',()=>{
  assert.match(broker,/response_format:structuredOutput\(name,schema\)/);
  assert.match(broker,/type:'json_schema'/);
  assert.match(broker,/name:'barman_repository_discovery'/);
  assert.match(broker,/name:'barman_source_patch'/);
  assert.match(broker,/additionalProperties:false/);
  assert.match(broker,/required:\['summary','search_terms','file_hints'\]/);
  assert.match(broker,/required:\['summary','patch'\]/);
});

test('gateway transport uses the shared provider authority and invalid transport JSON fails explicitly',()=>{
  assert.match(broker,/createAiProviderAuthorityFetch/);
  assert.match(broker,/authorityFetch\(GATEWAY_ENDPOINT/);
  assert.doesNotMatch(broker,/const GATEWAY_MAX_ATTEMPTS=2|GATEWAY_RETRYABLE|attempt<=GATEWAY_MAX_ATTEMPTS/);
  assert.match(broker,/AI_GATEWAY_RESPONSE_INVALID_JSON/);
  assert.match(broker,/AI_GATEWAY_STRUCTURED_OUTPUT_INVALID/);
  assert.doesNotMatch(broker,/while\s*\(true\)/);
});