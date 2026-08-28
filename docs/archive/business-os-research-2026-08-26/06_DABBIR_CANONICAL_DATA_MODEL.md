# 06 — DABBIR Canonical Enterprise Data Model

**Snapshot:** 2026-08-26

## Core rule

There is one canonical identity for a business concept. Modules reference it; they do not clone it.

Example: one `party/customer` identity is referenced by CRM, sales, finance, support, projects, communications and AI context.

## A. Organization graph

```text
Tenant
 └─ Organization
     ├─ LegalEntity / Company
     │   ├─ Branch
     │   ├─ Department
     │   ├─ CostCenter
     │   └─ Warehouse
     └─ Team
```

### Entities
- `tenant`
- `organization`
- `legal_entity`
- `branch`
- `department`
- `cost_center`
- `team`
- `business_calendar`
- `fiscal_period`
- `currency`
- `exchange_rate`

## B. Identity and people

- `user` — authentication identity.
- `employee` — employment/business-person record; may link to one user.
- `membership` — user/employee access to tenant/company scope.
- `role`
- `permission`
- `role_permission`
- `policy_rule`
- `scope_binding`
- `employee_invitation`
- `delegation`
- `approval_authority`
- `agent_principal`
- `integration_principal`

**Invariant:** invitation token is one-time and never becomes the permanent credential. Acceptance creates/activates membership; later login uses normal authentication.

## C. Party master

Use a shared `party` concept to reduce duplicate identities.

- `party` — person or organization.
- `party_person`
- `party_organization`
- `party_contact_point` — email/phone/address/channel handle.
- `customer_account`
- `supplier_account`
- `contact_relationship`
- `party_tag`

A party may be both customer and supplier without duplication.

## D. CRM

- `lead`
- `lead_source`
- `opportunity`
- `opportunity_stage`
- `activity`
- `note`
- `sales_pipeline`
- `sales_forecast_snapshot`

**Conversion:** lead conversion creates/links canonical party/customer and opportunity; it does not copy contact data into a second customer universe.

## E. Product/catalog

- `product`
- `sku`
- `service_item`
- `unit_of_measure`
- `price_list`
- `price_list_item`
- `tax_class`
- `product_category`
- `barcode`

## F. Sales and fulfillment

- `quote`
- `quote_line`
- `sales_order`
- `sales_order_line`
- `sales_order_reservation`
- `delivery`
- `delivery_line`
- `return_authorization`
- `return_receipt`

State examples:

```text
Quote: DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED
Order: DRAFT → PENDING_APPROVAL → CONFIRMED → FULFILLING → FULFILLED → CLOSED
      ↘ CANCELLED
```

Transitions must be explicit and audited.

## G. Inventory

- `warehouse`
- `storage_location`
- `stock_ledger_entry`
- `stock_reservation`
- `stock_transfer`
- `stock_adjustment_request`
- `inventory_count`
- `lot_batch`
- `serial_number`
- `expiry_record`
- `replenishment_policy`

**Critical invariant:** on-hand/available/reserved/incoming values are derived from ledgers/reservations/open receipts; no privileged UI may silently overwrite stock truth.

## H. Procurement

- `supplier_account`
- `purchase_request`
- `purchase_request_line`
- `rfq`
- `supplier_quote`
- `supplier_quote_line`
- `purchase_order`
- `purchase_order_line`
- `goods_receipt`
- `goods_receipt_line`
- `supplier_performance_snapshot`

Lifecycle:

```text
Purchase Request → Approval → RFQ → Supplier Quote → Selection → PO → Goods Receipt → Supplier Invoice → Payment
```

## I. Finance

- `chart_of_accounts`
- `account`
- `journal`
- `journal_entry`
- `journal_line`
- `posting_batch`
- `invoice`
- `invoice_line`
- `credit_note`
- `payment`
- `payment_allocation`
- `expense`
- `bank_account`
- `bank_transaction`
- `reconciliation`
- `tax_transaction`
- `budget`

**Double-entry invariant:** every posted journal entry is balanced per currency/posting rules. Posted entries are immutable; errors are corrected through reversal/correction entries.

## J. Projects/work

- `project`
- `project_milestone`
- `task`
- `task_dependency`
- `time_entry`
- `project_expense`
- `resource_assignment`
- `contract`

Project can link customer, contract, budget, cost center, sales order and invoices, enabling actual profitability.

## K. HR

- `employee`
- `employment`
- `position`
- `org_assignment`
- `leave_request`
- `attendance_record`
- `shift`
- `performance_cycle`
- `employee_document`
- `offboarding_case`

Payroll is initially an integration boundary; DABBIR may store payroll run status/evidence without claiming to be a statutory payroll engine.

## L. Service and communications

- `ticket`
- `sla_policy`
- `conversation`
- `conversation_participant`
- `message`
- `channel_account`
- `consent_record`
- `handoff`
- `followup`

All customer-facing events can appear in `customer_timeline_event`, preferably as a read model built from authoritative entities/events.

## M. Documents

- `document`
- `document_version`
- `document_link` — entity-to-document relationship.
- `document_acl`
- `retention_policy`
- `signature_request`

Blob storage is external/object storage; metadata/access/audit remain canonical in DABBIR.

## N. Workflow/approval/integration

- `workflow_definition`
- `workflow_version`
- `workflow_execution`
- `workflow_step_execution`
- `approval_policy`
- `approval_request`
- `approval_step`
- `approval_decision`
- `integration_connection`
- `webhook_endpoint`
- `webhook_delivery`
- `outbox_event`
- `dead_letter_event`

## O. AI governance

- `ai_agent_definition`
- `agent_principal`
- `ai_tool_definition`
- `ai_policy_binding`
- `ai_execution`
- `ai_tool_call`
- `ai_approval_link`
- `ai_execution_receipt`
- `ai_cost_record`

## P. Audit

`audit_event` minimum fields:
- event_id
- tenant_id
- actor_type / actor_id
- session_or_execution_id
- action
- entity_type / entity_id
- occurred_at
- source
- reason
- before_hash / before_json where permitted
- after_hash / after_json where permitted
- approval_request_id
- ai_execution_id
- correlation_id
- request_id

Sensitive fields must be redacted/tokenized in audit payloads; auditability does not justify duplicating secrets.

## Cross-domain invariants

1. Every tenant-scoped row carries tenant ownership.
2. Every business write emits an audit event.
3. Every externally retryable mutation has an idempotency key.
4. Posted finance and stock entries are immutable.
5. Critical state changes use explicit state machines.
6. Money always has amount + currency; no floating-point money.
7. AI/integrations are principals, never invisible superusers.
8. Deleting a master record cannot orphan historical transactional evidence.
