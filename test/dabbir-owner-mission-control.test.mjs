import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../api/owner-command-center.js',import.meta.url),'utf8'),api=fs.readFileSync(new URL('../api/owner-ceo-command.js',import.meta.url),'utf8');
test('CEO mission creation retains objective, acceptance, priority and due date',()=>{
 for(const field of ['command_text','objective','acceptance_criteria','priority','due_at'])assert.match(ui,new RegExp(field));
 assert.match(ui,/maxlength="4000"/);assert.match(api,/commandText\.length<4\|\|commandText\.length>4000/);
});
test('CEO completion is sourced from backend evidence and never asserted by browser',()=>{
 assert.match(ui,/ev\.verified/);assert.match(ui,/c\.blocked_reason/);assert.match(ui,/c\.result_summary/);
 assert.doesNotMatch(api,/operation==='complete'|operation==='done'/);assert.match(api,/readback_verified:verified/);
});
test('priority and due date use independent writes; lifecycle operations preserve explicit confirmation',()=>{
 assert.match(ui,/data-command-priority/);assert.match(ui,/data-command-due/);assert.match(ui,/operation==='set_due_at'/);
 assert.match(ui,/values\.confirmation!=='CONFIRM'/);assert.match(api,/GUIDANCE_REQUIRED/);
});
test('decision inbox renders the real question and restricts resolution to root owner',()=>{
 assert.match(ui,/d\.question/);assert.match(ui,/d\.action_description/);assert.match(ui,/d\.resolution&&root/);
 assert.match(ui,/escalation_id:d\.decisionId/);assert.match(ui,/resolution:d\.resolution/);
});
test('legacy edge endpoint delegates authorization to the current fail-closed CEO RPC boundary',()=>{
 const edge=fs.readFileSync(new URL('../supabase/functions/dabbir-owner-ceo-command/index.ts',import.meta.url),'utf8');
 assert.match(edge,/dabbir_owner_session_verify_v1/);
 assert.match(edge,/platform_owner/);
 assert.match(edge,/dabbir_ceo_command_create_authorized_v1/);
 assert.match(edge,/dabbir_ceo_commands_authorized_v1/);
 assert.match(edge,/p_actor:session\.actor_user_id/);
 assert.match(edge,/OWNER_SESSION_REQUIRED/);
 assert.doesNotMatch(edge,/dabbir_ceo_command_create_v1/);
 assert.doesNotMatch(edge,/dabbir_ceo_commands_recent_v1/);
});
