import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Embedded Signup accepts current Meta completion variants including WABA-only coexistence',async()=>{
  const ui=await read('api/dabbir-whatsapp-embedded-ui.js');
  assert.match(ui,/META_FINISH_EVENTS=new Set/);
  assert.match(ui,/['"]FINISH['"]/);
  assert.match(ui,/['"]FINISH_ONLY_WABA['"]/);
  assert.match(ui,/['"]FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING['"]/);
  assert.match(ui,/META_FINISH_EVENTS\.has\(metaEvent\)/);
  assert.match(ui,/if\(embeddedSession\.waba_id\) settleSession\(embeddedSession\)/);
});

test('Meta session listener trusts HTTPS facebook.com hosts without a brittle subdomain list',async()=>{
  const ui=await read('api/dabbir-whatsapp-embedded-ui.js');
  assert.match(ui,/function trustedMetaOrigin\(origin\)/);
  assert.match(ui,/url\.protocol==='https:'/);
  assert.match(ui,/host==='facebook\.com'\|\|host\.endsWith\('\.facebook\.com'\)/);
  assert.match(ui,/if\(!trustedMetaOrigin\(event\.origin\)\) return/);
  assert.doesNotMatch(ui,/META_MESSAGE_ORIGINS=new Set/);
});

test('WABA-only completion remains server-resolvable for existing WhatsApp Business app numbers',async()=>{
  const endpoint=await read('api/dabbir-whatsapp-embedded-complete.js');
  assert.match(endpoint,/if \(!phoneNumberId && onboardingMode === 'whatsapp_business_app_onboarding'\)/);
  assert.match(endpoint,/resolveCoexistencePhoneNumberId/);
  assert.match(endpoint,/if \(!phoneNumberId\) return json\(res, 400/);
});
