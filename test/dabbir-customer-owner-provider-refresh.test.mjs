import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const resolver=fs.readFileSync(new URL('../supabase/migrations/20260909014000_dabbir_customer_persistence_root_fix_v1.sql',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../supabase/migrations/20260909022100_dabbir_customer_name_provider_refresh_guard_v3.sql',import.meta.url),'utf8');
const compact=value=>value.replace(/\s+/g,' ');

test('provider refresh is distinguishable from a real owner write',()=>{
  const sql=compact(guard);
  assert.match(sql,/v_has_provider_refresh boolean := coalesce\(new\.metadata,'\{\}'::jsonb\) \? '_dabbir_provider_display_name'/);
  assert.match(sql,/v_owner_write boolean :=[\s\S]*and not v_has_provider_refresh/);
  assert.match(sql,/new\.owner_display_name_updated_at is distinct from old\.owner_display_name_updated_at/);
});

test('owner-controlled canonical name survives later WhatsApp profile refresh',()=>{
  const sql=compact(guard);
  assert.match(sql,/if old\.display_name_source='owner' then new\.display_name:=old\.display_name/);
  assert.match(sql,/new\.display_name_source:='owner'/);
  assert.match(sql,/new\.owner_display_name_updated_at:=old\.owner_display_name_updated_at/);
  assert.match(sql,/if v_incoming is not null then new\.whatsapp_display_name:=v_incoming/);
});

test('WhatsApp resolver marks provider display names as transient trigger evidence',()=>{
  const sql=compact(resolver);
  assert.match(sql,/jsonb_build_object\('_dabbir_provider_display_name',v_name\)/);
  assert.match(sql,/metadata=coalesce\(c\.metadata,'\{\}'::jsonb\)\|\|v_metadata/);
});
