import fs from 'node:fs';

const indexPath = 'index.html';
let html = fs.readFileSync(indexPath, 'utf8');

const oldHandler = "$('#sendBtn').onclick=()=>{const i=$('#composer');if(!i.value.trim())return;toast('هذه معاينة ولا يتم إرسال رسالة حقيقية','This is a preview; no real message was sent');i.value=''};";
const newHandler = `function sendPreviewMessage(){
  const input=$('#composer');
  const text=String(input?.value||'').trim();
  if(!text)return;
  const nextId=String(Math.max(0,...messages.map(m=>Number(m.id)||0))+1);
  messages.push({id:nextId,side:'out',original:text,fb:{ar:text,en:text},previewOnly:true});
  input.value='';
  renderMessages();
  const box=$('#messages');
  if(box)box.scrollTop=box.scrollHeight;
  toast('تمت إضافة الرسالة داخل معاينة المحادثة فقط — لم تُرسل إلى قناة خارجية','Message added to the conversation preview only — it was not sent to an external channel');
}
$('#sendBtn').onclick=sendPreviewMessage;
$('#composer').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendPreviewMessage()}});`;

if (!html.includes(oldHandler)) {
  throw new Error('expected preview-only send handler not found');
}
html = html.replace(oldHandler, newHandler);
fs.writeFileSync(indexPath, html);

const test = `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('conversation composer appends preview messages instead of discarding them', () => {
  assert.match(html, /function sendPreviewMessage\\(\\)/);
  assert.match(html, /messages\\.push\\(\\{id:nextId,side:'out'/);
  assert.match(html, /\\$\\('#sendBtn'\\)\\.onclick=sendPreviewMessage/);
  assert.match(html, /\\$\\('#composer'\\)\\.addEventListener\\('keydown'/);
  assert.doesNotMatch(html, /no real message was sent'\\);i\\.value=''/);
});

test('conversation remains truthful about external delivery', () => {
  assert.match(html, /not sent to an external channel/);
  assert.match(html, /previewOnly:true/);
});
`;
fs.writeFileSync('test/conversation-preview-send.test.mjs', test);
