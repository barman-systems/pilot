# 09 — DABBIR AI Architecture

**Snapshot:** 2026-08-26

## Position

DABBIR AI is an **operating layer over governed business capabilities**, not a chatbot bolted onto an ERP.

The same business command must be used whether triggered by a button, API integration or AI. AI never writes tables directly.

## Action classes

### READ
Retrieve authorized data and explain it.

Examples:
- Which invoices are overdue?
- What stock is available in Abu Dhabi?

### RECOMMEND
Analyze data and propose a next action without creating business state.

Examples:
- Recommend replenishment quantities.
- Rank late accounts by collection priority.

### DRAFT
Create a reversible draft that a human may review/edit.

Examples:
- draft quote
- draft purchase request
- draft customer reply

### EXECUTE
Commit a real business action through the normal application command path.

Examples:
- assign task
- approve a permitted routine item
- issue an approved purchase order

`EXECUTE` is never implied by conversational fluency. It requires explicit tool permission and, where policy says so, approval.

## Agent principal model

Each operational agent has:
- `agent_principal_id`
- domain
- allowed tools
- tenant/company scopes
- data classifications
- execution mode
- model/provider policy
- cost budget
- risk tier
- kill switch
- owner
- version

### Delegate mode
The agent acts for an initiating user. Effective access is the intersection of user access, agent tool scope and resource policy.

### Service mode
The agent has its own narrow permissions for scheduled/background work. It does not inherit owner/admin power.

This follows the market direction seen in Workday agent identity, ServiceNow AI governance, n8n workflow-level guardrails and Microsoft/Oracle human-in-the-loop execution.

## AI request pipeline

```text
Intent
→ classify domain/risk
→ retrieve authorized context
→ create plan
→ select typed tool
→ validate tool arguments
→ policy evaluation
→ approval checkpoint if required
→ execute normal command
→ verify outcome
→ produce execution receipt
→ audit + telemetry
```

## Tool design

Tools must be narrow and typed. Prefer:
- `get_customer_balance(customer_id)`
- `draft_purchase_request(items, warehouse_id)`
- `submit_purchase_request(request_id)`

Avoid:
- `run_sql`
- `admin_action`
- unrestricted HTTP
- generic mutation tools

Every tool defines:
- purpose
- input schema
- output schema
- permission required
- risk class
- whether approval may be required
- idempotency behavior
- data classification
- timeout/retry policy

## Agent separation rule

Do not create one agent per menu page.

Create a separate agent only when **domain, permissions, tools, context or risk** are materially different.

Candidate later-stage agents:
- Executive Agent
- Finance Agent
- Sales Agent
- Inventory/Procurement Agent
- Customer Service Agent
- People/HR Agent

P0 can use one orchestrator with domain-specific tool bundles and policies; specialization comes when there is operational evidence for it.

## DABBIR Executive AI

Question: `ماذا يحدث في شركتي؟`

Response contract:
- What happened
- Why it matters
- Evidence/source records
- Business impact
- Risk/confidence
- Recommended action
- Responsible person/team
- Suggested deadline
- Action buttons only for permitted actions

Inputs may include sales, cash, inventory, supplier, customer, project, people and system-health signals, always filtered by the viewer's access.

## Grounding

Priority order:
1. canonical transactional data
2. approved business definitions/metric layer
3. authorized documents/knowledge
4. approved connected sources
5. web/external research only when task explicitly permits it

Business answers should cite internal record IDs/links where useful. Search retrieval must enforce tenant and ACL filters before prompt construction.

## Memory

Separate:
- short conversation context
- user preferences
- business knowledge
- agent execution state

Never let conversational memory become authoritative financial/stock/customer state. Authoritative state is always the canonical store.

## High-risk actions

Always policy/approval gated by default:
- money movement/payment approval
- journal posting/period close
- refunds above configured threshold
- supplier banking changes
- payroll/compensation changes
- employee termination/access elevation
- bulk deletion/export
- legal/compliance submissions
- credential/security changes

## AI execution receipt

For each consequential AI run store:

```text
intent
agent/version/model
initiator
retrieved source references
plan summary
proposed tools
policy decisions
approval IDs
executed tools
before/after entity versions
result
failure/retry state
latency
cost/tokens
correlation ID
```

Do not store private model chain-of-thought. Store concise decision/execution evidence required for audit and debugging.

## Prompt injection and untrusted data

Treat customer messages, emails, uploaded documents and web text as untrusted data.

Controls:
- distinguish system policy from retrieved content
- tool allowlists
- typed inputs
- no secret exposure to model unless strictly needed
- output validation
- external URL restrictions
- confirmation/approval gates
- sandbox file processing
- rate and budget limits

Reference security baselines: OWASP Agentic AI Threats and Mitigations and NIST AI RMF Generative AI Profile.

## Model/provider strategy

Provider abstraction is required. Route by task:
- cheap deterministic classification → small model
- complex cross-module reasoning → capable model
- sensitive local processing → approved provider/deployment policy

Track quality, latency and cost by feature. A model upgrade must not change permissions or business invariants.

## Success metric

DABBIR AI is successful when it reduces navigation and manual coordination **without reducing control**. The target is intent → trusted evidence → governed action → verified result.