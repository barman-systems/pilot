import fs from 'node:fs';

const sourceUrl = new URL('./ai-full-customer-journey-v2.mjs', import.meta.url);
const runtimeUrl = new URL('./.ai-full-customer-journey-v2.runtime.mjs', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');

const previousNavigation = `  await page.locator('[data-screen="conversations"]').first().click();
  await page.locator('#screen-conversations.active').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('#chatList').textContent())?.includes('AI Journey Customer'), 'BROWSER_CONVERSATION_MISSING');

  await page.locator('[data-screen="operations"]').first().click();
  await page.locator('#screen-operations.active').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('#opsBody').textContent())?.includes('AI Journey Product'), 'BROWSER_PRODUCT_MISSING');`;

const realMobileNavigation = `  const openMobileScreen = async screen => {
    const menu = page.locator('#menuBtn');
    await menu.waitFor({ state: 'visible', timeout: 10_000 });
    await menu.click();
    await page.locator('#side.open').waitFor({ state: 'visible', timeout: 10_000 });
    const target = page.locator(\`#side.open [data-screen="\${screen}"]\`).first();
    await target.waitFor({ state: 'visible', timeout: 10_000 });
    await target.click();
    await page.locator(\`#screen-\${screen}.active\`).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#side:not(.open)').waitFor({ state: 'attached', timeout: 10_000 });
  };

  await openMobileScreen('conversations');
  assert((await page.locator('#chatList').textContent())?.includes('AI Journey Customer'), 'BROWSER_CONVERSATION_MISSING');

  await openMobileScreen('operations');
  assert((await page.locator('#opsBody').textContent())?.includes('AI Journey Product'), 'BROWSER_PRODUCT_MISSING');`;

const mobileStep = `  await step('25_mobile_webkit_owner_journey', browserJourney);`;
const translationAndMobileStep = `  await step('24b_authenticated_translation_fallback', async () => {
    const original = 'مرحبا، المنتج متوفر اليوم';
    const result = await ownerSession.request('/api/translate', {
      method: 'POST',
      body: {
        business_id: businessId,
        targetLanguage: 'en',
        messages: [{ id: 'qa-translation', text: original }],
      },
    });
    const translated = String(result.json?.translations?.[0]?.text || '').trim();
    assert(result.ok && result.json?.ok, \`TRANSLATION_FAILED_\${result.status}:\${small(result.text)}\`);
    assert(result.json?.service === 'dabbir-translation', 'TRANSLATION_SERVICE_IDENTITY_WRONG');
    assert(result.json?.original_preserved === true, 'TRANSLATION_ORIGINAL_PRESERVATION_MISSING');
    assert(translated && translated !== original && /[A-Za-z]/.test(translated), 'TRANSLATION_OUTPUT_INVALID');
    return {
      status: result.status,
      detail: \`Authenticated translation succeeded via \${result.json?.model || 'unknown-model'}\${result.json?.fallback_used ? ' fallback' : ''}.\`,
    };
  });

  await step('25_mobile_webkit_owner_journey', browserJourney);`;

if (!source.includes(previousNavigation)) {
  throw new Error('MOBILE_NAVIGATION_PATCH_TARGET_NOT_FOUND');
}
if (!source.includes(mobileStep)) {
  throw new Error('TRANSLATION_STEP_PATCH_TARGET_NOT_FOUND');
}

const runtimeSource = source
  .replace(previousNavigation, realMobileNavigation)
  .replace(mobileStep, translationAndMobileStep);

fs.writeFileSync(runtimeUrl, runtimeSource);
try {
  await import(`${runtimeUrl.href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimeUrl, { force: true });
}
