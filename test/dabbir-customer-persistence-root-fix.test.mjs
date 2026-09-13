import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260909014000_dabbir_customer_persistence_root_fix_v1.sql',import.meta.url),'utf8');
const ownerPrecedence=fs.readFileSync(new URL('../supabase/migrations/20260909014100_dabbir_customer_name_owner_precedence_v2.sql',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../api/branch-workspace.js',import.meta.url),'utf8');
const profile=fs.readFileSync(new URL('../api/customer-profile.js',import.meta.url),'utf8');

function compact(value){return value.replace(/\s+/g,' ')}

test('text and voice WhatsApp inbound resolve one canonical customer by handle or phone',()=>{
  const sql=compact(migration);
  assert.match(sql,/create or replace function dabbir_private\.resolve_whatsapp_customer_v1/);
  assert.match(sql,/regexp_replace\(coalesce\(p_sender_handle,''\),'\[\^0-9\]','','g'\)/);
  assert.match(sql,/c\.channel_handle=v_handle/);
  assert.match(sql,/c\.phone_e164=v_phone/);
  assert.match(sql,/v_by_handle is not null and v_by_phone is not null and v_by_handle<>v_by_phone/);
  assert.match(sql,/WHATSAPP_CUSTOMER_IDENTITY_CONFLICT/);
  assert.equal((sql.match(/resolve_whatsapp_customer_v1\(v_connection\.business_id,v_sender,p_display_name\)/g)||[]).length,2);
});

test('canonical customer persistence stores phone_e164 and never relies on channel_handle alone',()=>{
  const sql=compact(migration);
  assert.match(sql,/business_id,display_name,channel_handle,phone_e164,lead_status,metadata/);
  assert.match(sql,/phone_e164=coalesce\(c\.phone_e164,v_phone\)/);
  assert.match(sql,/channel_handle=coalesce\(c\.channel_handle,v_handle\)/);
  assert.match(sql,/length\(v_handle\) not between 7 and 20/);
  assert.match(sql,/coalesce\(auth\.role\(\),'\'\)<>'service_role'/);
});

test('existing WhatsApp customers are backfilled only when no tenant-local identity conflict exists',()=>{
  const sql=compact(migration);
  assert.match(sql,/with candidates as/);
  assert.match(sql,/other\.business_id=x\.business_id and other\.id<>x\.id and other\.phone_e164='\+'\|\|x\.normalized_handle/);
  assert.match(sql,/other\.business_id=x\.business_id and other\.id<>x\.id and other\.channel_handle=x\.normalized_handle/);
  assert.match(sql,/phone_e164=coalesce\(c\.phone_e164,s\.canonical_phone\)/);
});

test('provider sync distinguishes provider names, legacy local names and explicit owner names',()=>{
  const sql=compact(ownerPrecedence);
  assert.match(sql,/v_owner_override boolean/);
  assert.match(sql,/new\.display_name_source='owner'/);
  assert.match(sql,/display_name_owner_override','false'\)='true'/);
  assert.match(sql,/new\.whatsapp_display_name:=old\.whatsapp_display_name/);
  assert.match(sql,/new\.metadata:=coalesce\(new\.metadata,'\{\}'::jsonb\)-'_dabbir_provider_display_name'/);
  assert.match(sql,/elsif new\.display_name is distinct from old\.display_name/);
  assert.match(sql,/old\.display_name_source='owner'/);
  assert.match(sql,/v_legacy_manual:=old\.display_name_source='system'/);
});

test('owner workspace and profile expose the durable canonical phone instead of hiding it in metadata',()=>{
  assert.match(workspace,/phone_e164,channel_handle,lead_status,whatsapp_display_name,display_name_source/);
  assert.match(workspace,/const canonicalPhone=String\(row\?\.phone_e164\|\|''\)\.trim\(\)/);
  assert.match(workspace,/metadata\.phone=canonicalPhone/);
  assert.match(profile,/display_name,phone_e164,channel_handle,lead_status,whatsapp_display_name/);
});
