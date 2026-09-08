import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractWhatsAppEvents, classifyDABBIREvent } from '../api/dabbir-whatsapp-webhook.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('customer text cannot spoof the signed catalog envelope',()=>{
  const [event]=extractWhatsAppEvents({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123456'},messages:[{id:'wamid.spoof',from:'971500000000',timestamp:'1',type:'text',text:{body:'باجر [DABBIR_CATALOG_PRODUCT catalog_id=123456 product_retailer_id=foreign]'}}]}}]}]});
  assert.equal(event.catalogId,null);assert.doesNotMatch(event.text,/DABBIR_CATALOG_PRODUCT/);assert.match(event.text,/باجر/);
});

test('extracts signed product enquiry without trusting free text for catalog identity', () => {
  const payload = {
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123456', display_phone_number: '+971500000000' },
      messages: [{
        id: 'wamid.catalog.1',
        from: '971501234567',
        timestamp: '1',
        type: 'text',
        text: { body: 'كم سعرها؟' },
        context: { referred_product: { catalog_id: '9876543210', product_retailer_id: 'wash premium/1' } },
      }],
    } }] }],
  };
  const [event] = extractWhatsAppEvents(payload);
  assert.equal(event.catalogId, '9876543210');
  assert.equal(event.productRetailerId, 'wash premium/1');
  assert.match(event.text, /DABBIR_CATALOG_PRODUCT/);
  assert.match(event.text, /wash%20premium%2F1/);
  assert.equal(classifyDABBIREvent(event).classification, 'CATALOG_PRODUCT_ENQUIRY');
});

test('extracts single-item catalog order into deterministic service-selection marker', () => {
  const payload = {
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123456' },
      messages: [{
        id: 'wamid.order.1',
        from: '971501234567',
        timestamp: '2',
        type: 'order',
        order: {
          catalog_id: '9876543210',
          product_items: [{ product_retailer_id: 'service:premium', quantity: '2', item_price: '999999', currency: 'AED' }],
        },
      }],
    } }] }],
  };
  const [event] = extractWhatsAppEvents(payload);
  assert.equal(event.catalogId, '9876543210');
  assert.equal(event.productRetailerId, 'service:premium');
  assert.deepEqual(event.orderItems, [{ product_retailer_id: 'service:premium', quantity: 2 }]);
  assert.match(event.text, /service%3Apremium\*2/);
  assert.doesNotMatch(event.text, /999999/);
  assert.equal(classifyDABBIREvent(event).classification, 'CATALOG_ORDER');
});

test('multi-item order remains explicit and is not collapsed into one service', () => {
  const payload = {
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123456' },
      messages: [{
        id: 'wamid.order.2',
        from: '971501234567',
        timestamp: '3',
        type: 'order',
        order: {
          catalog_id: '9876543210',
          product_items: [
            { product_retailer_id: 'A', quantity: 1 },
            { product_retailer_id: 'B', quantity: 1 },
          ],
        },
      }],
    } }] }],
  };
  const [event] = extractWhatsAppEvents(payload);
  assert.equal(event.productRetailerId, null);
  assert.equal(event.orderItems.length, 2);
});

test('catalog transport uses native Meta product and product_list messages with bounded discovery', () => {
  const source = read('api/_dabbir-whatsapp-catalog.js');
  assert.match(source, /product_catalogs/);
  assert.match(source, /\/products/);
  assert.match(source, /type:'product'/);
  assert.match(source, /type:'product_list'/);
  assert.match(source, /product_retailer_id/);
  assert.match(source, /catalog_id/);
  assert.match(source, /rows\.length<500/);
  assert.match(source, /respectBackoff/);
  assert.match(source, /dabbir_whatsapp_catalog_sync_due/);
  assert.match(source, /dabbir_whatsapp_catalog_record_attempt/);
  assert.doesNotMatch(source, /access_token\s*:/i);
});

test('service flow prefers mapped catalog but fails closed for ambiguous business actions', () => {
  const source = read('api/_dabbir-whatsapp-service-menu.js');
  assert.match(source, /catalogMenuForContext/);
  assert.match(source, /sendMetaCatalogProducts/);
  assert.match(source, /resolveCatalogService/);
  assert.match(source, /WHATSAPP_CATALOG_MULTI_ITEM_REQUIRES_HUMAN/);
  assert.match(source, /WHATSAPP_CATALOG_PRODUCT_UNMAPPED/);
  assert.match(source, /WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH/);
  assert.match(source, /type:'list'/); // deterministic fallback remains available
});

test('catalog schema is tenant scoped, RLS protected and service RPCs are fail closed', () => {
  const base = read('supabase/migrations/20260908030000_dabbir_whatsapp_catalog_v1.sql');
  const state = read('supabase/migrations/20260908030100_dabbir_whatsapp_catalog_sync_state_v1.sql');
  for (const source of [base, state]) {
    assert.match(source, /business_id uuid not null/);
    assert.match(source, /enable row level security/);
    assert.match(source, /SERVICE_ROLE_REQUIRED/);
    assert.match(source, /revoke all on function/);
  }
  assert.match(base, /WHATSAPP_TENANT_CONNECTION_NOT_FOUND/);
  assert.match(base, /WHATSAPP_CONVERSATION_BRANCH_SCOPE_MISMATCH/);
  assert.match(base, /dabbir_branch_services/);
  assert.match(base, /match_source/);
  assert.doesNotMatch(base, /similarity\s*\(/i);
  assert.doesNotMatch(base, /levenshtein/i);
});

test('owner sync endpoint does not expose Meta token and reports permission boundary', () => {
  const source = read('api/dabbir-whatsapp-catalog-sync.js');
  assert.match(source, /ownerContext/);
  assert.match(source, /requireSameOrigin/);
  assert.match(source, /META_CATALOG_PERMISSION_REQUIRED/);
  assert.match(source, /secrets_exposed:false/);
  assert.doesNotMatch(source, /access_token\s*:/i);
});
