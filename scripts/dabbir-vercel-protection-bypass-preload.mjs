const secret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const originValue = String(process.env.PRODUCTION_ORIGIN || '').trim().replace(/\/$/, '');

if (!secret) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET_REQUIRED');
if (!/^https:\/\/[^/]+$/i.test(originValue)) throw new Error('PROTECTED_QA_ORIGIN_REQUIRED');

const targetOrigin = new URL(originValue).origin;
const bypassHeaders = {
  'x-vercel-protection-bypass': secret,
  'x-vercel-set-bypass-cookie': 'true',
};

const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async function protectedQaFetch(input, init = {}) {
  let requestUrl = null;
  try {
    requestUrl = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  } catch {
    return originalFetch(input, init);
  }

  if (requestUrl.origin !== targetOrigin) return originalFetch(input, init);

  const sourceHeaders = init.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(sourceHeaders || {});
  headers.set('x-vercel-protection-bypass', secret);
  headers.set('x-vercel-set-bypass-cookie', 'true');
  return originalFetch(input, { ...init, headers });
};

const { webkit } = await import('playwright');
const originalLaunch = webkit.launch.bind(webkit);
webkit.launch = async function protectedQaLaunch(...args) {
  const browser = await originalLaunch(...args);
  const originalNewContext = browser.newContext.bind(browser);
  browser.newContext = async function protectedQaContext(options = {}) {
    const context = await originalNewContext(options);
    await context.route(`${targetOrigin}/**`, async route => {
      const headers = { ...route.request().headers(), ...bypassHeaders };
      await route.continue({ headers });
    });
    return context;
  };
  return browser;
};
