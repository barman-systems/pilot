import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/release-evidence.js';

const EXPECTED = {
  VERCEL_GIT_COMMIT_SHA: '4c61654500a8bf309cd59ca1dcbdabf6915a6d8a',
  VERCEL_DEPLOYMENT_ID: 'dpl_7h53fmTenbsfZRAEiYrhv5Qrse6V',
  VERCEL_TARGET_ENV: 'production',
  VERCEL_GIT_COMMIT_REF: 'main',
  VERCEL_PROJECT_ID: 'prj_HCTFdQo8Vc7FvZRdJ37H7KFYwpUq',
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'barman-systems',
  VERCEL_GIT_REPO_SLUG: 'pilot',
};
const KEYS = Object.keys(EXPECTED);

function invoke(method = 'GET') {
  const headers = new Map();
  let text = '';
  const res = {
    statusCode: 0,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    end(value = '') { text = String(value); },
  };
  handler({ method }, res);
  return { status: res.statusCode, headers, body: JSON.parse(text) };
}

async function withEnv(overrides, fn) {
  const before = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
  try {
    for (const key of KEYS) {
      const value = Object.hasOwn(overrides, key) ? overrides[key] : EXPECTED[key];
      if (value === undefined || value === null) delete process.env[key];
      else process.env[key] = String(value);
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('release evidence returns exact Vercel project and Git source identity', async () => {
  await withEnv({}, () => {
    const result = invoke();
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.commit_sha, EXPECTED.VERCEL_GIT_COMMIT_SHA);
    assert.equal(result.body.deployment_id, EXPECTED.VERCEL_DEPLOYMENT_ID);
    assert.equal(result.body.environment, 'production');
    assert.equal(result.body.git_ref, 'main');
    assert.equal(result.body.project_id, EXPECTED.VERCEL_PROJECT_ID);
    assert.equal(result.body.git_provider, 'github');
    assert.equal(result.body.repository, 'barman-systems/pilot');
    assert.equal(result.headers.get('cache-control'), 'no-store, max-age=0');
  });
});

test('release evidence fails closed when Vercel project identity is missing', async () => {
  await withEnv({ VERCEL_PROJECT_ID: null }, () => {
    const result = invoke();
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'RELEASE_SOURCE_IDENTITY_UNAVAILABLE');
  });
});

test('release evidence fails closed when Vercel project is not DABBIR', async () => {
  await withEnv({ VERCEL_PROJECT_ID: 'prj_wrong' }, () => {
    const result = invoke();
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'RELEASE_SOURCE_IDENTITY_MISMATCH');
    assert.equal(result.body.project_id, 'prj_wrong');
  });
});

test('release evidence fails closed when the live Git repository is relinked', async () => {
  await withEnv({ VERCEL_GIT_REPO_SLUG: 'other-repository' }, () => {
    const result = invoke();
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'RELEASE_SOURCE_IDENTITY_MISMATCH');
    assert.equal(result.body.repository, 'barman-systems/other-repository');
  });
});

test('release evidence fails closed when Git provider identity drifts', async () => {
  await withEnv({ VERCEL_GIT_PROVIDER: 'gitlab' }, () => {
    const result = invoke();
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'RELEASE_SOURCE_IDENTITY_MISMATCH');
  });
});

test('release evidence still rejects unavailable commit evidence', async () => {
  await withEnv({ VERCEL_GIT_COMMIT_SHA: null }, () => {
    const result = invoke();
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'RELEASE_COMMIT_EVIDENCE_UNAVAILABLE');
  });
});

test('release evidence rejects non-GET requests without source disclosure', async () => {
  await withEnv({}, () => {
    const result = invoke('POST');
    assert.equal(result.status, 405);
    assert.deepEqual(result.body, { ok: false, error: 'METHOD_NOT_ALLOWED' });
    assert.equal(result.headers.get('allow'), 'GET');
  });
});
