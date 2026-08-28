const secret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const trustedOidc = String(process.env.VERCEL_TRUSTED_OIDC_TOKEN || '').trim();
const originValue = String(process.env.PRODUCTION_ORIGIN || '').trim().replace(/\/$/, '');

if (!secret && !trustedOidc) throw new Error('PROTECTED_QA_AUTH_REQUIRED');
if (!/^https:\/\/[^/]+$/i.test(originValue)) throw new Error('PROTECTED_QA_ORIGIN_REQUIRED');

const targetOrigin = new URL(originValue).origin;
const protectionHeaders = secret
  ? {
      'x-vercel-protection-bypass': secret,
      'x-vercel-set-bypass-cookie': 'true',
    }
  : {
      'x-vercel-trusted-oidc-idp-token': trustedOidc,
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
  for (const [key, value] of Object.entries(protectionHeaders)) headers.set(key, value);
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
      const headers = { ...route.request().headers(), ...protectionHeaders };
      await route.continue({ headers });
    });
    return context;
  };
  return browser;
};
