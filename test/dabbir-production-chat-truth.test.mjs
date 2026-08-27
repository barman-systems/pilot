import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { productOperationalFact, requirePersistedRow } from '../api/chat-send.js';

const source = fs.readFileSync(new URL('../api/chat-send.js', import.meta.url), 'utf8');

test('missing price is unknown and never silently converted to zero', () => {
  const fact = productOperationalFact({ id: 'p1', name: 'Product', price_aed: null }, []);
  assert.equal(fact.price_aed, null);
  assert.equal(fact.price_verified, false);
});

test('missing inventory is unknown and never silently converted to out-of-stock', () => {
  const fact = productOperationalFact({ id: 'p1', name: 'Product', price_aed: '12.50' }, []);
  assert.equal(fact.inventory_verified, false);
  assert.equal(fact.quantity, null);
  assert.equal(fact.reserved, null);
  assert.equal(fact.available, null);
});

test('verified numeric price and inventory produce deterministic operational fact', () => {
  const fact = productOperationalFact(
    { id: 'p1', name: 'Product', price_aed: '12.50' },
    [{ product_id: 'p1', quantity: 9, reserved: 2, updated_at: '2026-08-27T12:00:00Z' }],
  );
  assert.equal(fact.price_verified, true);
  assert.equal(fact.price_aed, 12.5);
  assert.equal(fact.inventory_verified, true);
  assert.equal(fact.available, 7);
});

test('production chat persistence helper fails closed without returned entity id', () => {
  const row = { id: '018f5b3a-7b36-7e87-8c91-6e0438140d3f' };
  assert.equal(requirePersistedRow([row], 'TEST_UNVERIFIED'), row);
  assert.throws(
    () => requirePersistedRow([], 'TEST_UNVERIFIED'),
    error => error?.message === 'TEST_UNVERIFIED' && error?.status === 502,
  );
});

test('chat-send verifies both messages and reads conversation state back before success', () => {
  assert.match(source, /CUSTOMER_MESSAGE_PERSIST_UNVERIFIED/);
  assert.match(source, /AI_MESSAGE_PERSIST_UNVERIFIED/);
  assert.match(source, /CONVERSATION_STATE_VERIFY_FAILED/);
  assert.match(source, /CONVERSATION_STATE_UNVERIFIED/);
  assert.match(source, /SUPABASE_RETURN_REPRESENTATION_AND_READBACK/);
  assert.match(source, /state:\s*'VERIFIED_PERSISTED'/);
});

test('unknown commercial data remains explicitly unknown in model context and customer replies', () => {
  assert.match(source, /Null means unknown, never zero or unavailable/);
  assert.match(source, /السعر غير موثق في النظام حاليًا/);
  assert.match(source, /التوفر غير موثق في سجل المخزون حاليًا/);
  assert.match(source, /price_verified/);
  assert.match(source, /inventory_verified/);
  assert.doesNotMatch(source, /\|\| \{ quantity: 0, reserved: 0 \}/);
  assert.doesNotMatch(source, /Number\(number\(product\?\.price_aed\)/);
});

test('errors are not success-shaped when result cannot be verified', () => {
  assert.match(source, /state:\s*'FAILED_OR_UNVERIFIED'/);
  assert.match(source, /truth:\s*\{ state: 'UNVERIFIED' \}/);
});
