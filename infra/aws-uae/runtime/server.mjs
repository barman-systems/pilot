import http from 'node:http';

const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT || 8080)));
const HOST = process.env.HOST || '0.0.0.0';
const ROUTE_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
const JSON_BODY_ROUTES = new Set(['dabbir-ai', 'translate']);
const RAW_BODY_ROUTES = new Set(['dabbir-whatsapp-webhook']);
const MAX_PREPARSED_BODY_BYTES = 2 * 1024 * 1024;

function json(res, status, body) {
  if (!res.headersSent) res.setHeader('content-type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function augmentResponse(res) {
  res.status = code => {
    res.statusCode = Number(code) || 500;
    return res;
  };
  res.json = body => {
    if (!res.headersSent && !res.hasHeader('content-type')) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = body => {
    if (body == null) res.end();
    else if (Buffer.isBuffer(body) || body instanceof Uint8Array) res.end(body);
    else if (typeof body === 'object') res.json(body);
    else res.end(String(body));
    return res;
  };
  return res;
}

function attachQuery(req, url) {
  const query = Object.create(null);
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : (values[0] ?? '');
  }
  req.query = query;
}

async function readBody(req, maxBytes = MAX_PREPARSED_BODY_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('PAYLOAD_TOO_LARGE');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function prepareVercelBody(req, routeName) {
  if (!JSON_BODY_ROUTES.has(routeName) && !RAW_BODY_ROUTES.has(routeName)) return;
  const rawBody = await readBody(req);
  req.rawBody = rawBody;

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (RAW_BODY_ROUTES.has(routeName) && !contentType.includes('application/json')) {
    req.body = rawBody;
    return;
  }

  if (!rawBody.length) {
    req.body = {};
    return;
  }

  try {
    req.body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    const error = new Error('INVALID_JSON');
    error.statusCode = 400;
    throw error;
  }
}

async function loadHandler(routeName) {
  if (!ROUTE_RE.test(routeName) || routeName.startsWith('_')) return null;
  try {
    const moduleUrl = new URL(`../../../api/${routeName}.js`, import.meta.url);
    const mod = await import(moduleUrl.href);
    return typeof mod.default === 'function' ? mod.default : null;
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function handle(req, res) {
  augmentResponse(res);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-dabbir-runtime', 'aws-uae-fargate');

  const url = new URL(req.url || '/', 'http://dabbir.internal');
  if (url.pathname === '/healthz') {
    return json(res, 200, {
      ok: true,
      app: 'dabbir',
      runtime: 'aws-uae-fargate',
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'unknown',
      timestamp: new Date().toISOString(),
    });
  }

  const match = /^\/api\/([a-z0-9][a-z0-9-]{0,119})\/?$/.exec(url.pathname);
  if (!match) return json(res, 404, { ok: false, error: 'NOT_FOUND' });

  const routeName = match[1];
  attachQuery(req, url);

  try {
    await prepareVercelBody(req, routeName);
    const handler = await loadHandler(routeName);
    if (!handler) return json(res, 404, { ok: false, error: 'NOT_FOUND' });
    await handler(req, res);
    if (!res.writableEnded) {
      return json(res, 500, { ok: false, error: 'HANDLER_DID_NOT_END_RESPONSE' });
    }
  } catch (error) {
    console.error('dabbir_runtime_request_failed', {
      route: routeName,
      method: req.method,
      error: String(error?.message || 'RUNTIME_ERROR').slice(0, 160),
    });
    if (!res.headersSent && !res.writableEnded) {
      return json(res, Number(error?.statusCode || 500), {
        ok: false,
        error: Number(error?.statusCode) === 413 ? 'PAYLOAD_TOO_LARGE' : Number(error?.statusCode) === 400 ? 'INVALID_JSON' : 'INTERNAL_SERVER_ERROR',
      });
    }
    if (!res.writableEnded) res.end();
  }
}

const server = http.createServer((req, res) => {
  void handle(req, res);
});

server.requestTimeout = 65_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

server.listen(PORT, HOST, () => {
  console.log('dabbir_runtime_ready', {
    host: HOST,
    port: PORT,
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'unknown',
  });
});

function shutdown(signal) {
  console.log('dabbir_runtime_shutdown', { signal });
  server.close(error => {
    if (error) {
      console.error('dabbir_runtime_shutdown_failed', { error: String(error.message || error) });
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
