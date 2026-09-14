import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/dabbir-vercel-runtime-broker/index.ts',import.meta.url),'utf8');

test('Vercel runtime broker cannot return service-role credentials',()=>{
  assert.match(source,/const action = String\(body\.action \|\| "ping"\)/);
  assert.match(source,/if \(action !== "ping"\) return json\(400, \{ ok: false, error: "INVALID_ACTION" \}\)/);
  assert.doesNotMatch(source,/service_role_key\s*:/i);
  assert.doesNotMatch(source,/action\s*!==\s*"credential"/);
});

test('Vercel runtime broker keeps exact production OIDC identity binding',()=>{
  assert.match(source,/EXPECTED_AUDIENCE = `https:\/\/vercel\.com\/\$\{OWNER_SLUG\}`/);
  assert.match(source,/EXPECTED_SUBJECT = `owner:\$\{OWNER_SLUG\}:project:\$\{PROJECT_NAME\}:environment:production`/);
  assert.match(source,/payload\.owner_id !== OWNER_ID/);
  assert.match(source,/payload\.project_id !== PROJECT_ID/);
  assert.match(source,/payload\.project !== PROJECT_NAME/);
  assert.match(source,/payload\.environment !== "production"/);
  assert.match(source,/jwtVerify\(token, jwks, \{/);
});

test('preflight response remains metadata-only',()=>{
  assert.match(source,/credential_available: Boolean\(Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\)/);
  assert.doesNotMatch(source,/TARGET_PUBLISHABLE_KEY/);
  assert.doesNotMatch(source,/supabase_url\s*:/i);
});
