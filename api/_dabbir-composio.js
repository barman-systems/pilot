import { createHash } from 'node:crypto';

const DEFAULT_BASE_URL = 'https://backend.composio.dev/api/v3.1';
const DEFAULT_TIMEOUT_MS = 8000;
const TOOLKIT_RE = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const TOOL_RE = /^[A-Z0-9][A-Z0-9_]{2,159}$/;
const AUTH_CONFIG_RE = /^ac_[A-Za-z0-9_-]{6,160}$/;
const SESSION_RE = /^trs_[A-Za-z0-9_-]{6,160}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const enabled = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function fail(code, status = 503, extra = {}) {
  return Object.assign(new Error(code), { code, status, ...extra });
}

function normalizeBaseUrl(value) {
  const raw = clean(value || DEFAULT_BASE_URL, 300).replace(/\/$/, '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'backend.composio.dev' || url.pathname !== '/api/v3.1') return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function parsePolicy(raw) {
  let parsed;
  try { parsed = JSON.parse(clean(raw, 30000) || '{}'); }
  catch { return { ok: false, reason: 'COMPOSIO_POLICY_INVALID_JSON', policy: {} }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'COMPOSIO_POLICY_INVALID', policy: {} };

  const policy = {};
  for (const [toolkitRaw, value] of Object.entries(parsed)) {
    const toolkit = clean(toolkitRaw, 80).toLowerCase();
    if (!TOOLKIT_RE.test(toolkit) || !value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: 'COMPOSIO_POLICY_INVALID', policy: {} };
    }
    const tools = Array.isArray(value.tools) ? [...new Set(value.tools.map(v => clean(v, 160).toUpperCase()).filter(Boolean))] : [];
    if (!tools.length || tools.some(tool => !TOOL_RE.test(tool))) return { ok: false, reason: 'COMPOSIO_POLICY_TOOL_INVALID', policy: {} };
    const authConfigId = value.auth_config_id == null ? null : clean(value.auth_config_id, 180);
    if (authConfigId && !AUTH_CONFIG_RE.test(authConfigId)) return { ok: false, reason: 'COMPOSIO_POLICY_AUTH_CONFIG_INVALID', policy: {} };
    policy[toolkit] = { tools, authConfigId };
  }
  if (!Object.keys(policy).length) return { ok: false, reason: 'COMPOSIO_POLICY_EMPTY', policy: {} };
  return { ok: true, reason: null, policy };
}

