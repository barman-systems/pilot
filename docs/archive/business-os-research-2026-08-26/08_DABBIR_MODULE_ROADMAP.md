# 08 — DABBIR Business OS Module Roadmap

**Snapshot:** 2026-08-26

The roadmap prioritizes cross-cutting foundations before visible feature breadth.

## P0 — Business OS Foundation

### Platform boundary
- separate Business OS runtime/environment
- isolated database/schema/storage/secrets
- production protection guard
- bilingual Arabic RTL / English LTR design system

### Company Core
- tenant / organization / legal entity / company
- branch / department / cost center / team
- currency / timezone / locale / business calendar

### Identity & Governance
- user/employee/member separation
- one-time invite → permanent membership
- RBAC + ABAC policy service
- resource/field/branch/department scopes
- immutable audit
- approval engine
- agent/integration principals

### Platform mechanics
- versioned API
- idempotency
- transactional outbox/events
- durable jobs/retries/dead letters
- notifications
- OpenTelemetry-compatible observability

### Canonical commercial core
- party/customer/contact
- supplier
- product/SKU/service/UOM
- CRM lead/opportunity/activity
- quote
- sales order
- warehouse/location
- stock ledger/reservation
- purchase request/PO/receipt

### Finance foundation
- chart of accounts
- journal/journal lines
- double-entry posting/reversal
- invoice/payment/credit-note canonical states
- fiscal period primitives
- UAE eInvoice-compatible invoice data shape and provider adapter boundary

### AI governance foundation
- READ / RECOMMEND / DRAFT / EXECUTE classes
- policy-gated tool calls
- approval handoff
- execution receipts
- model/provider abstraction
- no AI superuser

### P0 acceptance journey

```text
Create company
→ create branch + roles
→ invite employee once
→ employee accepts and logs in normally
→ create customer
→ create product
→ create quote
→ approve discount if policy requires
→ convert to sales order
→ reserve stock
→ fulfill
→ issue invoice
→ record payment state
→ finance/inventory/audit reflect the full chain
→ owner asks AI what happened and receives source-linked explanation
```

## P1 — Competitive Operating Suite

- AR/AP and aging
- bank transaction import/reconciliation
- supplier RFQ and supplier performance
- reorder/safety stock/replenishment suggestions
- returns/refunds
- tasks/projects/time/expense/profitability
- helpdesk/SLA/knowledge
- unified communication hub
- document metadata/versioning/access
- global permission-aware search
- semantic metric layer and drill-down analytics
- DABBIR Command Center
- workflow visual builder
- integration management UI/webhooks
- safe self-healing for retry/reconciliation/quarantine
- AI executive briefings and grounded cross-module analysis

## P2 — Advanced / Growth Company

- multi-company consolidation support
- advanced budgeting/forecasting
- advanced treasury/cash planning
- lot/batch/serial/expiry traceability
- manufacturing/BOM/MRP/APS pack where demanded
- asset management
- contract lifecycle
- recruitment/performance/compensation
- payroll/WPS integrations
- SSO/SAML/OIDC
- SCIM/Directory Sync
- e-sign integration
- advanced AI domain agents
- industry packs: retail, clinic, salon, real estate, services, maintenance, e-commerce

## P3 — Enterprise Expansion

- advanced consolidation/EPM
- sophisticated GRC/risk controls
- global payroll engines or deeper country packs where justified
- advanced workforce planning
- supply planning/network optimization
- advanced manufacturing/quality/PLM
- marketplace/SDK ecosystem
- multi-region data residency options
- complex intercompany automation
- enterprise master-data governance workflows

## Release gating

A module is not “done” until it has:
1. canonical schema and state machine
2. server-side authorization
3. approval integration if sensitive
4. audit events
5. API contract
6. idempotent external mutation handling
7. observability
8. failure/retry behavior
9. Arabic/English UX
10. automated acceptance tests
11. source-of-truth mapping for analytics
12. no fake/demo operational data in production

## No-bloat rule

Any requested feature that does not measurably save time, reduce cost, increase revenue, reduce risk, improve control, improve customer service or improve employee productivity is deferred.