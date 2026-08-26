import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('conversation composer appends preview messages instead of discarding them', () => {
  assert.match(html, /function sendPreviewMessage\(\)/);
  assert.match(html, /messages\.push\(\{id:nextId,side:'out'/);
  assert.match(html, /\$\('#sendBtn'\)\.onclick=sendPreviewMessage/);
  assert.match(html, /\$\('#composer'\)\.addEventListener\('keydown'/);
  assert.doesNotMatch(html, /no real message was sent'\);i\.value=''/);
});

test('conversation remains truthful about external delivery', () => {
  assert.match(html, /not sent to an external channel/);
  assert.match(html, /previewOnly:true/);
});
