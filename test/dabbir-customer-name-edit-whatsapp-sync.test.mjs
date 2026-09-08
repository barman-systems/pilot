import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260908105600_dabbir_customer_name_owner_override_v1.sql',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/customer-profile.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../api/customer-name-ui.js',import.meta.url),'utf8');
const bundles=JSON.parse(fs.readFileSync(new URL('../config/dabbir-ui-bundles.json',import.meta.url),'utf8'));
const webhook=fs.readFileSync(new URL('../api/dabbir-whatsapp-webhook.js',import.meta.url),'utf8');
const coexistence=fs.readFileSync(new URL('../api/_whatsapp-coexistence.js',import.meta.url),'utf8');

function compact(value){return value.replace(/\s+/g,' ')}

test('customer model keeps WhatsApp provider name separate from owner canonical name',()=>{
  assert.match(migration,/add column if not exists whatsapp_display_name text/);
  assert.match(migration,/display_name_source text not null default 'system'/);
  assert.match(migration,/owner_display_name_updated_at timestamptz/);
  assert.match(migration,/old\.display_name_source='owner'/);
  assert.match(migration,/new\.display_name:=old\.display_name/);
  assert.match(migration,/coalesce\(auth\.role\(\),'\'\)='service_role'/);
});

test('only an active owner or admin can set the canonical customer name',()=>{
  const source=compact(migration);
  assert.match(source,/m\.role in \('owner','admin'\)/);
  assert.match(source,/display_name_source='owner'/);
  assert.match(source,/CUSTOMER_NAME_OWNER_REQUIRED/);
  assert.match(api,/canEdit\(member\)/);
  assert.match(api,/CUSTOMER_NAME_UPDATE_UNVERIFIED/);
});

test('owner UI exposes customer name edit from customer list and conversation header',()=>{
  assert.ok(bundles.deferred.includes('/api/customer-name-ui'));
  assert.match(ui,/data\.customerNameEdit=customer\.id/);
  assert.match(ui,/id='dabbirChatCustomerEdit'/);
  assert.match(ui,/\/api\/customer-profile/);
  assert.match(ui,/display_name:name/);
});

test('WhatsApp names already arrive through message profile sync and Coexistence contact sync',()=>{
  assert.match(webhook,/contact\?\.profile\?\.name/);
  assert.match(webhook,/contactNames/);
  assert.match(coexistence,/type:'coexistence_contact'/);
  assert.match(coexistence,/p_display_name:clean\(event\.contactName/);
});
