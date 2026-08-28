import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('owner daily navigation is reduced to five consistent destinations', () => {
  const side = html.match(/<nav class="nav" id="nav">([\s\S]*?)<\/nav>/)?.[1] || '';
  const bottom = html.match(/<nav class="bottomNav" id="bottomNav">([\s\S]*?)<\/nav>/)?.[1] || '';
  const primary = ['dashboard', 'conversations', 'appointments', 'customers', 'more'];

  for (const screen of primary) {
    assert.match(side, new RegExp(`data-screen="${screen}"`));
    assert.match(bottom, new RegExp(`data-screen="${screen}"`));
  }

  assert.equal((side.match(/class="navBtn/g) || []).length, 5);
  assert.equal((bottom.match(/data-screen=/g) || []).length, 5);
  assert.doesNotMatch(side, /data-screen="analytics"/);
  assert.doesNotMatch(side, /data-screen="integrations"/);
  assert.doesNotMatch(side, /data-screen="settings"/);
});

test('advanced tools remain available under More instead of being removed', () => {
  for (const screen of ['tasks','automations','analytics','integrations','notifications','settings','help']) {
    assert.match(html, new RegExp(`id="screen-${screen}"`));
  }
  assert.match(html, /id="screen-more"/);
  assert.match(html, /moreTitle:'المزيد عند الحاجة'/);
});

test('Today screen prioritizes intervention and low-input quick actions', () => {
  assert.match(html, /dashTitle:'ما الذي يحتاج انتباهك اليوم؟'/);
  assert.match(html, /id="attentionList"/);
  assert.match(html, /id="quickChat"/);
  assert.match(html, /id="quickAppt"/);
  assert.match(html, /id="setupSteps"/);
  assert.match(html, /خطوتان فقط/);
});

test('truthful external-channel boundary is preserved', () => {
  assert.match(html, /لا يتم إرسال شيء إلى WhatsApp أو أي قناة خارجية/);
  assert.match(html, /Nothing is sent to WhatsApp or another external channel/);
  assert.match(html, /whatsappDesc:'[^']*Meta[^']*'/);
});
