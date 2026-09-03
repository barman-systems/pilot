import appRecoveryHandler from './app-recovery.js';

const UI_CACHE_BUST = '20260903-chat-render-lifecycle-v3';
const SAFARI_AUTH_FAIL_OPEN = `/api/dabbir-safari-auth-fail-open-ui?v=${UI_CACHE_BUST}`;
const LEGACY_STORE_SLOT_HIDE = `document.querySelectorAll('[data-screen="appointments"]').forEach(el=>{el.style.display=isStore?'none':''});`;
const LEGACY_STORE_APPOINTMENT_REDIRECT = `if(name==='appointments'&&String(workspace?.business?.business_type||'').toLowerCase()==='store') name='dashboard';`;
const OWNER_FIRST_SCRIPT_RE = /<script src="\/api\/dabbir-owner-first-ui\?v=[^"\s<]+"><\/script>/g;
const AUTH_BOOT_ANCHOR = 'applyLang();boot();\n</script>';

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

function orderOwnerFirstBeforeAuthBoot(body) {
  if (typeof body !== 'string') return body;
  const ownerScripts = body.match(OWNER_FIRST_SCRIPT_RE) || [];
  if (ownerScripts.length !== 1) throw new Error(`DABBIR_OWNER_FIRST_SCRIPT_COUNT_${ownerScripts.length}`);
  const firstBoot = body.indexOf(AUTH_BOOT_ANCHOR);
  const secondBoot = firstBoot < 0 ? -1 : body.indexOf(AUTH_BOOT_ANCHOR, firstBoot + AUTH_BOOT_ANCHOR.length);
  if (firstBoot < 0 || secondBoot >= 0) throw new Error(`DABBIR_AUTH_BOOT_ANCHOR_COUNT_${firstBoot < 0 ? 0 : 2}`);

  const ownerScript = ownerScripts[0];
  const withoutLateOwner = body.replace(ownerScript, '');
  return withoutLateOwner.replace(
    AUTH_BOOT_ANCHOR,
    `</script>\n${ownerScript}\n<script>\napplyLang();boot();\n</script>`,
  );
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
      res.setHeader('x-dabbir-first-paint-authority', 'owner-first-before-auth-boot-v1');
      res.statusCode = Number(proxy.statusCode || 200);
      const fresh = bustUiAssetVersion(body);
      const canonical = stripLegacyNavigationOverrides(fresh);
      const ordered = orderOwnerFirstBeforeAuthBoot(canonical);
      return res.end(injectSafariAuthFailOpen(ordered));
    },
  };

  return appRecoveryHandler(req, proxy);
}
