import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../api/chat-control.js',import.meta.url),'utf8');

test('internal WhatsApp reply forwards the authenticated browser cookie to the live reply endpoint',()=>{
  assert.match(source,/const browserCookie=cleanText\(req\.headers\?\.cookie,8192\)/);
  assert.match(source,/cookie:browserCookie/);
  assert.match(source,/fetch\(`\$\{origin\}\/api\/dabbir-whatsapp-reply`/);
});
