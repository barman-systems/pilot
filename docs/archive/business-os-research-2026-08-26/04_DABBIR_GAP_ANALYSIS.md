# 04 — DABBIR Business OS Gap Analysis

**Snapshot:** 2026-08-26  
**Evidence base:** isolated branch `dabbir-business-os-v1`; current manifest status is `foundation`. A module name in the manifest is not evidence of an implemented capability.

## Current verified baseline

`business-os/modules.json` declares the intended domains: company-core, CRM, sales, inventory, procurement, operations, finance-lite, hr-lite, communications, automation-engine, dabbir-ai and governance. It also fixes hard rules: separate from current DABBIR, no production mutation, multi-tenant, RLS required, audit every business write and AI permission enforcement.

The current Business OS preview is a **foundation preview**, not proof that ERP transactions, ledgers, permissions or integrations are complete.

## Gap matrix

| Capability | Current | Gap class | Priority | Required outcome |
|---|---|---|---:|---|
| Product isolation | separate branch + preview | DABBIR_CURRENT | P0 | separate runtime/database/config target before real data |
| Tenant/company hierarchy | design intent only | DABBIR_REQUIRED | P0 | tenant→org→company/legal entity→branch→department/cost center |
| Employee membership | reusable concepts exist in current DABBIR, not Business OS isolated runtime | DABBIR_REQUIRED | P0 | one-time invite→permanent membership in isolated store |
| Permission model | high-level rule only | DABBIR_MISSING | P0 | RBAC + ABAC scopes + field/resource restrictions |
| Audit ledger | hard rule only | DABBIR_MISSING | P0 | append-only audit events for every business write |
| Approval engine | issue/roadmap intent | DABBIR_MISSING | P0 | central reusable approval definitions + instances |
| Canonical master data | not implemented | DABBIR_MISSING | P0 | party/customer/supplier/product/employee identities |
| CRM | module declared | DABBIR_MISSING | P0 | lead/opportunity/activity/customer timeline |
| Sales lifecycle | module declared | DABBIR_MISSING | P0 | quote→approval→order→fulfillment→invoice→payment state |
| Inventory ledger | module declared | DABBIR_MISSING | P0 | immutable stock movements + reservations |
| Procurement lifecycle | module declared | DABBIR_MISSING | P0 | request/RFQ/PO/receipt/invoice/payment linkage |
| Finance double-entry | only `finance-lite` label | DABBIR_WEAK | P0 | real journal/posting model before financial claims |
| AR/AP | absent | DABBIR_MISSING | P1 | receivable/payable subledger and aging |
| Bank reconciliation | absent | DABBIR_MISSING | P1 | provider-neutral imported transaction matching |
| UAE eInvoice | absent | DABBIR_REQUIRED | P0 architecture | structured invoice + Accredited Service Provider adapter |
| Tax framework | absent | DABBIR_REQUIRED | P1 | versioned jurisdiction rules and evidence |
| Projects/PSA | absent from initial manifest | DABBIR_REQUIRED | P1 | project/customer/budget/team/time/expense/invoice/profitability |
| HR core | `hr-lite` only | DABBIR_WEAK | P1 | employee lifecycle/org/leave/attendance/docs |
| Payroll/WPS | absent | DABBIR_ADVANCED | P2 | integration-first, UAE legal verification required |
| Service/helpdesk | absent | DABBIR_REQUIRED | P1 | ticket/SLA/queue/knowledge/customer timeline |
| Omnichannel | communications module only | DABBIR_WEAK | P1 | channel adapters + unified conversation identity |
| DMS | absent | DABBIR_REQUIRED | P1 | versioned docs, entity links, retention/access metadata |
| Global search | absent | DABBIR_REQUIRED | P1 | permission-aware lexical + semantic retrieval |
| Analytics semantic layer | preview metrics are not business analytics | DABBIR_MISSING | P1 | defined metrics with source-of-truth and drill-down |
| Command Center | concept only | DABBIR_DIFFERENTIATOR | P0/P1 | exception queue ranked by business impact |
| Workflow engine | module declared | DABBIR_MISSING | P0 | durable WHEN/IF/THEN with retries/idempotency/approvals |
| Event bus/outbox | absent | DABBIR_MISSING | P0 | transactional outbox + versioned domain events |
| API platform | absent as Business OS contract | DABBIR_REQUIRED | P0 | versioned API, idempotency, webhooks, rate controls |
| AI read/explain | module declared | DABBIR_WEAK | P1 | permission-filtered context retrieval |
| AI actions | policy rule only | DABBIR_REQUIRED | P0 architecture | READ/RECOMMEND/DRAFT/EXECUTE gates |
| AI agent identity | absent | DABBIR_DIFFERENTIATOR | P0 architecture | explicit agent principal, scope, execution mode and trace |
| Observability | absent in isolated runtime | DABBIR_MISSING | P0 | traces, metrics, logs, jobs, integration health |
| Self-healing | absent | DABBIR_ADVANCED | P1/P2 | bounded retries/reconciliation/quarantine; no sensitive bypass |
| SSO/SCIM | absent | DABBIR_ADVANCED | P2 | enterprise identity integration after SMB auth core |
| Industry packs | absent | DABBIR_ADVANCED | P2 | metadata/config packs, never code forks |

## Immediate P0 gaps that block feature building

1. Separate data/runtime boundary.
2. Canonical identity/company hierarchy.
3. Permission/policy engine.
4. Immutable audit.
5. Central approval engine.
6. Transactional event/outbox layer.
7. Canonical customer/product/supplier/employee masters.
8. Finance and inventory ledger invariants.
9. API/idempotency contract.
10. AI action governance.

## Gate

No module can be marked complete because a page exists. Completion requires persisted canonical data, permissions, audit event, state transition rules, API contract, failure handling and an end-to-end acceptance test.