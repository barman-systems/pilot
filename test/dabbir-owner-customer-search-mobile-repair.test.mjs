import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner customer search uses literal substring matching without fragile LIKE ESCAPE clauses', async () => {
  const sql = await read('supabase/migrations/20260905203000_dabbir_platform_customer_search_v2_escape_repair.sql');
  const executable = sql.replace(/^\s*--.*$/gm, '');
  assert.match(sql, /dabbir_platform_customer_search_v2/);
  assert.match(sql, /platform_assert_permission\(p_actor,'manage_customers'\)/);
  assert.match(sql, /position\(lower\(v_q\) in lower\(coalesce\(u\.email,''\)\)\)>0/);
  assert.match(sql, /position\(lower\(v_q\) in lower\(coalesce\(b\.name,''\)\)\)>0/);
  assert.doesNotMatch(executable, /\blike\b[\s\S]*\bescape\b/i);
  assert.match(sql, /grant execute[\s\S]*service_role/i);
});

test('owner design keeps readable mobile controls without legacy override selectors',async()=>{
  const css=await read('api/_owner-command-center-design-system.js');
  assert.match(css,/font-size:16px|font:16px/);assert.match(css,/min-height:46px/);
  assert.match(css,/@media\(max-width:560px\)/);assert.doesNotMatch(css,/oc23|ownerMainTab29/);
});
