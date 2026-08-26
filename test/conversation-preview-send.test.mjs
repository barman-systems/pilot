import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('conversation composer sends through authenticated PILOT runtime', () => {
  assert.match(html, /async function sendMessage\(\)/);
  assert.match(html, /action:'send_message'/);
  assert.match(html, /business_id:workspace\.business\.id/);
  assert.match(html, /conversation_id:selectedConversationId/);
  assert.match(html, /\$\('#sendBtn'\)\.onclick=sendMessage/);
  assert.match(html, /\$\('#composer'\)\.addEventListener\('keydown'/);
  assert.doesNotMatch(html, /previewOnly:true/);
});

test('conversation remains truthful about external delivery', () => {
  assert.match(html, /لا يتم إرسال شيء إلى WhatsApp أو أي قناة خارجية/);
  assert.match(html, /Nothing is sent to WhatsApp or another external channel/);
});
