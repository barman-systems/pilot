import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260903105200_dabbir_whatsapp_ai_outbound_handoff_guard_v1.sql'),'utf8');

test('AI handoff acknowledgement cannot return conversation to AI flow',()=>{
  assert.match(sql,/h\.state in \('QUEUED','ASSIGNED','HUMAN_ACTIVE'\)/);
  assert.match(sql,/when v_res\.sender_type='ai' and v_handoff_active then 'action_required'/);
  assert.match(sql,/else 'waiting_customer'/);
  assert.match(sql,/handoff_active/);
});
