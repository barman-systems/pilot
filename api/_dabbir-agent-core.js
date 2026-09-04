import { ToolLoopAgent, jsonSchema, stepCountIs, tool } from 'ai';

const DEFAULT_AGENT_MODEL = 'openai/gpt-5.6-luna';
const MAX_COMMAND_CHARS = 2000;

const noInput = jsonSchema({ type: 'object', properties: {}, additionalProperties: false });
const appointmentInput = jsonSchema({
  type: 'object',
  properties: {
    business_id: { type: 'string', description: 'Business UUID from the verified workspace.' },
    customer_id: { type: ['string', 'null'], description: 'Existing customer UUID, or null to create one.' },
    customer_name: { type: ['string', 'null'], description: 'Customer name when customer_id is null.' },
    service_id: { type: ['string', 'null'], description: 'Verified service UUID when known.' },
    starts_at: { type: 'string', description: 'ISO 8601 appointment date and time.' },
  },
  required: ['business_id', 'customer_id', 'customer_name', 'service_id', 'starts_at'],
  additionalProperties: false,
});
const followupInput = jsonSchema({
  type: 'object',
  properties: {
    business_id: { type: 'string', description: 'Business UUID from the verified workspace.' },
    conversation_id: { type: 'string', description: 'Conversation UUID from the verified workspace.' },
    reason: { type: 'string', description: 'Short reason for the follow-up.' },
    due_at: { type: ['string', 'null'], description: 'ISO 8601 due date and time, or null.' },
    recommended_message: { type: ['string', 'null'], description: 'Suggested follow-up message, or null.' },
  },
  required: ['business_id', 'conversation_id', 'reason', 'due_at', 'recommended_message'],
  additionalProperties: false,
});

function compactWorkspace(workspace) {
  return {
    business: workspace?.business || null,
    selected_conversation_id: workspace?.selected_conversation_id || null,
    customers: Array.isArray(workspace?.customers) ? workspace.customers.slice(0, 20) : [],
    appointments: Array.isArray(workspace?.appointments) ? workspace.appointments.slice(0, 20) : [],
    followups: Array.isArray(workspace?.followups) ? workspace.followups.slice(0, 20) : [],
    conversations: Array.isArray(workspace?.conversations) ? workspace.conversations.slice(0, 20) : [],
  };
}

function approvalRequired(action, input) {
  return {
    ok: false,
    state: 'OWNER_APPROVAL_REQUIRED',
    action,
    proposed_input: input,
    message: 'Return the proposed action to the owner. Do not claim it was executed.',
  };
}

export function getDabbirAgentConfig(env = process.env) {
  return {
    runtime: 'vercel-ai-sdk-tool-loop-agent',
    model: String(env.DABBIR_AGENT_MODEL || DEFAULT_AGENT_MODEL),
    max_steps: 6,
    writes_require_owner_approval: true,
  };
}

export async function runDabbirAgent({ command, writeApproved = false, loadWorkspace, createAppointment, createFollowup, env = process.env } = {}) {
  const prompt = String(command || '').trim().slice(0, MAX_COMMAND_CHARS);
  if (!prompt) throw Object.assign(new Error('AGENT_COMMAND_REQUIRED'), { status: 400 });
  if (![loadWorkspace, createAppointment, createFollowup].every(value => typeof value === 'function')) {
    throw Object.assign(new Error('AGENT_TOOLS_UNAVAILABLE'), { status: 503 });
  }

  const config = getDabbirAgentConfig(env);
  const agent = new ToolLoopAgent({
    model: config.model,
    instructions: [
      'You are DABBIR Executive Agent for a UAE business owner.',
      'You are an execution agent, not a chatbot. Use tools to inspect verified state and complete the owner goal.',
      'Inspect the workspace before proposing or executing a write.',
      'Never invent identifiers, customers, services, dates, availability, prices, or execution results.',
      'Write tools enforce owner approval. If a tool returns OWNER_APPROVAL_REQUIRED, clearly summarize the exact proposed action and ask for approval once.',
      'A successful write is true only when its tool returns VERIFIED_PERSISTED evidence.',
      'Use the same language as the owner and keep the final answer concise.',
    ].join('\n'),
    tools: {
      inspect_workspace: tool({
        description: 'Read the authenticated owner workspace and return verified business state before planning an action.',
        inputSchema: noInput,
        execute: async () => compactWorkspace(await loadWorkspace()),
      }),
      create_appointment: tool({
        description: 'Create an appointment in DABBIR. This is a database write and requires explicit owner approval.',
        inputSchema: appointmentInput,
        execute: async input => writeApproved ? createAppointment(input) : approvalRequired('create_appointment', input),
      }),
      create_followup: tool({
        description: 'Create a follow-up in DABBIR. This is a database write and requires explicit owner approval.',
        inputSchema: followupInput,
        execute: async input => writeApproved ? createFollowup(input) : approvalRequired('create_followup', input),
      }),
    },
    stopWhen: stepCountIs(config.max_steps),
    maxOutputTokens: 700,
    temperature: 0.1,
    providerOptions: {
      gateway: { disallowPromptTraining: true },
    },
  });

  const result = await agent.generate({
    prompt,
    abortSignal: AbortSignal.timeout(30000),
  });

  return {
    ok: true,
    action: 'agent_command',
    state: 'AGENT_RUN_COMPLETED',
    reply: String(result.text || '').trim(),
    agent: config,
    steps: result.steps.length,
    finish_reason: result.finishReason,
    write_approved: writeApproved,
    truth: {
      state: 'VERIFIED_AGENT_RUNTIME',
      source: 'AI_SDK_TOOL_LOOP_AND_DABBIR_TOOL_RESULTS',
      verified_at: new Date().toISOString(),
    },
  };
}
