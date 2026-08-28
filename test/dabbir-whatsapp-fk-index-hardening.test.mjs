import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20260828051000_dabbir_whatsapp_fk_index_hardening_v1.sql';
const sql=fs.readFileSync(migrationPath,'utf8');

const requiredIndexes=[
  ['dabbir_whatsapp_event_business_conversation_idx',/dabbir_whatsapp_event_ledger\(business_id, conversation_id\)/],
  ['dabbir_whatsapp_event_business_message_idx',/dabbir_whatsapp_event_ledger\(business_id, message_id\)/],
  ['dabbir_whatsapp_event_connection_idx',/dabbir_whatsapp_event_ledger\(connection_id\)/],
  ['dabbir_whatsapp_outbound_business_message_idx',/dabbir_whatsapp_outbound_reservations\(business_id, message_id\)/],
  ['dabbir_whatsapp_outbound_connection_idx',/dabbir_whatsapp_outbound_reservations\(connection_id\)/],
  ['dabbir_whatsapp_outbound_sender_user_idx',/dabbir_whatsapp_outbound_reservations\(sender_user_id\)/],
];

test('WhatsApp service ledgers keep covering indexes for every currently unindexed FK',()=>{
  for(const [name,columns] of requiredIndexes){
    assert.match(sql,new RegExp(`create index if not exists ${name}`));
    assert.match(sql,columns);
  }
});

test('WhatsApp FK index migration is additive and does not loosen security',()=>{
  assert.doesNotMatch(sql,/drop\s+(table|index|policy|function)/i);
  assert.doesNotMatch(sql,/grant\s+/i);
  assert.doesNotMatch(sql,/disable\s+row\s+level\s+security/i);
});
