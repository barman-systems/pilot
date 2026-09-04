import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const agent = fs.readFileSync(new URL('../api/_dabbir-agent-core.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../api/dabbir-runtime.js', import.meta.url), 'utf8');

test('DABBIR exposes a bounded ToolLoopAgent instead of a reply-only chatbot', () => {
  assert.match(agent, /new ToolLoopAgent\(/);
  assert.match(agent, /stopWhen: stepCountIs\(config\.max_steps\)/);
  assert.match(agent, /max_steps: 6/);
  assert.match(agent, /inspect_workspace/);
  assert.match(agent, /create_appointment/);
  assert.match(agent, /create_followup/);
  assert.match(agent, /VERIFIED_AGENT_RUNTIME/);
});

test('agent writes remain fail-closed without explicit owner approval', () => {
  assert.match(agent, /writeApproved \? createAppointment\(input\) : approvalRequired/);
  assert.match(agent, /writeApproved \? createFollowup\(input\) : approvalRequired/);
  assert.match(agent, /OWNER_APPROVAL_REQUIRED/);
  assert.match(runtime, /body\.approve_writes === true/);
});

test('authenticated runtime owns the agent command entry point', () => {
  assert.match(runtime, /action === 'agent_command'/);
  assert.match(runtime, /runDabbirAgent\(/);
  assert.match(runtime, /requireMembership\(identity, requestedBusinessId\)/);
});
