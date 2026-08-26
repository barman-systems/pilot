const nativeFetch = globalThis.fetch;

globalThis.fetch = async function pilotE2EFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (!url.startsWith('https://api.mail.tm/')) return nativeFetch(input, init);

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
  headers.set('accept', 'application/ld+json, application/json');
  return nativeFetch(input, { ...init, headers });
};

await import('./full-customer-e2e.remote.mjs');