export function composioConfiguration(env = process.env) {
  if (!enabled(env.DABBIR_COMPOSIO_ENABLED)) return { active: false, reason: 'COMPOSIO_DISABLED' };
  const apiKey = clean(env.COMPOSIO_API_KEY, 4096);
  if (apiKey.length < 20) return { active: false, reason: 'COMPOSIO_API_KEY_MISSING' };
  const baseUrl = normalizeBaseUrl(env.DABBIR_COMPOSIO_BASE_URL);
  if (!baseUrl) return { active: false, reason: 'COMPOSIO_BASE_URL_INVALID' };
  const parsed = parsePolicy(env.DABBIR_COMPOSIO_TOOL_POLICY_JSON);
  if (!parsed.ok) return { active: false, reason: parsed.reason };
  const timeoutMs = Math.min(15000, Math.max(1000, Number(env.DABBIR_COMPOSIO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  return { active: true, reason: null, apiKey, baseUrl, policy: parsed.policy, timeoutMs };
}

export function composioSubject({ businessId, userId }) {
  const business = clean(businessId, 80);
  const user = clean(userId, 80);
  if (!UUID_RE.test(business) || !UUID_RE.test(user)) throw fail('COMPOSIO_SUBJECT_SCOPE_INVALID', 400);
  const digest = createHash('sha256').update(`dabbir-composio-v1|${business}|${user}`).digest('hex');
  return `dabbir_${digest.slice(0, 48)}`;
}

function ensureConfigured(env) {
  const config = composioConfiguration(env);
  if (!config.active) throw fail(config.reason, 503);
  return config;
}

function selectPolicy(config, requestedToolkits) {
  const known = Object.keys(config.policy);
  const requested = requestedToolkits == null ? known : [...new Set(requestedToolkits.map(v => clean(v, 80).toLowerCase()).filter(Boolean))];
  if (!requested.length || requested.some(toolkit => !config.policy[toolkit])) throw fail('COMPOSIO_TOOLKIT_NOT_ALLOWED', 403);
  return Object.fromEntries(requested.map(toolkit => [toolkit, config.policy[toolkit]]));
}

async function composioRequest(path, { env = process.env, fetchImpl = fetch, method = 'GET', body } = {}) {
  const config = ensureConfigured(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}${path}`, {
      method,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'x-api-key': config.apiKey,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = { error: 'COMPOSIO_NON_JSON_RESPONSE' }; }
    }
    if (!response.ok) {
      throw fail(`COMPOSIO_HTTP_${response.status}`, response.status >= 500 || response.status === 429 ? 503 : 502, {
        providerStatus: response.status,
        providerError: clean(payload?.error || payload?.message, 300) || null,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw fail('COMPOSIO_TIMEOUT', 503, { retryable: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function createComposioSession({ businessId, userId, toolkits = null }, options = {}) {
  const config = ensureConfigured(options.env || process.env);
  const selected = selectPolicy(config, toolkits);
  const enabledToolkits = Object.keys(selected);
  const tools = Object.fromEntries(enabledToolkits.map(toolkit => [toolkit, { enable: selected[toolkit].tools }]));
  const authConfigs = Object.fromEntries(enabledToolkits.filter(toolkit => selected[toolkit].authConfigId).map(toolkit => [toolkit, selected[toolkit].authConfigId]));
  const preloadTools = enabledToolkits.flatMap(toolkit => selected[toolkit].tools).slice(0, 20);
  if (enabledToolkits.flatMap(toolkit => selected[toolkit].tools).length > 20) throw fail('COMPOSIO_PRELOAD_TOOL_LIMIT', 503);

  const payload = await composioRequest('/tool_router/session', {
    ...options,
    env: options.env || process.env,
    method: 'POST',
    body: {
      user_id: composioSubject({ businessId, userId }),
      toolkits: { enable: enabledToolkits },
      ...(Object.keys(authConfigs).length ? { auth_configs: authConfigs } : {}),
      tools,
      manage_connections: { enable: false, enable_wait_for_connections: false, enable_connection_removal: false },
      workbench: { enable: false, enable_proxy_execution: false },
      multi_account: { enable: false, max_accounts_per_toolkit: 1, require_explicit_selection: true },
      preload: { tools: preloadTools },
      search: { enable: false },
      execute: { enable_multi_execute: false },
    },
  });

  if (!SESSION_RE.test(clean(payload?.session_id, 180))) throw fail('COMPOSIO_SESSION_UNVERIFIED', 502);
  const mcpUrl = clean(payload?.mcp?.url, 1000);
  if (mcpUrl) {
    try {
      const url = new URL(mcpUrl);
      if (url.protocol !== 'https:' || !(url.hostname === 'app.composio.dev' || url.hostname.endsWith('.composio.dev'))) throw new Error('bad');
    } catch { throw fail('COMPOSIO_MCP_URL_UNTRUSTED', 502); }
  }
  return {
    sessionId: payload.session_id,
    mcp: mcpUrl ? { type: payload?.mcp?.type === 'sse' ? 'sse' : 'http', url: mcpUrl, headers: payload?.mcp?.headers || undefined } : null,
    toolkits: enabledToolkits,
    tools: preloadTools,
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.slice(0, 10) : [],
  };
}

export async function executeComposioTool({ sessionId, toolkit, tool, arguments: args = {}, account = null }, options = {}) {
  const config = ensureConfigured(options.env || process.env);
  const selected = selectPolicy(config, [toolkit]);
  const normalizedToolkit = clean(toolkit, 80).toLowerCase();
  const normalizedTool = clean(tool, 160).toUpperCase();
  if (!selected[normalizedToolkit].tools.includes(normalizedTool)) throw fail('COMPOSIO_TOOL_NOT_ALLOWED', 403);
  if (!SESSION_RE.test(clean(sessionId, 180))) throw fail('COMPOSIO_SESSION_INVALID', 400);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail('COMPOSIO_ARGUMENTS_INVALID', 400);
  const payload = await composioRequest(`/tool_router/session/${encodeURIComponent(sessionId)}/execute`, {
    ...options,
    env: options.env || process.env,
    method: 'POST',
    body: {
      tool_slug: normalizedTool,
      arguments: args,
      ...(account ? { account: clean(account, 180) } : {}),
      enable_auto_workbench_offload: false,
    },
  });
  return { data: payload?.data ?? null, error: clean(payload?.error, 300) || null, logId: clean(payload?.log_id, 180) || null };
}

export async function createComposioAuthLink({ businessId, userId, toolkit, callbackUrl }, options = {}) {
  const config = ensureConfigured(options.env || process.env);
  const selected = selectPolicy(config, [toolkit]);
  const normalizedToolkit = clean(toolkit, 80).toLowerCase();
  const authConfigId = selected[normalizedToolkit].authConfigId;
  if (!authConfigId) throw fail('COMPOSIO_AUTH_CONFIG_REQUIRED', 503);
  let callback;
  try {
    callback = new URL(String(callbackUrl || ''));
    if (callback.protocol !== 'https:' || !callback.hostname) throw new Error('bad');
  } catch { throw fail('COMPOSIO_CALLBACK_INVALID', 400); }

  const payload = await composioRequest('/connected_accounts/link', {
    ...options,
    env: options.env || process.env,
    method: 'POST',
    body: {
      auth_config_id: authConfigId,
      user_id: composioSubject({ businessId, userId }),
      callback_url: callback.toString(),
    },
  });
  const redirectUrl = clean(payload?.redirect_url, 1200);
  if (!redirectUrl) throw fail('COMPOSIO_AUTH_LINK_UNVERIFIED', 502);
  try {
    const redirect = new URL(redirectUrl);
    if (redirect.protocol !== 'https:' || !(redirect.hostname === 'app.composio.dev' || redirect.hostname.endsWith('.composio.dev'))) throw new Error('bad');
  } catch { throw fail('COMPOSIO_AUTH_REDIRECT_UNTRUSTED', 502); }
  return {
    redirectUrl,
    expiresAt: clean(payload?.expires_at, 80) || null,
    connectedAccountId: clean(payload?.connected_account_id, 180) || null,
  };
}
