import appHandler from './app.js';

function forwardHeaders(res, headers) {
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
      res.statusCode = statusCode;
      return res.end(body);
    },
    send(body = '') {
      forwardHeaders(res, headers);
      res.statusCode = statusCode;
      const html = typeof body === 'string'
        ? body.replace('</body>', '<script src="/api/brand-ui"></script>\n<script src="/api/dabbir-logo-placement-ui"></script>\n<script src="/api/dabbir-whatsapp-embedded-ui"></script>\n<script src="/api/timezone-ui"></script>\n<script src="/api/auth/recovery-ui"></script>\n<script src="/api/chat-human-ui"></script>\n<script src="/api/translation-ui"></script>\n<script src="/api/owner-operations-ui"></script>\n<script src="/api/service-operations-ui"></script>\n<script src="/api/activity-profile-ui"></script>\n<script src="/api/owner-action-center-ui"></script>\n<script src="/api/dabbir-owner-away-ui"></script>\n<script src="/api/dabbir-owner-decision-memory-ui"></script>\n<script src="/api/business-profile-ui"></script>\n<script src="/api/dabbir-customer-number-ui"></script>\n<script src="/api/activity-mobile-polish-ui"></script>\n<script src="/api/dabbir-ui-refinement"></script>\n<script src="/api/dabbir-mobile-shell-v3"></script>\n</body>')
        : body;
      return res.end(html);
    },
  };

  return appHandler(req, proxy);
}
