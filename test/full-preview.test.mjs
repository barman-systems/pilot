import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredScreens = ['dashboard','conversations','appointments','customers','tasks','automations','analytics','integrations','notifications','settings','help'];
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('main DABBIR interface retains complete product navigation', () => {
  for (const screen of requiredScreens) assert.match(html, new RegExp(`id="screen-${screen}"`), `missing ${screen} screen`);
  assert.match(html, /id="arBtn"/);
  assert.match(html, /id="enBtn"/);
  assert.match(html, /document\.documentElement\.dir=lang==='ar'\?'rtl':'ltr'/);
  assert.match(html, /\/api\/translate/);
});

test('root workspace is authenticated and operational instead of hard-coded preview data', () => {
  assert.match(html, /\/api\/dabbir-runtime/);
  assert.match(html, /\/api\/auth\/login/);
  assert.match(html, /action:'create_business'/);
  assert.match(html, /action:'start_conversation'/);
  assert.match(html, /action:'send_message'/);
  assert.match(html, /action:'create_appointment'/);
  assert.match(html, /action:'create_followup'/);
  assert.doesNotMatch(html, /const messages=\[\{id:'1'/);
  assert.doesNotMatch(html, /sendPreviewMessage/);
});

test('UI keeps WhatsApp separate from the operational Web runtime', () => {
  assert.match(html, /whatsappDesc:'[^']*Meta[^']*'/);
  assert.match(html, /webTruth:'[^']*WhatsApp[^']*'/);
  assert.match(html, /\[t\.whatsapp,t\.whatsappDesc,t\.notOperational,'red'\]/);
  assert.match(html, /Nothing is sent to WhatsApp/);
});
