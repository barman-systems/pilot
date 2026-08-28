# 02 — Enterprise Capability Map

**Snapshot:** 2026-08-26

Priority legend: **P0** foundation, **P1** competitive core, **P2** advanced, **P3** later/industry-specific.

| Domain | Capability set | Priority | Value test | Benchmark | DABBIR decision |
|---|---|---:|---|---|---|
| Company Core | tenant, organization, legal entity, company, branch, department, cost center, team, locale, currency, fiscal settings | P0 | control + scale | SAP, NetSuite, Dynamics | BUILD |
| Identity | user, employee principal, session, one-time invite, permanent membership, MFA-ready, OAuth-ready | P0 | risk + productivity | WorkOS, Workday | BUILD core / INTEGRATE auth primitives |
| Authorization | role templates, custom roles, RBAC, ABAC, record/field/resource scopes, branch/department scope, temporary elevation | P0 | risk + control | Workday, ServiceNow, Rippling | BUILD policy layer |
| Audit | immutable write audit, actor/source/session, before/after, reason, approval, AI involvement | P0 | risk + trust | ServiceNow, Workday | BUILD |
| Approvals | single, sequential, parallel, threshold, conditional, role-based, escalation, delegation, expiry | P0 | risk + control | ServiceNow, SAP, Dynamics | BUILD shared engine |
| CRM | contacts, leads, source, scoring, opportunity, activities, tasks, pipeline, forecast, customer 360 | P0/P1 | revenue | Salesforce, HubSpot, Odoo | BUILD |
| Customer Timeline | sales, invoices, messages, tickets, documents, payments, tasks in one chronological view | P0 | service + control | Salesforce | BUILD |
| Sales | quote, pricing, discount policy, approval, order, fulfillment, invoice state, return, customer history | P0 | revenue + control | SAP, Odoo, NetSuite | BUILD |
| Product | product, SKU, service, UOM, price lists, tax class, lifecycle | P0 | revenue + control | Odoo, SAP | BUILD |
| Inventory | warehouse, location, stock ledger, on-hand, available, reserved, incoming, transfer, adjustment | P0 | cost + control | SAP, Cin7, Acumatica | BUILD |
| Replenishment | reorder point, safety stock, lead time, suggested PO, demand signals | P1 | cost + productivity | Cin7, Katana | BUILD |
| Traceability | lot/batch, serial, expiry, recall trace | P2 | risk | Katana, Epicor | BUILD as capability pack |
| Procurement | supplier, purchase request, RFQ, supplier quote, selection, PO, receipt, supplier invoice, performance | P0/P1 | cost + control | Oracle, SAP | BUILD |
| Finance Core | chart of accounts, journal, double-entry ledger, fiscal periods, posting rules, reversal | P0 | control | Oracle, SAP, NetSuite | BUILD carefully |
| AR/AP | invoices, credit notes, receivables, payables, aging, allocations | P0/P1 | cash + control | NetSuite, Xero | BUILD |
| Bank Reconciliation | imported transactions, matching, reconciliation status | P1 | time + control | Xero, NetSuite | BUILD + bank feed integrations |
| Financial Reporting | trial balance, P&L, balance sheet, cash flow, cost centers | P1 | control | Oracle, SAP | BUILD from ledger |
| Budget/Forecast | budgets, variance, scenario forecast | P2 | control | Oracle EPM, Dynamics | BUILD later |
| Tax | tax codes, VAT treatment, tax evidence, returns-support data | P1 | compliance | UAE FTA + ERPs | BUILD rules framework; VERIFY jurisdiction |
| Payments | payment intents/status/reconciliation, provider adapters | P0/P1 | revenue | Stripe | INTEGRATE rails; BUILD orchestration |
| eInvoicing | structured invoice model, validation, ASP adapter, status/evidence | P0 architecture / P1 rollout | compliance | UAE MoF | INTEGRATE accredited provider |
| Projects | project, customer, contract, budget, team, tasks, time, expense, invoice, profitability | P1 | revenue + productivity | Epicor, Dynamics, Asana | BUILD |
| Tasks/Work | task, owner, due date, dependency, SLA, priority, state | P0 | productivity | Asana, monday, Jira | BUILD |
| HR Core | employee profile, org chart, employment state, documents, leave, attendance | P1 | productivity + control | Workday, BambooHR, Rippling | BUILD HR core |
| Payroll | payroll calculation, statutory rules, WPS output/integration | P2 | compliance | local providers/Deel | INTEGRATE first |
| Recruitment | requisition, candidate, interview, offer, onboarding | P2 | productivity | BambooHR, Workday | DEFER/industry demand |
| Performance | goals, review cycles, feedback | P2 | productivity | Workday, BambooHR | DEFER |
| Service | ticket, SLA, queue, priority, resolution, knowledge | P1 | service | ServiceNow, Salesforce | BUILD |
| Communications | conversation, participant, channel, message, attachments, consent | P1 | service | Salesforce, HubSpot | BUILD hub + adapters |
| Omnichannel | WhatsApp, email, web, Instagram, SMS, voice adapters | P1/P2 | service | ServiceNow, Salesforce | INTEGRATE channels |
| Documents | document, version, folder/tag, entity link, access, retention | P1 | control | SharePoint-like DMS patterns | BUILD metadata / INTEGRATE storage/e-sign |
| E-sign | signature request/status/evidence | P2 | time | specialized providers | INTEGRATE |
| Search | global lexical + semantic search across authorized entities | P1 | productivity | Glean, Rovo | BUILD permission-aware index |
| Analytics | operational, sales, inventory, customer, supplier, financial metrics and drill-down | P1 | control | Dynamics, NetSuite | BUILD semantic metric layer |
| Command Center | exceptions, impact, urgency, risk, deadline, responsible actor | P0/P1 | control | ServiceNow patterns | BUILD differentiated UX |
| Workflow | trigger, condition, action, wait, branch, approval, retry, compensation | P0 | productivity | Make, n8n | BUILD core |
| Integration | API, webhooks, connector credentials, sync state, rate limits, idempotency | P0 | scale | Zapier, Workato-style platforms | BUILD framework / INTEGRATE connectors |
| AI Copilot | ask/explain/summarize across allowed business data | P1 | productivity | Joule, Copilot, Ask Oracle | BUILD |
| AI Actions | READ, RECOMMEND, DRAFT, EXECUTE with policy checks | P0 architecture / P1 UX | productivity + control | Workday ASOR, ServiceNow | BUILD |
| AI Agents | domain-scoped agent principals/tools/memory/risk | P2 after policy layer | productivity | ServiceNow, Workday, n8n | BUILD selectively |
| Agent Control | inventory, identity, permission, approval, execution receipt, cost, trace, kill switch | P0 architecture | risk | Workday, ServiceNow | BUILD |
| Observability | logs, metrics, traces, jobs, queues, connector health | P0 | reliability | OpenTelemetry | BUILD instrumentation |
| Self-healing | safe retry, replay, reconciliation, drift detection, quarantine | P1 | reliability | resilient workflow patterns | BUILD bounded |
| Industry Packs | configuration, forms, workflows, metrics, roles for retail/clinic/etc. | P2 | time-to-value | Odoo/SAP industry patterns | BUILD as metadata, never forks |

## Capability quality gate

A capability may move from map to implementation only when its spec contains: user/problem, measurable business value, priority, benchmark, BUILD/INTEGRATE/DEFER decision, dependencies, security impact, canonical entities, state machine, events, permissions, audit requirements and acceptance tests.
