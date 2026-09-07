import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const PROJECT_REF = String(process.env.PROJECT_REF || '').trim();
const MANAGEMENT_TOKEN = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const LOCAL_URL = String(process.env.LOCAL_SUPABASE_URL || '').replace(/\/$/, '');
const LOCAL_SERVICE_KEY = String(process.env.LOCAL_SUPABASE_SERVICE_KEY || '').trim();
const EVIDENCE_PATH = String(process.env.STORAGE_EVIDENCE_PATH || 'recovery-evidence/storage-restore.json');
const PROD_URL = `https://${PROJECT_REF}.supabase.co`;

if (!/^[a-z0-9]{20}$/.test(PROJECT_REF)) throw new Error('PROJECT_REF_REQUIRED');
if (!MANAGEMENT_TOKEN) throw new Error('MANAGEMENT_TOKEN_REQUIRED');
if (!LOCAL_URL.startsWith('http://127.0.0.1:')) throw new Error('LOCAL_SUPABASE_URL_REQUIRED');
if (!LOCAL_SERVICE_KEY) throw new Error('LOCAL_SERVICE_KEY_REQUIRED');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pathEncode = value => String(value).split('/').map(encodeURIComponent).join('/');

async function request(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

function storageHeaders(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function managementKeys() {
  const response = await request(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true`,
    { headers: { authorization: `Bearer ${MANAGEMENT_TOKEN}`, accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`API_KEYS_HTTP_${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error('API_KEYS_SHAPE_INVALID');
  return body;
}

async function resolveProductionStorageKey() {
  const keys = await managementKeys();
  const values = [];
  for (const item of keys) {
    const key = String(item?.api_key || '').trim();
    if (!key) continue;
    const label = `${item?.name || ''} ${item?.type || ''}`.toLowerCase();
    if (label.includes('service_role') || key.startsWith('sb_secret_')) values.unshift(key);
    else values.push(key);
  }
  for (const key of [...new Set(values)]) {
    const probe = await request(`${PROD_URL}/storage/v1/bucket`, { headers: storageHeaders(key) }).catch(() => null);
    if (probe?.ok) return key;
  }
  throw new Error('PRODUCTION_STORAGE_ADMIN_KEY_UNRESOLVED');
}

async function buckets(baseUrl, key) {
  const response = await request(`${baseUrl}/storage/v1/bucket`, { headers: storageHeaders(key) });
  if (!response.ok) throw new Error(`BUCKET_LIST_HTTP_${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error('BUCKET_LIST_SHAPE_INVALID');
  return body;
}

async function listDirectory(baseUrl, key, bucketId, prefix = '') {
  const output = [];
  let offset = 0;
  for (;;) {
    const response = await request(`${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucketId)}`, {
      method: 'POST',
      headers: storageHeaders(key, { 'content-type': 'application/json' }),
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!response.ok) throw new Error(`OBJECT_LIST_HTTP_${response.status}`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error('OBJECT_LIST_SHAPE_INVALID');
    output.push(...items);
    if (items.length < 100) break;
    offset += items.length;
    if (offset > 1_000_000) throw new Error('OBJECT_LIST_PAGINATION_GUARD');
  }
  return output;
}

async function listObjectsRecursive(baseUrl, key, bucketId) {
  const files = [];
  const queue = [''];
  const seen = new Set();
  while (queue.length) {
    const prefix = queue.shift();
    if (seen.has(prefix)) continue;
    seen.add(prefix);
    const items = await listDirectory(baseUrl, key, bucketId, prefix);
    for (const item of items) {
      const name = String(item?.name || '');
      if (!name || name === '.emptyFolderPlaceholder') continue;
      const full = `${prefix}${name}`;
      if (item?.id == null) queue.push(`${full.replace(/\/$/, '')}/`);
      else files.push(full);
    }
    if (seen.size > 10000) throw new Error('OBJECT_TREE_GUARD');
  }
  return [...new Set(files)].sort();
}

async function downloadObject(baseUrl, key, bucketId, objectPath) {
  const response = await request(
    `${baseUrl}/storage/v1/object/${encodeURIComponent(bucketId)}/${pathEncode(objectPath)}`,
    { headers: storageHeaders(key) },
    30000,
  );
  if (!response.ok) throw new Error(`OBJECT_DOWNLOAD_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, contentType: response.headers.get('content-type') || 'application/octet-stream' };
}

async function uploadObject(baseUrl, key, bucketId, objectPath, bytes, contentType) {
  const response = await request(
    `${baseUrl}/storage/v1/object/${encodeURIComponent(bucketId)}/${pathEncode(objectPath)}`,
    {
      method: 'POST',
      headers: storageHeaders(key, {
        'content-type': contentType || 'application/octet-stream',
        'x-upsert': 'true',
      }),
      body: bytes,
    },
    30000,
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OBJECT_UPLOAD_HTTP_${response.status}_${detail.slice(0,120).replace(/[^a-zA-Z0-9 _-]/g,'')}`);
  }
}

const productionKey = await resolveProductionStorageKey();
const prodBuckets = await buckets(PROD_URL, productionKey);
const localBuckets = await buckets(LOCAL_URL, LOCAL_SERVICE_KEY);
const localIds = new Set(localBuckets.map(item => String(item?.id || '')));

let objectCount = 0;
let verifiedObjects = 0;
let totalBytes = 0;
const mismatches = [];
for (const bucket of prodBuckets) {
  const bucketId = String(bucket?.id || '');
  if (!bucketId) throw new Error('BUCKET_ID_INVALID');
  if (!localIds.has(bucketId)) throw new Error('RESTORED_BUCKET_MISSING');
  const paths = await listObjectsRecursive(PROD_URL, productionKey, bucketId);
  for (const objectPath of paths) {
    objectCount += 1;
    const source = await downloadObject(PROD_URL, productionKey, bucketId, objectPath);
    totalBytes += source.bytes.length;
    const sourceHash = sha256(source.bytes);
    await uploadObject(LOCAL_URL, LOCAL_SERVICE_KEY, bucketId, objectPath, source.bytes, source.contentType);
    const restored = await downloadObject(LOCAL_URL, LOCAL_SERVICE_KEY, bucketId, objectPath);
    const restoredHash = sha256(restored.bytes);
    if (restored.bytes.length === source.bytes.length && restoredHash === sourceHash) verifiedObjects += 1;
    else mismatches.push({ byte_match: restored.bytes.length === source.bytes.length, hash_match: restoredHash === sourceHash });
  }
}

const evidence = {
  verdict: mismatches.length === 0 && verifiedObjects === objectCount ? 'PASS' : 'FAIL',
  bucket_count: prodBuckets.length,
  object_count: objectCount,
  verified_objects: verifiedObjects,
  total_bytes: totalBytes,
  mismatch_count: mismatches.length,
  object_names_exposed: false,
  object_content_exposed: false,
};
await writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), 'utf8');
console.log(JSON.stringify(evidence));
if (evidence.verdict !== 'PASS') process.exit(1);
