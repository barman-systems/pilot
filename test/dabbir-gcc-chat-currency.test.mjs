import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { businessCurrencyCode, productOperationalFact } from '../api/chat-send.js';

const EXPECTED = {
  AE: 'AED',
  SA: 'SAR',
  KW: 'KWD',
  QA: 'QAR',
  BH: 'BHD',
  OM: 'OMR',
};

test('customer price currency follows all six GCC business countries', () => {
  for (const [country_code, currency_code] of Object.entries(EXPECTED)) {
    assert.equal(businessCurrencyCode({ country_code, currency_code }), currency_code);
  }
});

test('country authority wins over a stale mismatched persisted currency', () => {
  assert.equal(businessCurrencyCode({ country_code: 'SA', currency_code: 'AED' }), 'SAR');
  assert.equal(businessCurrencyCode({ country_code: 'KW', currency_code: 'SAR' }), 'KWD');
});

test('unknown business currency fails closed instead of defaulting to AED', () => {
  assert.equal(businessCurrencyCode({}), null);
  assert.equal(businessCurrencyCode({ country_code: 'US', currency_code: 'USD' }), null);
});

test('product operational fact carries a generic price with verified GCC currency', () => {
  const fact = productOperationalFact({ id: 'p1', name: 'Item', price_aed: '12.50' }, [], 'SAR');
  assert.equal(fact.price, 12.5);
  assert.equal(fact.price_aed, 12.5);
  assert.equal(fact.currency_code, 'SAR');
  assert.equal(fact.currency_verified, true);
});

test('chat source fetches business currency and does not render hard-coded AED price units', () => {
  const source = fs.readFileSync(new URL('../api/chat-send.js', import.meta.url), 'utf8');
  assert.match(source, /country_code,currency_code/);
  assert.match(source, /fact\.currency_code/);
  assert.doesNotMatch(source, /toFixed\(2\)\} د\.إ/);
  assert.doesNotMatch(source, /toFixed\(2\)\} AED/);
  assert.match(source, /Never invent missing values or currency/);
});
