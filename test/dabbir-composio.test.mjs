import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composioConfiguration,
  composioSubject,
  createComposioSession,
  executeComposioTool,
  createComposioAuthLink,
} from '../api/_dabbir-composio.js';

const ids = {
  businessId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
};
const policy = JSON.stringify({
  googlecalendar: {
    auth_config_id: 'ac_googlecalendar_test123',
    tools: ['GOOGLECALENDAR_FIND_EVENT', 'GOOGLECALENDAR_CREATE_EVENT'],
  },
});
const env = {
  DABBIR_COMPOSIO_ENABLED: '1',
  COMPOSIO_API_KEY: 'cmp_test_abcdefghijklmnopqrstuvwxyz',
  DABBIR_COMPOSIO_TOOL_POLICY_JSON: policy,
};

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

test('configuration fails closed when disabled or missing policy', () => {
  assert.equal(composioConfiguration({}).reason, 'COMPOSIO_DISABLED');
  assert.equal(composioConfiguration({ DABBIR_COMPOSIO_ENABLED: '1' }).reason, 'COMPOSIO_API_KEY_MISSING');
  assert.equal(composioConfiguration({ DABBIR_COMPOSIO_ENABLED: '1', COMPOSIO_API_KEY: env.COMPOSIO_API_KEY }).reason, 'COMPOSIO_POLICY_EMPTY');
});

test('configuration rejects alternate Composio origins', () => {
  const cfg = composioConfiguration({ ...env, DABBIR_COMPOSIO_BASE_URL: 'https://evil.example/api/v3.1' });
  assert.equal(cfg.active, false);
  assert.equal(cfg.reason, 'COMPOSIO_BASE_URL_INVALID');
});

test('subject is stable and contains no raw tenant or user id', () => {
  const first = composioSubject(ids);
  const second = composioSubject(ids);
  assert.equal(first, second);
  assert.match(first, /^dabbir_[a-f0-9]{48}$/);
  assert.equal(first.includes(ids.businessId), false);
  assert.equal(first.includes(ids.userId), false);
});

test('session creation sends exact allowlists and disables dangerous helper surfaces', async () => {
  let seen;
  const result = await createComposioSession({ ...ids }, {
    env,
    fetchImpl: async (url, options) => {
      seen = { url, headers: options.headers, body: JSON.parse(options.body) };
      return response(201, {
        session_id: 'trs_session_test12345',
        mcp: { type: 'http', url: 'https://app.composio.dev/tool_router/v3/trs_session_test12345/mcp' },
        warnings: [],
      });
    },
  });
  assert.equal(seen.url, 'https://backend.composio.dev/api/v3.1/tool_router/session');
  assert.equal(seen.headers['x-api-key'], env.COMPOSIO_API_KEY);
  assert.deepEqual(seen.body.toolkits, { enable: ['googlecalendar'] });
  assert.deepEqual(seen.body.tools.googlecalendar.enable, ['GOOGLECALENDAR_FIND_EVENT', 'GOOGLECALENDAR_CREATE_EVENT']);
  assert.deepEqual(seen.body.manage_connections, { enable: false, enable_wait_for_connections: false, enable_connection_removal: false });
  assert.deepEqual(seen.body.workbench, { enable: false, enable_proxy_execution: false });
  assert.equal(seen.body.search.enable, false);
  assert.equal(seen.body.execute.enable_multi_execute, false);
  assert.equal(result.sessionId, 'trs_session_test12345');
});

test('execution rejects any tool outside the server-side allowlist without network access', async () => {
  let called = false;
  await assert.rejects(
    executeComposioTool({ sessionId: 'trs_session_test12345', toolkit: 'googlecalendar', tool: 'GOOGLECALENDAR_DELETE_EVENT' }, {
      env,
      fetchImpl: async () => { called = true; return response(200, {}); },
    }),
    error => error?.code === 'COMPOSIO_TOOL_NOT_ALLOWED' && error?.status === 403,
  );
  assert.equal(called, false);
});

test('allowed tool execution is scoped to the existing session and disables workbench offload', async () => {
  let seen;
  const result = await executeComposioTool({
    sessionId: 'trs_session_test12345',
    toolkit: 'googlecalendar',
    tool: 'googlecalendar_find_event',
    arguments: { query: 'tomorrow' },
  }, {
    env,
    fetchImpl: async (url, options) => {
      seen = { url, body: JSON.parse(options.body) };
      return response(200, { data: { items: [] }, log_id: 'log_123' });
    },
  });
  assert.equal(seen.url, 'https://backend.composio.dev/api/v3.1/tool_router/session/trs_session_test12345/execute');
  assert.equal(seen.body.tool_slug, 'GOOGLECALENDAR_FIND_EVENT');
  assert.equal(seen.body.enable_auto_workbench_offload, false);
  assert.deepEqual(result, { data: { items: [] }, error: null, logId: 'log_123' });
});

test('auth links use the toolkit auth config and never expose the raw DABBIR ids', async () => {
  let seen;
  const result = await createComposioAuthLink({ ...ids, toolkit: 'googlecalendar', callbackUrl: 'https://dabbir.bmalman.com/app?screen=integrations' }, {
    env,
    fetchImpl: async (url, options) => {
      seen = { url, body: JSON.parse(options.body) };
      return response(201, {
        redirect_url: 'https://app.composio.dev/link/test123',
        expires_at: '2026-09-08T12:00:00Z',
        connected_account_id: 'ca_test123',
      });
    },
  });
  assert.equal(seen.url, 'https://backend.composio.dev/api/v3.1/connected_accounts/link');
  assert.equal(seen.body.auth_config_id, 'ac_googlecalendar_test123');
  assert.equal(seen.body.user_id.includes(ids.businessId), false);
  assert.equal(seen.body.user_id.includes(ids.userId), false);
  assert.equal(result.redirectUrl, 'https://app.composio.dev/link/test123');
});

test('provider rate limit is surfaced as retryable fail-closed error', async () => {
  await assert.rejects(
    createComposioSession({ ...ids }, { env, fetchImpl: async () => response(429, { error: 'rate limited' }) }),
    error => error?.code === 'COMPOSIO_HTTP_429' && error?.retryable === true && error?.status === 503,
  );
});
