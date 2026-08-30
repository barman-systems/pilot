import appHandler from './app.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://*.facebook.com https://*.fbcdn.net; font-src 'self' data:; connect-src 'self' https://graph.facebook.com https://www.facebook.com https://web.facebook.com; frame-src https://www.facebook.com https://web.facebook.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://connect.facebook.net",
};

// The source-module order remains explicit for architecture and regression tests.
// Runtime delivery is now two static bundles: critical auth UI, then deferred workspace UI.
// Change this release token whenever generated bundle behavior changes so browsers
// can keep long-lived asset caching without serving a previous UI after deployment.
const UI_BUNDLE_VERSION = '20260830-ux-v2';
const UI_MODULE_ORDER = [
  '/api/brand-ui',
  '/api/dabbir-whatsapp-embedded-ui',
  '/api/dabbir-whatsapp-connect-guard-ui',
  '/api/timezone-ui',
  '/api/auth/recovery-ui',
  '/api/chat-human-ui',
  '/api/translation-ui',
  '/api/owner-operations-ui',
  '/api/service-operations-ui',
  '/api/activity-profile-ui',
  '/api/owner-action-center-ui',
  '/api/dabbir-owner-away-ui',
  '/api/dabbir-owner-decision-memory-ui',
  '/api/business-profile-ui',
  '/api/dabbir-customer-number-ui',
  '/api/dabbir-billing-ui',
  '/api/platform-customers-ui',
  '/api/platform-customer-support-ui',
  '/api/platform-recovery-reconciliation-ui',
  '/api/dabbir-owner-first-ui',
  '/api/verified-metrics-ui',
  '/api/customer-activation-ui',
  '/api/owner-copilot-ui',
  '/api/dabbir-contextual-navigation-ui',
  '/api/auth-session-stability-ui',
];

const UI_BUNDLE_LOADER = `<script>
(()=>{
  window.__dabbirCriticalUiReady=true;
  const load=()=>{
    if(!window.__dabbirCriticalUiReady||window.__dabbirDeferredUiRequested)return;
    window.__dabbirDeferredUiRequested=true;
    const script=document.createElement('script');
    script.src='/dabbir-ui-deferred.js?v=${UI_BUNDLE_VERSION}';
    script.async=false;
    script.dataset.dabbirDeferredUi='true';
    script.onload=()=>{window.__dabbirDeferredUiReady=true};
    document.body.appendChild(script);
  };
  window.__dabbirLoadDeferredUi=load;
  if(document.querySelector('#appShell:not(.hidden)')) load();
})();
</script>`;

function forwardHeaders(res, headers) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}

export default function handler(req, res) {
  let statusCode = 200;
  const headers = {};

  const proxy = {
    status(code) {
      statusCode = Number(code || 200);
      return proxy;
    },
    setHeader(key, value) {
      headers[String(key)] = value;
      return proxy;
    },
    end(body = '') {
      forwardHeaders(res, headers);
      res.setHeader('x-dabbir-shell-authority', 'owner-first-v4');
      res.setHeader('x-dabbir-owner-experience', 'verified-copilot-v1.3-workspace-compat');
      res.statusCode = statusCode;
      return res.end(body);
    },
    send(body = '') {
      forwardHeaders(res, headers);
      res.setHeader('x-dabbir-shell-authority', 'owner-first-v4');
      res.setHeader('x-dabbir-owner-experience', 'verified-copilot-v1.3-workspace-compat');
      res.statusCode = statusCode;
      const html = typeof body === 'string'
        ? body.replace('</body>', `<script src="/dabbir-ui-critical.js?v=${UI_BUNDLE_VERSION}"></script>\n` + UI_BUNDLE_LOADER + '\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}
