import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../supabase/migrations/20260904123000_dabbir_car_wash_killer_job_p0.sql', import.meta.url);
const output = new URL('../artifacts/dabbir-p0-schema-only-20260904.sql', import.meta.url);
const sql = readFileSync(source, 'utf8');
const statements = [];
let start = 0;
let index = 0;
let mode = 'normal';
let dollarTag = '';

while (index < sql.length) {
  const char = sql[index];
  const next = sql[index + 1];
  if (mode === 'line-comment') {
    if (char === '\n') mode = 'normal';
    index += 1;
    continue;
  }
  if (mode === 'block-comment') {
    if (char === '*' && next === '/') { mode = 'normal'; index += 2; } else index += 1;
    continue;
  }
  if (mode === 'single') {
    if (char === "'" && next === "'") index += 2;
    else if (char === "'") { mode = 'normal'; index += 1; }
    else index += 1;
    continue;
  }
  if (mode === 'double') {
    if (char === '"' && next === '"') index += 2;
    else if (char === '"') { mode = 'normal'; index += 1; }
    else index += 1;
    continue;
  }
  if (mode === 'dollar') {
    if (sql.startsWith(dollarTag, index)) { mode = 'normal'; index += dollarTag.length; } else index += 1;
    continue;
  }
  if (char === '-' && next === '-') { mode = 'line-comment'; index += 2; continue; }
  if (char === '/' && next === '*') { mode = 'block-comment'; index += 2; continue; }
  if (char === "'") { mode = 'single'; index += 1; continue; }
  if (char === '"') { mode = 'double'; index += 1; continue; }
  if (char === '$') {
    const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
    if (match) { dollarTag = match[0]; mode = 'dollar'; index += dollarTag.length; continue; }
  }
  if (char === ';') {
    const statement = sql.slice(start, index + 1).trim();
    if (statement) statements.push(statement);
    start = index + 1;
  }
  index += 1;
}

const tail = sql.slice(start).trim();
if (tail) statements.push(tail);

const ddl = statements.filter(statement => /^(?:create|alter|drop|grant|revoke|comment)\b/i.test(statement.replace(/^(?:--[^\n]*\n|\s)+/g, '')));
const sourceChecksum = createHash('sha256').update(sql).digest('hex');
const body = [
  '-- DABBIR P0 schema-only artifact. No fixtures or production data.',
  `-- Source migration SHA-256: ${sourceChecksum}`,
  '-- Production status: NOT APPLIED. Requires the documented baseline and owner approval.',
  '',
  ...ddl,
  '',
].join('\n\n');

mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(output, body, 'utf8');
const outputChecksum = createHash('sha256').update(body).digest('hex');
process.stdout.write(JSON.stringify({ statements: statements.length, ddl: ddl.length, bytes: body.length, sourceChecksum, outputChecksum }));
