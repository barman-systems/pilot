import appRecoveryHandler from './app-recovery.js';
import ownerFirstUiHandler from './dabbir-owner-first-ui.js';

const UI_CACHE_BUST = '20260903-chat-render-lifecycle-v3';
const SAFARI_AUTH_FAIL_OPEN = `/api/dabbir-safari-auth-fail-open-ui?v=${UI_CACHE_BUST}`;
const LEGACY_STORE_SLOT_HIDE = `document.querySelectorAll('[data-screen="appointments"]').forEach(el=>{el.style.display=isStore?'none':''});`;
const LEGACY_STORE_APPOINTMENT_REDIRECT = `if(name==='appointments'&&String(workspace?.business?.business_type||'').toLowerCase()==='store') name='dashboard';`;
const OWNER_FIRST_SCRIPT_RE = /<script src="\/api\/dabbir-owner-first-ui\?v=[^"\s<]+"><\/script>/g;
const AUTH_BOOT_ANCHOR = 'applyLang();boot();\n</script>';
const DESIGN_AUTHORITY_SCRIPT = String.raw`(()=>{
  if(window.__dabbirDesignAuthorityHeadV2)return;
  window.__dabbirDesignAuthorityHeadV2=true;
  let frame=0;
  let observer=null;
  function reassertAuthority(){
    frame=0;
    const style=document.querySelector('style[data-dabbir-design-system="executive-calm-v1"]');
    if(!style||!document.head)return false;
    if(style.parentNode!==document.head||style!==document.head.lastElementChild)document.head.appendChild(style);
    if(document.body)document.body.dataset.dabbirDesign='executive-calm-v1';
    return true;
  }
  function schedule(){
    if(frame)return;
    if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(reassertAuthority);
    else frame=setTimeout(reassertAuthority,0);
  }
  try{
    observer=new MutationObserver(schedule);
    if(document.head)observer.observe(document.head,{childList:true});
  }catch(_error){}
  try{
    window.__dabbirUiLifecycle?.on?.('afterRender','executive-calm-authority',schedule);
    window.__dabbirUiLifecycle?.on?.('afterNavigate','executive-calm-authority',schedule);
    window.__dabbirUiLifecycle?.on?.('afterLanguage','executive-calm-authority',schedule);
  }catch(_error){}
  window.addEventListener('load',schedule,{once:true});
  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,1400);
  window.__dabbirDesignAuthority={version:'executive-calm-v1',mode:'head-tail-reassert',pollingLoops:0,presentationObservers:1,bodyObservers:0};
})();`;

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
  if (!payload.includes("designSystem:'executive-calm-v1'")) {
    throw new Error('DABBIR_EXECUTIVE_CALM_AUTHORITY_MISSING');
  }
  if (/<\/script/i.test(payload)) throw new Error('DABBIR_OWNER_FIRST_INLINE_UNSAFE_SCRIPT_CLOSE');
  const contentType = headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/javascript')) {
    throw new Error(`DABBIR_OWNER_FIRST_INLINE_CONTENT_TYPE_${contentType || 'missing'}`);
  }
  return `<script data-dabbir-owner-first-inline="owner-first-v4">\n${payload}\n</script>`;
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

function injectSafariAuthFailOpen(body) {
  if (typeof body !== 'string') return body;
  let next = body;
  if (!next.includes('/api/dabbir-safari-auth-fail-open-ui')) {
    next = next.replace('</body>', `<script src="${SAFARI_AUTH_FAIL_OPEN}"></script>\n</body>`);
  }
  if (!next.includes('data-dabbir-design-authority-head="executive-calm-v1"')) {
    next = next.replace(
      '</body>',
      `<script data-dabbir-design-authority-head="executive-calm-v1">\n${DESIGN_AUTHORITY_SCRIPT}\n</script>\n</body>`,
    );
  }
  return next;
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
      res.setHeader('x-dabbir-first-paint-authority', 'owner-first-inline-before-auth-boot-v2');
      res.setHeader('x-dabbir-design-authority', 'executive-calm-v1');
      res.statusCode = Number(proxy.statusCode || 200);
      const fresh = bustUiAssetVersion(body);
      const canonical = stripLegacyNavigationOverrides(fresh);
      const ordered = orderOwnerFirstBeforeAuthBoot(canonical);
      return res.end(injectSafariAuthFailOpen(ordered));
    },
  };

  return appRecoveryHandler(req, proxy);
}
