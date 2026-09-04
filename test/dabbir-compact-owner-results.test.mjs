import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ui=fs.readFileSync(new URL('../api/ai-business-operator-ui.js',import.meta.url),'utf8');

test('owner operator UI compacts user-facing AI results',()=>{
  assert.match(ui,/function compactUserText/);
  assert.match(ui,/parts\.slice\(0,2\)/);
  assert.match(ui,/s\.length>220/);
  assert.match(ui,/تم التنفيذ بنجاح/);
  assert.doesNotMatch(ui,/data\.receipts\.map\(x=>'✓ '\+x\.tool\)/);
});

test('owner operator static copy stays concise',()=>{
  assert.match(ui,/حدد الهدف، ودبّر يقرأ وينفذ بعد موافقتك/);
  assert.match(ui,/التغييرات التشغيلية تحتاج موافقتك/);
});
