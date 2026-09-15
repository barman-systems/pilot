import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  enforcePreviewPrivilegedEnvBoundary,
  previewPrivilegedEnvFindings,
} from '../scripts/dabbir-preview-privileged-env-guard.mjs';

test('production may use the service-role credential', () => {
  assert.deepEqual(previewPrivilegedEnvFindings({
    VERCEL_ENV: 'production',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-production-secret',
  }), []);
  assert.deepEqual(enforcePreviewPrivilegedEnvBoundary({
    VERCEL_ENV: 'production',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-production-secret',
  }), { ok: true, findings: [] });
});

test('preview fails closed when service-role authority is injected', () => {
  const findings = previewPrivilegedEnvFindings({
    VERCEL_ENV: 'preview',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-production-secret',
  });
  assert.deepEqual(findings, [{ key: 'SUPABASE_SERVICE_ROLE_KEY', environment: 'preview' }]);
  assert.throws(() => enforcePreviewPrivilegedEnvBoundary({
    VERCEL_ENV: 'preview',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-production-secret',
  }), /DABBIR_PREVIEW_PRIVILEGED_ENV_BLOCKED/);
});

test('preview passes when service-role authority is absent', () => {
  assert.deepEqual(enforcePreviewPrivilegedEnvBoundary({
    VERCEL_ENV: 'preview',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  }), { ok: true, findings: [] });
});

test('CLI failure never emits the secret value', () => {
  const secret = 'do-not-print-this-service-role-value';
  const result = spawnSync(process.execPath, ['scripts/dabbir-preview-privileged-env-guard.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      VERCEL_ENV: 'preview',
      SUPABASE_SERVICE_ROLE_KEY: secret,
    },
  });
  assert.equal(result.status, 42);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /DABBIR_PREVIEW_PRIVILEGED_ENV=BLOCKED/);
  assert.match(output, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(output, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Vercel build runs privilege guard before any repository build code', async () => {
  const pkg = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile('package.json', 'utf8')));
  assert.match(pkg.scripts['dabbir:build'], /^node scripts\/dabbir-preview-privileged-env-guard\.mjs && /);
});
