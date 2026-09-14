import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/dabbir-qwen37-canary-probe.js',import.meta.url),'utf8');

test('live Qwen3.7 canary probe is preview-only, branch-pinned, same-origin and synthetic-scoped',()=>{
  for(const token of ['PREVIEW_CANARY_PROBE_ONLY','CANARY_PROBE_BRANCH_MISMATCH','requireSameOrigin','CANARY_PROBE_SCOPE_REQUIRED','SYNTHETIC_MODE_REQUIRED']){
    assert.match(source,new RegExp(token));
  }
  assert.match(source,/feat\/qwen37-production-canary/);
});

test('live Qwen3.7 canary probe forces one-percent canary only inside the synthetic request',()=>{
  assert.match(source,/DABBIR_QWEN37_CANARY_ENABLED:'1'/);
  assert.match(source,/DABBIR_QWEN37_CANARY_PERCENT:'1'/);
  assert.match(source,/meteringContext:\{synthetic:true\}/);
});

test('live canary probe cannot write usage/customer delivery or Production mutations',()=>{
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|dabbir_record_ai_usage_v1|sendWhatsApp|messages\.create|booking\.create/);
  assert.match(source,/database_metering:false/);
  assert.match(source,/customer_delivery:false/);
  assert.match(source,/production_mutations:0/);
});

test('live canary probe requires the exact isolated Qwen result and no fallback',()=>{
  assert.match(source,/result\.provider==='vercel-ai-gateway'/);
  assert.match(source,/result\.model===QWEN37_CANARY_MODEL/);
  assert.match(source,/canary\.selected===true/);
  assert.match(source,/canary\.fallback===false/);
  assert.match(source,/semantic\.passed/);
});
