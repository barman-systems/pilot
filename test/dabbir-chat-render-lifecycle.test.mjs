import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const recovery=read('api/app-recovery.js');
const human=read('api/chat-human-ui.js');

test('central lifecycle owns independent chat and message render events',()=>{
  assert.match(recovery,/function wrapChats\(\)/);
  assert.match(recovery,/function wrapMessages\(\)/);
  assert.match(recovery,/emit\('afterChats'/);
  assert.match(recovery,/emit\('afterMessages'/);
  assert.match(recovery,/renderChats=wrapper/);
  assert.match(recovery,/renderMessages=wrapper/);
});

test('human chat UI subscribes to lifecycle and no longer monkey-patches render globals',()=>{
  assert.match(human,/lifecycle\.on\('afterMessages','human-chat-ui',queueHumanUi\)/);
  assert.match(human,/lifecycle\.on\('afterChats','human-chat-ui',queueHumanUi\)/);
  assert.match(human,/lifecycle\.on\('afterRender','human-chat-ui',queueHumanUi\)/);
  assert.match(human,/lifecycle\.on\('afterLanguage','human-chat-ui',queueHumanUi\)/);
  assert.doesNotMatch(human,/const baseRenderMessages=renderMessages/);
  assert.doesNotMatch(human,/const baseRenderChats=renderChats/);
  assert.doesNotMatch(human,/const baseRenderAll=renderAll/);
  assert.doesNotMatch(human,/renderMessages\s*=\s*function/);
  assert.doesNotMatch(human,/renderChats\s*=\s*function/);
  assert.doesNotMatch(human,/renderAll\s*=\s*function/);
  assert.doesNotMatch(human,/new MutationObserver/);
  assert.doesNotMatch(human,/setInterval\s*\(/);
});

test('human takeover and manual reply behavior remains present after lifecycle migration',()=>{
  assert.match(human,/await chatControl\('takeover'\)/);
  assert.match(human,/await chatControl\('return_to_ai'\)/);
  assert.match(human,/await chatControl\('human_message',message\)/);
  assert.match(human,/conversation\.state!=='human_active'/);
  assert.match(human,/window\.__dabbirHumanChatUiVersion='v3-lifecycle'/);
  assert.match(human,/x-dabbir-chat-ui','v3-lifecycle-readable'/);
});

test('chat status labels and actions remain readable and tappable on iPhone',()=>{
  assert.match(human,/\.dabbirOwnerChip\{[^}]*font-size:12px/);
  assert.match(human,/\.dabbirTakeover\{[^}]*min-height:44px!important[^}]*font-size:12px!important/);
  assert.match(human,/#screen-conversations #translateAll\{[^}]*font-size:12px!important[^}]*min-height:44px!important/);
  assert.match(human,/#screen-conversations \.meta button\{[^}]*min-height:44px!important[^}]*font-size:11px!important/);
  assert.match(human,/\.dabbirSenderLabel\{font-size:11px/);
  assert.match(human,/#screen-conversations #chatState\{font-size:11px!important/);
  assert.match(human,/#screen-conversations\+\.truth,#screen-conversations \.truth\{font-size:12px!important/);
  assert.doesNotMatch(human,/\.dabbirTakeover\{[^}]*min-height:(?:36|38)px/);
  assert.doesNotMatch(human,/#screen-conversations #translateAll\{[^}]*min-height:38px/);
});