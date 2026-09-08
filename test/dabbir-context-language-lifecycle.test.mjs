import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const recovery=read('api/app-recovery.js');
const safari=read('api/app-safari-recovery.js');
const contextual=read('api/dabbir-contextual-navigation-ui.js');

test('contextual navigation is lifecycle driven and no longer wraps global render or language functions',()=>{
  assert.match(contextual,/lifecycle\.on\('afterRender','contextual-navigation',queueEnforce\)/);
  assert.match(contextual,/lifecycle\.on\('afterNavigate','contextual-navigation',queueEnforce\)/);
  assert.match(contextual,/lifecycle\.on\('afterLanguage','contextual-navigation',queueEnforce\)/);
  assert.doesNotMatch(contextual,/const baseRenderAll=renderAll/);
  assert.doesNotMatch(contextual,/renderAll\s*=\s*function/);
  assert.doesNotMatch(contextual,/const baseApplyLang=applyLang/);
  assert.doesNotMatch(contextual,/applyLang\s*=\s*function/);
});

test('settings open-now truth follows the selected business timezone rather than Dubai',()=>{
  assert.match(contextual,/currentWorkspace\(\)\?\.business\?\.timezone/);
  assert.match(contextual,/dataset\.dabbirTimezone/);
  assert.match(contextual,/window\.__dabbirTimeZone/);
  assert.match(contextual,/function currentBusinessClock\(\)/);
  assert.doesNotMatch(contextual,/function currentDubai\(\)/);
  assert.doesNotMatch(contextual,/timeZone:'Asia\/Dubai'/);
});

test('booking time guard derives local time from GCC business authority',()=>{
  assert.match(recovery,/const GCC_OFFSETS=\{AE:'\+04:00',SA:'\+03:00',KW:'\+03:00',QA:'\+03:00',BH:'\+03:00',OM:'\+04:00'\}/);
  assert.match(recovery,/dataset\.dabbirTimezone\|\|window\.__dabbirTimeZone/);
  assert.match(recovery,/window\.dabbirLocalTimeToIso/);
  assert.match(recovery,/dataset\.dabbirCountry/);
  assert.match(recovery,/function businessMinute\(/);
  assert.doesNotMatch(recovery,/const TZ='Asia\/Dubai'/);
  assert.doesNotMatch(recovery,/const OFFSET='\+04:00'/);
});

test('Safari and shell use the same deployment cache-bust token',()=>{
  assert.match(recovery,/UI_BUNDLE_VERSION = '20260903-chat-render-lifecycle-v3'/);
  assert.match(safari,/UI_CACHE_BUST = '20260903-chat-render-lifecycle-v3'/);
});