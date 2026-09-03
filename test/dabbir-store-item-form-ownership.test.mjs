import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/owner-operations-ui.js',import.meta.url),'utf8');
const productManagement=fs.readFileSync(new URL('../api/owner-product-management.js',import.meta.url),'utf8');

test('store add form is item value and quantity only',()=>{
  assert.match(source,/add:'إضافة سلعة'/);
  assert.match(source,/name:'اسم السلعة'/);
  assert.match(source,/price:'القيمة'/);
  assert.match(source,/qty:'الكمية'/);
  assert.doesNotMatch(source,/id=\\?"opsSku/);
  assert.match(source,/sku:productSku\(\)/);
});

test('store owner can edit and delete items from the activity',()=>{
  assert.match(source,/edit:'تعديل'/);
  assert.match(source,/delete:'حذف'/);
  assert.match(source,/data-ops-edit/);
  assert.match(source,/data-ops-delete/);
  assert.match(source,/\/api\/owner-product-management/);
  assert.match(source,/action:'update_product'/);
  assert.match(source,/action:'delete_product'/);
  assert.match(source,/window\.confirm\(t\.deleteConfirm\)/);
  assert.match(source,/filter\(product=>product\.active!==false\)/);
});

test('owner product management is permission gated and preserves history on delete',()=>{
  assert.match(productManagement,/requireSameOrigin\(req\)/);
  assert.match(productManagement,/permissions\.includes\('manage_business'\)/);
  assert.match(productManagement,/\['owner','admin'\]/);
  assert.match(productManagement,/action==='update_product'/);
  assert.match(productManagement,/dabbir_owner_set_inventory/);
  assert.match(productManagement,/action==='delete_product'/);
  assert.match(productManagement,/PRODUCT_HAS_RESERVED_STOCK/);
  assert.match(productManagement,/active:false/);
  assert.doesNotMatch(productManagement,/method:'DELETE'/);
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
