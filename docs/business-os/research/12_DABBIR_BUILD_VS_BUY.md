# 12 — DABBIR Build vs Buy / Integrate

**Snapshot:** 2026-08-26

Rule: DABBIR owns business semantics, authority and canonical state. Specialized regulated/infrastructure functions should usually be integrated unless owning them creates clear strategic value.

| Capability | Decision | Reason |
|---|---|---|
| Tenant/company hierarchy | BUILD | core product semantics |
| Canonical customer/supplier/product/employee model | BUILD | source of truth and differentiation |
| Membership/roles/policies | BUILD policy model | company authority is core |
| Authentication primitives | INTEGRATE / managed provider | password/OAuth/MFA security benefits from specialized auth |
| Google/Apple login | INTEGRATE | use standards/provider OAuth |
| Enterprise SSO | INTEGRATE | SAML/OIDC complexity; WorkOS/Auth0-class provider is more efficient |
| SCIM/Directory Sync | INTEGRATE | enterprise IdP variability is costly and security-sensitive |
| Approval engine | BUILD | must apply consistently to all business modules and AI |
| Audit ledger | BUILD | authoritative evidence across modules |
| Workflow engine | BUILD compact core | central differentiator; can integrate external actions |
| Generic long-tail app connectors | INTEGRATE | Zapier/Make/n8n-style ecosystems are wider than DABBIR can reproduce |
| Strategic connectors | BUILD adapters | e.g. payments, commerce, WhatsApp, eInvoice, key accounting/banks |
| CRM | BUILD | part of unified customer truth |
| Sales/order management | BUILD | transaction core |
| Inventory ledger/reservations | BUILD | transaction core/invariants |
| Procurement | BUILD | transaction core and approvals |
| Finance double-entry ledger | BUILD carefully | one source of financial truth; cannot outsource business posting semantics |
| Tax calculation framework | BUILD framework + INTEGRATE data/services as needed | rules are jurisdiction-specific and versioned |
| Payment rails | INTEGRATE | use licensed providers such as Stripe/approved local providers |
| Billing orchestration | BUILD around provider | DABBIR controls plans/business state; provider controls money rails |
| UAE eInvoicing transport | INTEGRATE accredited ASP | regulatory accreditation and network transport should not be recreated |
| eInvoice canonical data/validation/status | BUILD | DABBIR must create correct structured business data and evidence |
| Payroll statutory engine | INTEGRATE first | high legal/local complexity |
| WPS delivery/payment channel | INTEGRATE | provider/government/bank interfaces |
| HR core | BUILD | employee/company graph is core |
| Recruitment | DEFER then BUILD/INTEGRATE based demand | not P0 |
| E-signature/trust service | INTEGRATE | specialized legal evidence/trust providers |
| Object/file storage | INTEGRATE infrastructure | commodity infrastructure; DABBIR owns metadata/ACL |
| Document management metadata/version links | BUILD | needed for entity-level governance |
| Email delivery | INTEGRATE | deliverability/reputation infrastructure |
| SMS | INTEGRATE | telecom provider network |
| WhatsApp/Meta | INTEGRATE official APIs | external regulated/platform channel |
| Enterprise search index | BUILD V1 | permission-aware canonical search is strategic and manageable in Postgres |
| External enterprise knowledge connectors | INTEGRATE later | use connectors/search providers if customer demand justifies |
| Vector embeddings/LLMs | INTEGRATE models | model layer changes quickly; remain provider-agnostic |
| AI tool/policy/orchestration | BUILD | critical differentiator and authority boundary |
| AI observability/receipts | BUILD | trust and audit requirement |
| Generic workflow/agent sandbox | BUILD only what DABBIR needs | avoid becoming a generic automation IDE |
| Observability instrumentation | BUILD using OpenTelemetry | standard instrumentation, vendor-neutral backend |
| Error monitoring backend | INTEGRATE | specialized observability products |
| Backups/database | INTEGRATE managed infra + BUILD verification | provider handles storage; DABBIR owns restore tests/RPO/RTO |
| WAF/DDoS/CDN | INTEGRATE platform | infrastructure/security commodity |
| Fraud/risk engines | INTEGRATE where needed | specialized data/models |
| Maps/geocoding | INTEGRATE | commodity provider |
| Analytics metric definitions | BUILD | business semantics/source-of-truth |
| BI visualization | BUILD core UI; INTEGRATE advanced export/BI later | owner experience is product; advanced BI can be ecosystem |

## Decision filters

Choose **BUILD** when:
- it defines DABBIR's source of truth or authority
- it must coordinate multiple modules
- it is required for differentiation
- vendor lock-in would compromise canonical state

Choose **INTEGRATE** when:
- regulated/accredited provider is needed
- infrastructure has mature specialized providers
- long-tail connector breadth outweighs product value
- security/deliverability/network effects are hard to reproduce

Choose **DEFER** when:
- no P0/P1 customer value is proven
- implementation would force premature jurisdiction complexity
- a feature adds screens but not measurable business outcome

## Provider abstraction requirement

Integrations must use DABBIR-owned interfaces and canonical states. Example:

```text
PaymentProvider
- createIntent()
- capture()
- refund()
- getStatus()
- verifyWebhook()

EinvoiceProvider
- validate()
- submit()
- receiveStatus()
- reconcile()
```

Provider payloads stay at the adapter boundary; core modules do not become coupled to a vendor schema.