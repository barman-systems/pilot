import fs from 'node:fs';

const sourceUrl = new URL('./ai-full-customer-journey-v2.mjs', import.meta.url);
const runtimeUrl = new URL('./.ai-full-customer-journey-v2.runtime.mjs', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');

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

if (!source.includes(mobileStep)) {
  throw new Error('TRANSLATION_STEP_PATCH_TARGET_NOT_FOUND');
}

fs.writeFileSync(runtimeUrl, source.replace(mobileStep, translationAndMobileStep));
try {
  await import(`${runtimeUrl.href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimeUrl, { force: true });
}
