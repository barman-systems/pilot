import appRecoveryHandler from './app-recovery.js';

const UI_CACHE_BUST = '20260902-p0-safari-v3';
const SAFARI_AUTH_FAIL_OPEN = `/api/dabbir-safari-auth-fail-open-ui?v=${UI_CACHE_BUST}`;
const LEGACY_STORE_SLOT_HIDE = `document.querySelectorAll('[data-screen="appointments"]').forEach(el=>{el.style.display=isStore?'none':''});`;
const LEGACY_STORE_APPOINTMENT_REDIRECT = `if(name==='appointments'&&String(workspace?.business?.business_type||'').toLowerCase()==='store') name='dashboard';`;

function bustUiAssetVersion(body) {
  if (typeof body !== 'string') return body;
  return body
    .replace(/(\/dabbir-ui-critical\.js\?v=)[^"'\s<]+/g, `$1${UI_CACHE_BUST}`)
    .replace(/(\/dabbir-ui-deferred\.js\?v=)[^"'\s<]+/g, `$1${UI_CACHE_BUST}`)
    .replace(/(\/api\/dabbir-owner-first-ui\?v=)[^"'\s<]+/g, `$1${UI_CACHE_BUST}`);
}

function stripLegacyNavigationOverrides(body) {
  if (typeof body !== 'string') return body;
  return body
    .split(LEGACY_STORE_SLOT_HIDE).join('')
    .split(LEGACY_STORE_APPOINTMENT_REDIRECT).join('');
}

function injectSafariAuthFailOpen(body) {
  if (typeof body !== 'string' || body.includes('/api/dabbir-safari-auth-fail-open-ui')) return body;
  return body.replace('</body>', `<script src="${SAFARI_AUTH_FAIL_OPEN}"></script>\n</body>`);
}

export default function handler(req, res) {
  const headers = new Map();
  const proxy = {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(String(name), value);
      return proxy;
    },
    getHeader(name) {
      return headers.get(String(name));
    },
    removeHeader(name) {
      headers.delete(String(name));
    },
    end(body = '') {
      for (const [name, value] of headers.entries()) res.setHeader(name, value);
      res.setHeader('cache-control', 'no-store, max-age=0');
      res.setHeader('x-dabbir-ui-cache-bust', UI_CACHE_BUST);
      res.setHeader('x-dabbir-navigation-authority', 'context-router');
      res.statusCode = Number(proxy.statusCode || 200);
      const fresh = bustUiAssetVersion(body);
      const canonical = stripLegacyNavigationOverrides(fresh);
      return res.end(injectSafariAuthFailOpen(canonical));
    },
  };

  return appRecoveryHandler(req, proxy);
}
