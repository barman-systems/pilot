import appHandler from './app.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://*.facebook.com https://*.fbcdn.net; font-src 'self' data:; connect-src 'self' https://graph.facebook.com https://www.facebook.com https://web.facebook.com; frame-src https://www.facebook.com https://web.facebook.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://connect.facebook.net",
};

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
        ? body.replace('</body>', '<script src="/api/brand-ui"></script>\n<script src="/api/dabbir-whatsapp-embedded-ui"></script>\n<script src="/api/dabbir-whatsapp-connect-guard-ui"></script>\n<script src="/api/timezone-ui"></script>\n<script src="/api/auth/recovery-ui"></script>\n<script src="/api/chat-human-ui"></script>\n<script src="/api/translation-ui"></script>\n<script src="/api/owner-operations-ui"></script>\n<script src="/api/service-operations-ui"></script>\n<script src="/api/activity-profile-ui"></script>\n<script src="/api/owner-action-center-ui"></script>\n<script src="/api/dabbir-owner-away-ui"></script>\n<script src="/api/dabbir-owner-decision-memory-ui"></script>\n<script src="/api/business-profile-ui"></script>\n<script src="/api/dabbir-customer-number-ui"></script>\n<script src="/api/dabbir-billing-ui"></script>\n<script src="/api/platform-customers-ui"></script>\n<script src="/api/platform-customer-support-ui"></script>\n<script src="/api/platform-recovery-reconciliation-ui"></script>\n<script src="/api/dabbir-owner-first-ui"></script>\n<script src="/api/verified-metrics-ui"></script>\n<script src="/api/customer-activation-ui"></script>\n<script>(()=>{try{if(!Object.prototype.hasOwnProperty.call(window,"workspace"))Object.defineProperty(window,"workspace",{configurable:true,enumerable:false,get(){try{return workspace}catch{return null}}})}catch{}})();</script>\n<script src="/api/owner-copilot-ui"></script>\n<script src="/api/dabbir-contextual-navigation-ui"></script>\n<script src="/api/auth-session-stability-ui"></script>\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}
