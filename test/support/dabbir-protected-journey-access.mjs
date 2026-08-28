const PATCH_MARKER = Symbol.for('dabbir.protectedJourney.playwrightPatched');

function normalizedOrigin(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

export function protectedAccessHeaders({ bypass = '', trustedOidc = '' } = {}) {
  const bypassValue = String(bypass || '').trim();
  const oidcValue = String(trustedOidc || '').trim();
  if (bypassValue) {
    return {
      'x-vercel-protection-bypass': bypassValue,
      'x-vercel-set-bypass-cookie': 'true',
    };
  }
  if (oidcValue) return { 'x-vercel-trusted-oidc-idp-token': oidcValue };
  throw new Error('VERCEL_PROTECTED_ACCESS_REQUIRED');
}

export function isProtectedJourneyUrl(value, originValue) {
  const origin = normalizedOrigin(originValue);
  if (!origin) return false;
  let url = '';
  if (typeof value === 'string' || value instanceof URL) url = String(value);
  else if (value && typeof value.url === 'string') url = value.url;
  return url === origin || url.startsWith(`${origin}/`) || url.startsWith(`${origin}?`);
}

export function mergeProtectedHeaders(existing, accessHeaders) {
  const headers = new Headers(existing || {});
  for (const [key, value] of Object.entries(accessHeaders || {})) headers.set(key, value);
  return Object.fromEntries(headers.entries());
}

export function installProtectedFetchAccess({ origin: originValue, bypass = '', trustedOidc = '', target = globalThis } = {}) {
  const origin = normalizedOrigin(originValue);
  if (!/^https:\/\/[^/]+$/i.test(origin)) throw new Error('PRODUCTION_ORIGIN_REQUIRED');
  const accessHeaders = protectedAccessHeaders({ bypass, trustedOidc });
  const nativeFetch = target.fetch?.bind(target);
  if (typeof nativeFetch !== 'function') throw new Error('GLOBAL_FETCH_REQUIRED');

  target.fetch = async (input, init = {}) => {
    if (!isProtectedJourneyUrl(input, origin)) return nativeFetch(input, init);
    const inherited = typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined;
    const headers = new Headers(inherited || {});
    for (const [key, value] of new Headers(init.headers || {}).entries()) headers.set(key, value);
    for (const [key, value] of Object.entries(accessHeaders)) headers.set(key, value);
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return nativeFetch(new Request(input, { ...init, headers }));
    }
    return nativeFetch(input, { ...init, headers });
  };

  return { origin, accessHeaders };
}

export function installProtectedPlaywrightAccess(browserType, accessHeaders) {
  if (!browserType || typeof browserType.launch !== 'function') throw new Error('PLAYWRIGHT_BROWSER_TYPE_REQUIRED');
  const browserTypePrototype = Object.getPrototypeOf(browserType);
  if (!browserTypePrototype || browserTypePrototype[PATCH_MARKER]) return;
  const originalLaunch = browserTypePrototype.launch;
  if (typeof originalLaunch !== 'function') throw new Error('PLAYWRIGHT_LAUNCH_REQUIRED');

  Object.defineProperty(browserTypePrototype, PATCH_MARKER, { value: true, configurable: false });
  browserTypePrototype.launch = async function patchedLaunch(...args) {
    const browser = await originalLaunch.apply(this, args);
    const browserPrototype = Object.getPrototypeOf(browser);
    if (browserPrototype && !browserPrototype[PATCH_MARKER]) {
      const originalNewContext = browserPrototype.newContext;
      if (typeof originalNewContext !== 'function') throw new Error('PLAYWRIGHT_NEW_CONTEXT_REQUIRED');
      Object.defineProperty(browserPrototype, PATCH_MARKER, { value: true, configurable: false });
      browserPrototype.newContext = function patchedNewContext(options = {}) {
        return originalNewContext.call(this, {
          ...options,
          extraHTTPHeaders: mergeProtectedHeaders(options.extraHTTPHeaders, accessHeaders),
        });
      };
    }
    return browser;
  };
}
