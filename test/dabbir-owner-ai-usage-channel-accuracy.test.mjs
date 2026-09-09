import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260909032629_owner_ai_usage_dashboard_channel_accuracy_v1.sql',import.meta.url),'utf8');

test('WhatsApp cost per conversation uses WhatsApp conversations only',()=>{
  assert.match(migration,/count\(distinct m\.conversation_id\) filter \(where c\.channel_type='whatsapp'\).*whatsapp_conversations/is);
  assert.match(migration,/whatsapp_known_cost_aed\s*\/\s*conversation\.whatsapp_conversations/i);
  assert.match(migration,/'whatsapp_conversations',conversation\.whatsapp_conversations/i);
  assert.match(migration,/'whatsapp_messages',conversation\.whatsapp_messages/i);
});
