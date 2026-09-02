import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/service-operations-ui.js',import.meta.url),'utf8');

test('service save releases the loading guard before forced catalog reload',()=>{
  const match=source.match(/async function saveService\(event\)\{[\s\S]*?\n  function initialize\(\)\{/);
  assert.ok(match,'saveService source should be present');
  assert.match(match[0],/editingId=null;\s*loading=false;\s*await load\(true\);/);
});
