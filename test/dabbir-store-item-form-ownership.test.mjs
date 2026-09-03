import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/owner-operations-ui.js',import.meta.url),'utf8');

test('store add form is item value and quantity only',()=>{
  assert.match(source,/add:'إضافة سلعة'/);
  assert.match(source,/name:'اسم السلعة'/);
  assert.match(source,/price:'القيمة'/);
  assert.match(source,/qty:'الكمية'/);
  assert.doesNotMatch(source,/id=\\?"opsSku/);
  assert.match(source,/sku:productSku\(\)/);
});

test('store mode reclaims the shared operations screen from stale service UI',()=>{
  assert.match(source,/if\(!q\('#opsBody'\)\)/);
  assert.match(source,/q\('#svcModal'\)\?\.classList\.remove\('open'\)/);
  assert.match(source,/if\(!isStore\(\)\)return;/);
  assert.match(source,/lifecycle\.on\('afterLanguage','owner-operations-language',syncOperationsUi\)/);
});

test('store values follow the selected business currency label',()=>{
  assert.match(source,/workspace\?\.business\?\.currency_code/);
  assert.match(source,/t\.price\+' \('\+currencyCode\(\)\+'\)'/);
});
