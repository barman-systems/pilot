# DABBIR Business OS v1

## Product decision

DABBIR Business OS is a separate product line from the current DABBIR operational assistant. It is a compact ERP / Business OS for small and medium businesses, inspired by the integration principles of SAP without copying SAP complexity.

## Isolation rules

- Branch: `dabbir-business-os-v1`
- Do not modify or deploy the current DABBIR production baseline from this branch.
- No production data migrations until the Business OS schema passes review and migration dry-runs.
- No reuse of current production secrets by default.
- Separate deployment target and separate runtime configuration are required before public testing.
- Shared code may be copied only when it is generic, audited, and does not couple the two products.

## v1 core modules

1. Company Core
   - companies
   - branches
   - departments
   - users
   - memberships
   - roles
   - granular permissions
   - approval policies

2. CRM
   - customers
   - leads
   - contacts
   - pipelines
   - activities
   - notes

3. Sales
   - quotations
   - sales orders
   - invoices
   - returns
   - payment status

4. Inventory
   - products
   - variants
   - warehouses
   - stock balances
   - stock movements
   - transfers
   - reorder rules

5. Procurement
   - suppliers
   - purchase requisitions
   - purchase orders
   - receipts
   - supplier invoices

6. Operations
   - tasks
   - projects
   - appointments
   - service requests
   - approvals
   - SLA tracking

7. Finance Lite
   - chart of accounts
   - journals
   - receivables
   - payables
   - expenses
   - cash flow
   - profit and loss summary

8. HR Lite
   - employees
   - attendance
   - leave
   - departments
   - manager hierarchy

9. Communications
   - WhatsApp
   - email
   - internal comments
   - notifications

10. Automation Engine
   - triggers
   - conditions
   - actions
   - approval gates
   - scheduled jobs

11. DABBIR AI
   - read authorized business context
   - generate summaries and recommendations
   - create drafts
   - execute approved actions
   - never bypass role permissions or approval gates

12. Governance
   - immutable audit log
   - action history
   - data ownership
   - soft delete / archival rules
   - export controls

## Core design principle

Every module must operate on one canonical company graph. A customer, product, supplier, invoice, employee, warehouse, and order must not be duplicated across modules. Events from one module must update dependent modules through explicit domain events.

Example:

Sales Order confirmed -> reserve inventory -> create fulfillment task -> update customer timeline -> create receivable -> generate audit event -> notify permitted users.

## Security model

- Multi-tenant by company.
- Row-level security by company membership.
- Fine-grained permissions by module and action.
- Owner/Admin approval required for sensitive actions.
- Employees use one-time invitation -> permanent membership -> normal secure login.
- Audit every write that changes business state.
- No client-side trust for authorization.

## AI execution model

AI is a controlled operator, not a bypass layer.

Every AI action must pass:

intent -> permission check -> business rule validation -> approval gate if required -> execution -> audit event -> outcome verification.

## v1 delivery order

Phase 0 — Platform Core
- tenant model
- auth
- roles and permissions
- audit log
- company/branch/department model
- navigation and design system

Phase 1 — CRM + Sales
- customers
- leads
- quotes
- sales orders
- invoices

Phase 2 — Inventory + Procurement
- catalog
- warehouses
- stock ledger
- suppliers
- purchase orders
- receiving

Phase 3 — Finance Lite + Operations
- receivables/payables
- expenses
- cash flow
- tasks
- approvals

Phase 4 — AI + Automations + Channels
- AI command center
- automation rules
- WhatsApp/email integrations
- notifications

## Launch criterion

DABBIR Business OS v1 is not considered production-ready until an end-to-end scenario succeeds:

lead -> customer -> quote -> approved sales order -> stock reservation -> invoice -> payment state -> fulfillment -> audit trail -> management dashboard.
