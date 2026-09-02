import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge=fs.readFileSync(new URL('../api/dabbir-navigation-event-bridge-ui.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../config/dabbir-ui-bundles.json',import.meta.url),'utf8'));

test('conversation freshness reuses the existing navigation bridge without growing shell modules',()=>{
  assert.equal(manifest.critical.at(-1),'/api/auth-session-stability-ui');
  assert.ok(!manifest.critical.includes('/api/dabbir-conversation-freshness-ui'));
  assert.ok(!manifest.deferred.includes('/api/dabbir-conversation-freshness-ui'));
  assert.equal([...manifest.critical,...manifest.deferred].length,26);
  assert.match(bridge,/server_conversation_refresh_after_first_paint:true/);
});

test('WebKit keeps immediate local conversation rendering then refreshes canonical server runtime',()=>{
  const activate=bridge.match(/function activate\(hit,source\)\{([\s\S]*?)\n  \}/)?.[1]||'';
  const localRender=activate.indexOf('renderLoadedScreen(hit)');
  const paint=activate.indexOf('paint(hit)');
  const refresh=activate.indexOf('refreshConversationWorkspace().then(finish)');
  const canonical=activate.indexOf('showScreen(hit.name)');
  assert.ok(localRender>=0&&paint>localRender,'loaded workspace must render before first paint');
  assert.ok(refresh>paint,'server refresh must wait until after immediate visual feedback');
  assert.ok(canonical>paint,'canonical screen render must remain deferred after first paint');
  assert.match(bridge,/loadRuntime\(businessId,conversationId\)/);
  assert.match(bridge,/workspace!==before/);
});

test('conversation refresh coalesces repeated taps and ignores stale navigation responses',()=>{
  assert.match(bridge,/if\(conversationRefreshInFlight&&conversationRefreshBusinessId===businessId\) return conversationRefreshInFlight/);
  assert.match(bridge,/const epoch=\+\+navigationEpoch/);
  assert.match(bridge,/if\(epoch!==navigationEpoch\) return/);
  assert.match(bridge,/repeated_refresh_coalescing:true/);
  assert.match(bridge,/stale_navigation_response_guard:true/);
});

test('conversation freshness preserves the real iPhone touch acceptance fix',()=>{
  const touchEnd=bridge.match(/document\.addEventListener\('touchend',event=>\{([\s\S]*?)\n  \},\{capture:true,passive:false\}\);/)?.[1]||'';
  assert.doesNotMatch(touchEnd,/document\.elementFromPoint\(/);
  assert.match(bridge,/redundant_touch_hit_test:false/);
  assert.match(bridge,/version:'navigation-event-bridge-v6-real-iphone-touch'/);
});
