# 07 — DABBIR Permission Model

**Snapshot:** 2026-08-26

## Principle

DABBIR must authorize **the action on the resource in its business context**, not merely check whether the user has a role name.

Use:

**RBAC templates + ABAC conditions + resource/field scopes + approval authority.**

## Principal types

- `user`
- `employee`
- `agent_principal`
- `integration_principal`
- `system_worker`

Every principal has an ID, tenant, status, authentication method, role/policy bindings and audit identity.

## Default role templates

- Owner
- Super Admin
- Admin
- Manager
- Supervisor
- Employee
- Accountant
- Sales
- Customer Service
- Warehouse
- Procurement
- HR
- Auditor
- Custom Role

Templates are onboarding conveniences, not hard-coded authorization logic.

## Permission grammar

Use stable permissions such as:

```text
crm.customer.read
crm.customer.write
sales.quote.create
sales.discount.apply
sales.order.confirm
inventory.stock.read
inventory.adjustment.request
inventory.adjustment.approve
procurement.po.create
procurement.po.approve
finance.invoice.issue
finance.journal.post
finance.payment.approve
hr.employee.read
hr.compensation.read
workflow.manage
audit.read
ai.execute
```

## Scope dimensions

A permission can be narrowed by:
- tenant
- company/legal entity
- branch
- department
- cost center
- team
- record ownership
- customer/account portfolio
- warehouse
- project
- data classification
- amount threshold
- time window
- temporary elevation expiry

Example:

```text
permission = finance.invoice.read
company_id = COMPANY_A
branch_id = ABU_DHABI
amount_max = null
```

A Dubai employee does not inherit Abu Dhabi visibility simply because both hold `Sales`.

## Field-level controls

Sensitive fields can have separate policy checks:
- salary/compensation
- bank account
- national identifiers
- cost/margin
- customer credit limit
- private HR notes
- secrets/tokens

Example: Sales may read product sell price but not supplier landed cost unless granted.

## Record ownership

Support policies such as:
- own records
- team records
- department records
- branch records
- all company records

Ownership is one attribute in policy evaluation; it does not replace roles.

## Employee access lifecycle

```text
OWNER/ADMIN CREATES INVITE
  → random one-time token hash stored
  → email/link/optional QR delivered
  → invite expires or is revoked if unused
  → employee authenticates/verifies identity
  → invite accepted exactly once
  → permanent membership activated
  → invite token invalidated
  → normal secure login thereafter
```

Invitation status:
`PENDING → ACCEPTED | EXPIRED | REVOKED`

Membership status:
`ACTIVE → SUSPENDED → ACTIVE | TERMINATED`

Resending creates a new token and invalidates the prior token where security policy requires.

## Enterprise identity path

SMB V1: password + verified email; OAuth/social providers can be integrated.  
Enterprise later: SAML/OIDC SSO + SCIM/Directory Sync.

WorkOS research reinforces that enterprise customers expect automatic provisioning/deprovisioning and group sync. DABBIR should preserve an identity-provider-neutral internal membership model so an enterprise directory can become a lifecycle source without replacing DABBIR authorization.

## Approval authority

Permission to **request** an action differs from authority to **approve** it.

An authority rule can depend on:
- action/resource type
- company/branch
- amount/currency
- department/cost center
- risk class
- requester role
- segregation-of-duties rule

Example:

```text
Purchase order <= 5,000 AED → Procurement Manager
5,000–50,000 AED → Procurement Manager + Finance Manager
> 50,000 AED → Finance Manager + Owner/CFO
```

Threshold values are tenant configuration, not product constants.

## Approval modes

- single
- sequential
- parallel
- threshold-based
- conditional
- role/group-based
- named approver
- escalation
- delegation
- expiry

Approval instance must snapshot the policy/version used so later policy edits cannot rewrite history.

## Segregation of duties

P0 controls:
- requester should not approve own sensitive request unless explicit exceptional policy.
- journal preparer vs poster can be separated.
- payment creator vs approver can be separated.
- stock adjustment requester vs approver can be separated.
- employee compensation editor vs payroll approver can be separated.

## AI permissions

An AI agent never receives blanket service-role access.

Two execution modes:

### Delegate mode
Effective permission = intersection of:
`agent tool scope ∩ initiating user's effective permission ∩ current resource policy`.

### Service mode
Agent uses its own tightly-scoped principal and can operate only inside explicitly assigned domains/tools. High-risk actions still enter the approval engine.

Every AI action records:
- initiating human/system
- agent principal
- permission decision
- tool called
- proposed vs executed action
- approval
- before/after
- result

## Policy evaluation order

1. Principal active?
2. Tenant/resource relationship valid?
3. Permission granted by role/custom policy?
4. Scope/ABAC conditions pass?
5. Field restrictions pass?
6. Segregation-of-duties constraints pass?
7. Does action require approval?
8. If approved, is approval valid/current/unspent?
9. Execute command.
10. Audit decision + outcome.

## Fail-closed rule

Unknown principal, missing scope, stale approval, ambiguous company or failed policy evaluation must deny the mutation. The UI may explain the next allowed step; backend authorization cannot guess.