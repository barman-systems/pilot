import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.join(root, 'api');
const retiredRef = 'spohjzrsymsmzsseygtw';
const mumbaiRef = 'fphpoysqdsceniwduxjq';
const retiredPublishableKey = 'sb_publishable_WPxhwNf08BW1FgBptkinWg_3j75O4O3';

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? jsFiles(full) : entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

test('runtime API cannot silently fall back to the retired Sydney Supabase project', () => {
  const offenders = [];
  for (const file of jsFiles(apiRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes(retiredRef) || source.includes(retiredPublishableKey)) {
      offenders.push(path.relative(root, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('production Auth guard is pinned to Mumbai and not the retired Sydney project', () => {
  const source = fs.readFileSync(path.join(root, '.github', 'workflows', 'dabbir-auth-production.yml'), 'utf8');
  assert.match(source, new RegExp(`PROJECT_REF:\\s*${mumbaiRef}`));
  assert.doesNotMatch(source, new RegExp(`PROJECT_REF:\\s*${retiredRef}`));
});

test('auth core has no legacy Supabase origin constant', () => {
  const source = fs.readFileSync(path.join(apiRoot, '_auth-core.js'), 'utf8');
  assert.doesNotMatch(source, /LEGACY_SUPABASE_URL/);
  assert.match(source, /process\.env\.SUPABASE_AUTH_URL\s*\|\|\s*process\.env\.SUPABASE_URL/);
  assert.match(source, /process\.env\.SUPABASE_DATA_URL\s*\|\|\s*process\.env\.SUPABASE_URL/);
});

test('runtime Supabase URLs do not coerce a missing env value into the string undefined', () => {
  const offenders = [];
  for (const file of jsFiles(apiRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    if (/String\(process\.env\.SUPABASE_URL\)\.replace/.test(source)) {
      offenders.push(path.relative(root, file));
    }
  }
  assert.deepEqual(offenders, []);
});
