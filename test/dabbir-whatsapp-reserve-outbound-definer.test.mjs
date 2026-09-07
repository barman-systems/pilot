import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260907052000_dabbir_whatsapp_reserve_outbound_definer_v1.sql',import.meta.url),'utf8');

test('WhatsApp outbound reservation runs as definer but remains service-role only',()=>{
  assert.match(migration,/alter function public\.dabbir_whatsapp_reserve_outbound\(uuid,uuid,uuid,text,text,text\) security definer/i);
  assert.match(migration,/revoke all on function public\.dabbir_whatsapp_reserve_outbound[\s\S]*from public,anon,authenticated/i);
  assert.match(migration,/grant execute on function public\.dabbir_whatsapp_reserve_outbound[\s\S]*to service_role/i);
});
