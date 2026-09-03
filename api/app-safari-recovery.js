import appRecoveryHandler from './app-recovery.js';
import ownerFirstUiHandler from './dabbir-owner-first-ui.js';

const UI_CACHE_BUST = '20260903-webkit-owner-diagnostics-v4';
const SAFARI_AUTH_FAIL_OPEN = `/api/dabbir-safari-auth-fail-open-ui?v=${UI_CACHE_BUST}`;
const LEGACY_STORE_SLOT_HIDE = `document.querySelectorAll('[data-screen="appointments"]').forEach(el=>{el.style.display=isStore?'none':''});`;
const LEGACY_STORE_APPOINTMENT_REDIRECT = `if(name==='appointments'&&String(workspace?.business?.business_type||'').toLowerCase()==='store') name='dashboard';`;
const OWNER_FIRST_SCRIPT_RE = /<script src="\/api\/dabbir-owner-first-ui\?v=[^"\s<]+"><\/script>/g;
const AUTH_BOOT_ANCHOR = 'applyLang();boot();\n</script>';
const MOBILE_MENU_TOUCH_TARGET = `<style data-dabbir-mobile-menu-touch-target="v1">@media(max-width:700px){html body #appShell #menuBtn{min-width:44px!important;min-height:44px!important;flex-shrink:0!important;box-sizing:border-box!important}}</style>`;

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

function ownerFirstProbeScript() {
  return `<script data-dabbir-owner-first-probe="v1">
(()=>{
  const safeError=value=>{try{return String(value&&((value.stack)||(value.message))||value||'UNKNOWN_OWNER_FIRST_ERROR').slice(0,1200)}catch{return 'UNKNOWN_OWNER_FIRST_ERROR'}};
  window.__dabbirOwnerFirstInitError=null;
  window.__dabbirOwnerFirstInlineState={stage:'before_owner_first',error:null};
  window.addEventListener('error',event=>{
    if(window.__dabbirUiAuthority)return;
    const detail=safeError(event&&event.error?event.error:(event&&event.message?event.message:'OWNER_FIRST_WINDOW_ERROR'));
    window.__dabbirOwnerFirstInitError=detail;
    window.__dabbirOwnerFirstInlineState={stage:'window_error',error:detail};
  });
  window.addEventListener('unhandledrejection',event=>{
    if(window.__dabbirUiAuthority)return;
    const detail=safeError(event&&event.reason?event.reason:'OWNER_FIRST_UNHANDLED_REJECTION');
    window.__dabbirOwnerFirstInitError=detail;
    window.__dabbirOwnerFirstInlineState={stage:'unhandled_rejection',error:detail};
  });
})();
</script>`;
}

function ownerFirstPostScript() {
  return `<script data-dabbir-owner-first-post="v1">
window.__dabbirOwnerFirstInlineState={
  stage:(window.__dabbirUiAuthority&&window.__dabbirUiAuthority.version==='owner-first-v4')?'ready':'missing_authority',
  error:window.__dabbirOwnerFirstInitError||null
};
</script>`;
}

function ownerFirstInlineScript() {
  const headers = new Map();
  let statusCode = 200;
  let payload = '';
  const response = {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
      return response;
    },
    status(code) {
      statusCode = Number(code);
      return response;
    },
    send(body = '') {
      payload = String(body);
      return response;
    },
    end(body = '') {
      payload = String(body);
      return response;
    },
  };
  ownerFirstUiHandler({ method: 'GET', headers: {} }, response);
  if (statusCode !== 200) throw new Error(`DABBIR_OWNER_FIRST_INLINE_STATUS_${statusCode}`);
  if (!payload.includes("window.__dabbirUiAuthority={version:'owner-first-v4'")) {
    throw new Error('DABBIR_OWNER_FIRST_INLINE_AUTHORITY_MISSING');
  }
  if (/<\/script/i.test(payload)) throw new Error('DABBIR_OWNER_FIRST_INLINE_UNSAFE_SCRIPT_CLOSE');
  const contentType = headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/javascript')) {
    throw new Error(`DABBIR_OWNER_FIRST_INLINE_CONTENT_TYPE_${contentType || 'missing'}`);
  }
  return `${ownerFirstProbeScript()}\n<script data-dabbir-owner-first-inline="owner-first-v4">\n${payload}\n</script>\n${ownerFirstPostScript()}`;
}

function orderOwnerFirstBeforeAuthBoot(body) {
  if (typeof body !== 'string') return body;
  const ownerScripts = body.match(OWNER_FIRST_SCRIPT_RE) || [];
  if (ownerScripts.length !== 1) throw new Error(`DABBIR_OWNER_FIRST_SCRIPT_COUNT_${ownerScripts.length}`);
  const firstBoot = body.indexOf(AUTH_BOOT_ANCHOR);
  const secondBoot = firstBoot < 0 ? -1 : body.indexOf(AUTH_BOOT_ANCHOR, firstBoot + AUTH_BOOT_ANCHOR.length);
  if (firstBoot < 0 || secondBoot >= 0) throw new Error(`DABBIR_AUTH_BOOT_ANCHOR_COUNT_${firstBoot < 0 ? 0 : 2}`);

  const withoutLateOwner = body.replace(ownerScripts[0], '');
  const inlineOwner = ownerFirstInlineScript();
  return withoutLateOwner.replace(
    AUTH_BOOT_ANCHOR,
    `</script>\n${inlineOwner}\n<script>\napplyLang();boot();\n</script>`,
  );
}

function injectMobileMenuTouchTarget(body) {
  if (typeof body !== 'string' || body.includes('data-dabbir-mobile-menu-touch-target')) return body;
  return body.replace('</head>', `${MOBILE_MENU_TOUCH_TARGET}\n</head>`);
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
      res.setHeader('x-dabbir-first-paint-authority', 'owner-first-inline-diagnostic-before-auth-boot-v3');
      res.statusCode = Number(proxy.statusCode || 200);
      const fresh = bustUiAssetVersion(body);
      const canonical = stripLegacyNavigationOverrides(fresh);
      const ordered = orderOwnerFirstBeforeAuthBoot(canonical);
      const touchSafe = injectMobileMenuTouchTarget(ordered);
      return res.end(injectSafariAuthFailOpen(touchSafe));
    },
  };

  return appRecoveryHandler(req, proxy);
}
