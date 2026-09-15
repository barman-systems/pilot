import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/dabbir-runtime-fast.js',import.meta.url),'utf8');

test('owner runtime does not hide live conversations behind a web-only filter',()=>{
  assert.match(source,/fast-v8-live-conversations/);
  assert.doesNotMatch(source,/dabbir_conversations\?select=id&business_id=eq\.\$\{b\}&channel_type=eq\.web/);
  assert.doesNotMatch(source,/&business_id=eq\.\$\{businessId\}&channel_type=eq\.web&state=neq\.closed/);
  assert.doesNotMatch(source,/&id=eq\.\$\{requestedConversationId\}&channel_type=eq\.web&limit=1/);
  assert.match(source,/select=id,customer_id,channel_type,state,demo_mode,created_at,updated_at/);
  assert.match(source,/multi_channel_conversations:\s*true/);
});

test('non-web conversations remain first-class while only internal web duplicates are canonicalized',()=>{
  assert.match(source,/if \(source !== 'dabbir_web_runtime' \|\| !normalizedName\) \{/);
  assert.match(source,/passthrough\.push\(conversation\)/);
  assert.match(source,/return \[\.\.\.passthrough, \.\.\.runtimeGroups\.values\(\)\]\.sort/);
});
