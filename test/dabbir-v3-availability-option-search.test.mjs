import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateMigrationFile} from '../scripts/dabbir-migration-contract.mjs';
const root=path.resolve(import.meta.dirname,'..');
const relative='supabase/migrations/20260915130000_dabbir_availability_option_search_v1.sql';
const sql=fs.readFileSync(path.join(root,relative),'utf8');

test('broad availability migration satisfies canonical deploy contract',()=>{const x=validateMigrationFile(path.join(root,relative),{cutoverVersion:'20260915124900'});assert.ok(x.bytes>0);assert.ok(x.statementCount>0);});
test('broad search is read-only service-role authority and reuses existing availability truth',()=>{assert.match(sql,/create or replace function public\.dabbir_whatsapp_ai_find_available_options_v1/);assert.match(sql,/public\.dabbir_whatsapp_ai_check_availability\(/);assert.match(sql,/coalesce\(auth\.role\(\),''\)<>'service_role'/);assert.match(sql,/grant execute on function public\.dabbir_whatsapp_ai_find_available_options_v1[\s\S]+to service_role/);assert.doesNotMatch(sql,/insert\s+into\s+public\.dabbir_appointments|update\s+public\.dabbir_appointments|delete\s+from\s+public\.dabbir_appointments/i);});
test('four exact-authority seeds cover the day without semantic daypart constants',()=>{for(const seed of ['00:00','06:30','13:00','19:30'])assert.ok(sql.includes(`'${seed}'::time`));assert.doesNotMatch(sql,/EARLY_MORNING|MORNING|AFTERNOON|EVENING|NIGHT/);});
test('customer hard time bounds and truthful result volume are enforced by code',()=>{assert.match(sql,/p_from is not null and v_time<p_from/);assert.match(sql,/p_to is not null and v_time>p_to/);assert.match(sql,/least\(12,greatest\(1,coalesce\(p_max_candidates,12\)\)\)/);assert.match(sql,/left\(v_local,10\)<>p_requested_date::text/);});
