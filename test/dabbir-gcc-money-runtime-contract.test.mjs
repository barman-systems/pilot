import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertSnapshotCurrency,
  formatMarketMoney,
  marketDayStartIso,
  verifiedBusinessMarket,
} from '../api/_gcc-money-core.js';

const actionCenter=fs.readFileSync(new URL('../api/owner-action-center.js',import.meta.url),'utf8');

const markets={
  AE:{country_code:'AE',currency_code:'AED',timezone:'Asia/Dubai',digits:2},
  SA:{country_code:'SA',currency_code:'SAR',timezone:'Asia/Riyadh',digits:2},
  KW:{country_code:'KW',currency_code:'KWD',timezone:'Asia/Kuwait',digits:3},
  QA:{country_code:'QA',currency_code:'QAR',timezone:'Asia/Qatar',digits:2},
  BH:{country_code:'BH',currency_code:'BHD',timezone:'Asia/Bahrain',digits:3},
  OM:{country_code:'OM',currency_code:'OMR',timezone:'Asia/Muscat',digits:3},
};

test('all six GCC markets resolve to the country currency and timezone contract',()=>{
  for(const expected of Object.values(markets)){
    const market=verifiedBusinessMarket(expected);
    assert.equal(market.country_code,expected.country_code);
    assert.equal(market.currency_code,expected.currency_code);
    assert.equal(market.timezone,expected.timezone);
    assert.equal(market.currency_minor_units,expected.digits);
  }
});

test('money formatting uses market currency and correct GCC minor units',()=>{
  const sar=verifiedBusinessMarket(markets.SA);
  const kwd=verifiedBusinessMarket(markets.KW);
  assert.match(formatMarketMoney(125,sar,'en'),/SAR/);
  assert.match(formatMarketMoney(125,sar,'ar'),/125|١٢٥/);
  assert.match(formatMarketMoney(1.234,kwd,'en'),/KWD/);
  assert.match(formatMarketMoney(1.234,kwd,'en'),/1\.234/);
});

test('market day start is not Dubai-hardcoded',()=>{
  const instant=Date.parse('2026-09-04T00:30:00.000Z');
  assert.equal(marketDayStartIso(instant,verifiedBusinessMarket(markets.AE)),'2026-09-03T20:00:00.000Z');
  assert.equal(marketDayStartIso(instant,verifiedBusinessMarket(markets.SA)),'2026-09-03T21:00:00.000Z');
  assert.equal(marketDayStartIso(instant,verifiedBusinessMarket(markets.KW)),'2026-09-03T21:00:00.000Z');
});

test('market and snapshot mismatches fail closed',()=>{
  assert.throws(()=>verifiedBusinessMarket({country_code:'SA',currency_code:'AED',timezone:'Asia/Riyadh'}),/BUSINESS_MARKET_CURRENCY_MISMATCH/);
  const sar=verifiedBusinessMarket(markets.SA);
  assert.throws(()=>assertSnapshotCurrency('AED',sar,'ORDER'),/ORDER_CURRENCY_SNAPSHOT_MISMATCH/);
  assert.equal(assertSnapshotCurrency('SAR',sar,'ORDER'),'SAR');
});

test('owner action center reads neutral money aliases and verified business market context',()=>{
  assert.match(actionCenter,/dabbir_businesses\?select=id,country_code,currency_code,timezone/);
  assert.match(actionCenter,/verifiedBusinessMarket\(business\)/);
  assert.match(actionCenter,/marketDayStartIso\(now,market\)/);
  assert.match(actionCenter,/dabbir_orders\?select=id,customer_id,status,total_amount,currency_code/);
  assert.match(actionCenter,/assertSnapshotCurrency\(order\.currency_code,market,'ORDER'\)/);
  assert.match(actionCenter,/formatMarketMoney\(order\.total_amount,market,'ar'\)/);
  assert.match(actionCenter,/formatMarketMoney\(order\.total_amount,market,'en'\)/);
  assert.match(actionCenter,/country_code:market\.country_code/);
  assert.match(actionCenter,/currency_code:market\.currency_code/);
  assert.match(actionCenter,/timezone:market\.timezone/);
});

test('owner action center no longer presents UAE money or Dubai day boundaries as universal truth',()=>{
  assert.doesNotMatch(actionCenter,/function dubaiDayStartIso/);
  assert.doesNotMatch(actionCenter,/timezone:'Asia\/Dubai'/);
  assert.doesNotMatch(actionCenter,/total_aed/);
  assert.doesNotMatch(actionCenter,/detail_en:`AED /);
  assert.doesNotMatch(actionCenter,/د\.إ/);
});
