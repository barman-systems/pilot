import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner customer search uses literal substring matching without fragile LIKE ESCAPE clauses', async () => {
  const sql = await read('supabase/migrations/20260905203000_dabbir_platform_customer_search_v2_escape_repair.sql');
  assert.match(sql, /dabbir_platform_customer_search_v2/);
  assert.match(sql, /platform_assert_permission\(p_actor,'manage_customers'\)/);
  assert.match(sql, /position\(lower\(v_q\) in lower\(coalesce\(u\.email,''\)\)\)>0/);
  assert.match(sql, /position\(lower\(v_q\) in lower\(coalesce\(b\.name,''\)\)\)>0/);
  assert.doesNotMatch(sql, /\blike\b[\s\S]*\bescape\b/i);
  assert.match(sql, /grant execute[\s\S]*service_role/i);
});

test('owner design system makes legacy customer and support surfaces readable on iPhone', async () => {
  const ui = await read('api/_owner-command-center-design-system.js');
  assert.match(ui, /body \.muted,body \.state\{font-size:13px!important/);
  assert.match(ui, /body \.item small\{font-size:12px!important/);
  assert.match(ui, /body \.field,body #customers input/);
  assert.match(ui, /#customers \.row\.mobileStack\{display:grid!important;grid-template-columns:1fr!important/);
  assert.match(ui, /--owner-accent:#5b6ff5/);
  assert.match(ui, /body \.btn\.primary[\s\S]*background:var\(--owner-accent\)!important/);
});
