import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/_whatsapp-branch-connection.js',import.meta.url),'utf8');

test('WhatsApp onboarding prefers primary branch but safely falls back to a sole active branch',()=>{
  assert.match(source,/status=eq\.active&order=is_primary\.desc&limit=2/);
  assert.match(source,/const primary=rows\.find\(row=>row\?\.is_primary===true\)/);
  assert.match(source,/if\(primary\)return primary/);
  assert.match(source,/if\(rows\.length===1\)return rows\[0\]/);
  assert.match(source,/if\(!branch\?\.id\|\|branch\.business_id!==business\)throw Object\.assign\(new Error\('WHATSAPP_PRIMARY_BRANCH_REQUIRED'\),\{status:409\}\)/);
});
