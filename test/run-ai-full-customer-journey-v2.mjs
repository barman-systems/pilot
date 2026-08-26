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
    const menu = page.locator('#mobileMenu');
    await menu.waitFor({ state: 'visible', timeout: 10_000 });
    await menu.click();
    await page.locator('.side.open').waitFor({ state: 'attached', timeout: 10_000 });
    const target = page.locator(\`.side.open [data-screen="\${screen}"]\`).first();
    await target.waitFor({ state: 'visible', timeout: 10_000 });
    await target.click();
    await page.locator(\`#screen-\${screen}.active\`).waitFor({ state: 'visible', timeout: 10_000 });
  };

  await openMobileScreen('conversations');
  assert((await page.locator('#chatList').textContent())?.includes('AI Journey Customer'), 'BROWSER_CONVERSATION_MISSING');

  await openMobileScreen('operations');
  assert((await page.locator('#opsBody').textContent())?.includes('AI Journey Product'), 'BROWSER_PRODUCT_MISSING');`;

if (!source.includes(previousNavigation)) {
  throw new Error('MOBILE_NAVIGATION_PATCH_TARGET_NOT_FOUND');
}

fs.writeFileSync(runtimeUrl, source.replace(previousNavigation, realMobileNavigation));
try {
  await import(`${runtimeUrl.href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimeUrl, { force: true });
}
