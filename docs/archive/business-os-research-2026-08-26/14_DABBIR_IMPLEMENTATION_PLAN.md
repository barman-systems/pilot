# 14 — DABBIR Business OS Implementation Plan

**Plan baseline:** 2026-08-26  
**Execution rule:** Research and architecture precede P0 implementation. Existing DABBIR production is out of scope.

## Phase R0 — Research baseline — COMPLETE v1

Deliverables:
- global system research
- enterprise capability map
- competitor matrix
- gap analysis
- target architecture
- canonical data model
- permission model
- module roadmap
- AI architecture
- UAE readiness
- security model
- build-vs-buy
- differentiation thesis
- implementation plan

Exit criteria:
- architecture direction is explicit
- P0 dependencies identified
- legal/compliance unknowns labeled rather than guessed
- no production code/database mutated

## Phase 0A — Isolated Platform Boundary

Build:
- dedicated Business OS runtime/deployment target
- dedicated database project/schema/storage namespace
- separate secrets and auth configuration
- environment guard that refuses current DABBIR production resources
- migration runner scoped to Business OS only
- health endpoint and observability tags

Acceptance:
- Business OS can deploy without touching current DABBIR
- test migration changes only isolated database
- production DABBIR baseline remains byte/data unaffected by Business OS release

## Phase 0B — Company + Identity + Authority Core

Build:
- tenant, organization, company/legal entity
- branch, department, cost center, team
- user, employee, membership
- one-time employee invites
- role templates/custom roles
- ABAC scope bindings
- field/resource policies
- agent/integration principals

Acceptance:
- owner creates company and branches
- owner invites employee once
- employee accepts once and uses normal login afterward
- employee sees only assigned company/branch/resource scope
- tenant-crossing requests fail server-side

## Phase 0C — Audit + Approval + Event Backbone

Build:
- append-only audit event service
- approval policy/version/instance engine
- single/sequential/parallel/threshold/conditional approval
- delegation/escalation/expiry
- transactional outbox
- worker retry/dead-letter
- event schema/versioning

Acceptance:
- every canonical write has audit correlation
- sensitive action can stop at approval then resume exactly once
- retry cannot duplicate completed business mutation
- event consumer replay is idempotent

## Phase 0D — Master Data + CRM

Build:
- party/person/organization
- customer/supplier account
- contacts/addresses
- product/SKU/service/UOM
- lead/opportunity/activity
- customer timeline read model

Acceptance:
- lead conversion links canonical party/customer; no duplicates
- same customer ID is used by CRM and future sales/finance
- search respects tenant/permission scope

## Phase 0E — Sales + Inventory Transaction Core

Build:
- quote/line
- discount policy/approval
- sales order/line
- stock ledger
- reservation
- warehouse/location
- fulfillment/delivery
- return primitives

Acceptance:
- accepted quote can create order
- confirmation reserves stock atomically
- overselling race is prevented according to policy
- fulfillment writes stock movement and audit
- stock balance can be reconstructed from ledger

## Phase 0F — Procurement

Build:
- purchase request
- purchase approval
- RFQ/supplier quote
- PO
- goods receipt
- supplier performance base

Acceptance:
- receipt creates inventory movement
- PO amount/branch can drive approval policy
- supplier invoice linkage is ready for finance phase

## Phase 0G — Finance Core

Build behind strict verification:
- chart of accounts
- journals/lines
- balanced double-entry posting
- fiscal periods
- invoice/credit note
- payment/payment allocation state
- AR/AP base
- posting integration from sales/procurement

Acceptance:
- every posted entry balances
- posted journal cannot be edited/deleted
- reversal creates compensating entry
- sales invoice posts according to configured mapping
- supplier invoice posts according to configured mapping
- accounting reports trace to journal lines

No “accounting compliant” marketing claim is allowed at this phase.

## Phase 0H — UAE Invoice Readiness Boundary

Build:
- structured invoice canonical fields
- versioned validation profile
- ASP adapter contract
- provider delivery/status/evidence store

Do not select/activate a provider until current commercial, technical and legal verification.

Acceptance:
- DABBIR can generate a structured invoice object independent of a PDF
- provider mapping is adapter-only
- retry/reconcile does not duplicate official submission

## Phase 0I — AI Operating Layer v1

Build:
- permission-filtered context retrieval
- typed tool registry
- READ/RECOMMEND/DRAFT/EXECUTE classes
- risk classifier
- policy and approval interception
- execution receipt
- model/provider abstraction
- cost/latency telemetry

Acceptance:
- AI can answer sourced business questions
- AI cannot read cross-scope data
- AI cannot execute a denied action
- high-risk action enters approval
- approved action executes same server command as UI
- action receipt proves outcome

## Phase 0J — Command Center + Zero-Training UX

Build:
- exception event/read model
- severity/impact/urgency/deadline scoring
- role-based owner/manager/employee home
- global command/search entry
- progressive onboarding checklist
- Arabic/English full parity

Acceptance:
- new owner reaches first customer/product/order without training document
- manager can resolve a top exception from command center
- no KPI is displayed without a traceable source definition

## Phase 1 — Competitive suite

After P0 E2E passes:
- bank reconciliation
- advanced AR/AP
- replenishment
- projects/time/expense/profitability
- helpdesk/SLA
- document/version system
- unified communications
- semantic search
- workflow visual builder
- integration management
- safe self-healing

## Phase 2 — Advanced growth

- SSO/SCIM
- payroll/WPS integration
- lot/serial/expiry
- manufacturing pack where demanded
- asset/contract management
- budgeting/forecasting
- industry packs
- specialized AI agents

## Mandatory acceptance suite

### Customer journey
`signup/login → company → employees → customer → quote → order → inventory → invoice → payment → audit → AI explanation`

### Procurement journey
`request → approval → RFQ → supplier selection → PO → receipt → supplier invoice → payment state`

### Security
- cross-tenant negative tests
- cross-branch policy tests
- privilege escalation tests
- invite replay/expiry/revoke tests
- CSRF/session/recovery tests
- prompt-injection/tool-abuse tests

### Integrity
- double-entry balance property tests
- inventory reconstruction tests
- concurrent reservation tests
- idempotency/replay tests
- approval one-time-consumption tests

### Reliability
- worker retry/dead letter
- provider outage/recovery
- webhook replay/signature
- backup/restore
- observability correlation

## Implementation quality gate per capability

Before code:
- problem/user/value
- benchmark
- P0/P1/P2/P3
- BUILD/INTEGRATE/DEFER
- canonical entities/state machine
- permissions/approvals
- events/API
- security/legal impact
- observability/failure behavior
- acceptance test

After code:
- persisted behavior verified
- negative tests pass
- audit present
- no production leakage
- bilingual UX
- evidence linked to issue/commit/deployment

## Final P0 exit verdict

P0 is complete only when a real isolated Business OS environment passes the full lead/customer/quote/order/stock/invoice/payment/audit journey with role-scoped employee access and policy-bound AI. A dashboard or static preview is not an acceptance substitute.