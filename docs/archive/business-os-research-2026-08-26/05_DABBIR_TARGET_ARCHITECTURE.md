# 05 — DABBIR Business OS Target Architecture

**Architecture decision baseline:** 2026-08-26

## 1. Architecture style

Start as a **modular monolith with explicit domain boundaries**, not microservices.

Why:
- DABBIR needs cross-module transactional integrity before independent service scaling.
- Sales, inventory, finance and approvals frequently need one reliable transaction boundary.
- A modular monolith is simpler to operate for an early product while still allowing extraction later.
- Domain events and API contracts should be designed now so high-load modules can be separated without rewriting the business model.

## 2. Logical layers

```text
Web / Mobile / API Clients
        ↓
API Gateway / Session / Rate Limits / Idempotency
        ↓
Authorization Policy + Approval Check
        ↓
Application Commands / Queries
        ↓
Domain Modules
        ↓
PostgreSQL Canonical Store
        ↓
Transactional Outbox → Workers / Webhooks / Search / Analytics
```

AI does **not** bypass this stack:

```text
User Intent
  → AI Planner
  → Tool Proposal
  → Policy Evaluation
  → Approval if needed
  → Same Application Command used by human/API
  → Transaction
  → Audit + AI Execution Receipt
```

## 3. Domain modules

### Foundation
- tenancy
- organization/company hierarchy
- identity/membership
- authorization/policy
- audit
- approvals
- workflows
- events/outbox
- integrations
- notifications

### Commercial
- parties/customer/contact
- CRM/lead/opportunity
- product/catalog/pricing
- sales/quotes/orders
- fulfillment/returns
- service/tickets

### Supply
- suppliers
- procurement
- inventory/warehouses/locations
- receiving
- replenishment
- optional manufacturing/traceability pack

### Finance
- chart of accounts
- journal/posting
- AR/AP
- invoice/credit note/payment allocation
- tax framework
- bank reconciliation
- financial reporting
- eInvoice adapter

### People & Work
- employee/org
- tasks/projects
- leave/attendance
- documents
- payroll integration adapter

### Intelligence
- metric definitions
- analytics read models
- enterprise search
- command center
- AI context/tools/policies
- agent registry/control

## 4. Database principles

Use PostgreSQL with:
- UUID/ULID-style stable IDs.
- explicit `tenant_id` on every tenant-scoped business row.
- foreign keys and unique constraints.
- money stored as decimal/numeric with explicit currency.
- timestamps stored in UTC; business timezone stored separately.
- state-machine enums/reference tables for critical lifecycle state.
- soft deletion only for mutable master records where legally/business appropriate.
- no deletion/update of posted finance or stock ledger entries; use reversal/compensating records.
- row-level isolation as defense in depth, not the only authorization layer.

## 5. Event architecture

Use a **transactional outbox** in the same DB transaction as the business write.

Event envelope:

```json
{
  "event_id": "...",
  "event_type": "sales_order.confirmed.v1",
  "tenant_id": "...",
  "entity_type": "sales_order",
  "entity_id": "...",
  "actor_type": "user|agent|integration|system",
  "actor_id": "...",
  "occurred_at": "...",
  "correlation_id": "...",
  "causation_id": "...",
  "schema_version": 1,
  "payload": {}
}
```

Consumers must be idempotent. Failed deliveries move to retry/dead-letter state with observable reason.

## 6. API-first contract

- `/api/v1/...` versioning.
- authorization enforced server-side on every operation.
- idempotency keys required for create/payment/posting/external action APIs.
- optimistic version or `updated_at` checks for collision-sensitive edits.
- cursor pagination.
- structured errors with stable error codes.
- signed outbound webhooks with replay protection.
- OAuth/client credentials only for approved integration principals.
- OpenAPI schema generated/tested as a release artifact.

## 7. Search architecture

V1:
- PostgreSQL full-text/trigram for deterministic search.
- vector embeddings only for approved semantic fields/documents.
- search index rows carry tenant + ACL/scope metadata.
- authorization is evaluated before result disclosure.

Later, external search infrastructure may replace the index, but the **permission contract remains DABBIR-owned**.

## 8. Workflow runtime

A workflow definition is metadata, not executable arbitrary code by default.

Nodes:
- trigger
- condition
- deterministic action
- AI judgment step
- approval
- wait/timer
- branch
- webhook/integration
- notification
- compensation

Execution requires durable state, retry count, idempotency key, correlation ID, actor and audit linkage.

## 9. Observability

Adopt OpenTelemetry-compatible instrumentation for:
- traces
- metrics
- logs

Business-specific telemetry:
- command latency/error rate
- outbox backlog
- job retry/dead-letter count
- webhook failure rate
- integration health
- approval aging
- AI tool failure/approval/rejection rates
- token/model cost by tenant and feature

Owner UI exposes only `Operational`, `Degraded`, `Action required`; engineering retains detail.

## 10. Deployment boundaries

Business OS must have its own:
- environment variables
- database/schema boundary
- auth redirect configuration
- queues/jobs
- storage namespace
- encryption/secrets scope
- observability service/environment tags
- preview and production deployment targets

No Business OS migration may run against the current DABBIR production database.

## 11. Extraction criteria for future microservices

Only extract a module when there is evidence of one or more:
- independent scale profile
- independent security boundary
- high deployment frequency conflict
- specialized persistence/runtime need
- operational blast-radius benefit

Likely future candidates: communications delivery, document processing, search indexing, AI execution workers, analytics pipelines. Finance and inventory transaction cores should remain strongly consistent unless a proven architecture preserves their invariants.