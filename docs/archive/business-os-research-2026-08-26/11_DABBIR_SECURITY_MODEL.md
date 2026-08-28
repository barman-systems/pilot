# 11 — DABBIR Business OS Security Model

**Snapshot:** 2026-08-26

## Security objective

Protect tenant data and business authority while allowing humans, integrations and AI to act through the same governed command system.

## P0 threat/control matrix

| Threat | P | Required control |
|---|---:|---|
| Cross-tenant data disclosure | P0 | tenant ID on all rows, server policy checks, RLS defense-in-depth, tenant-scoped caches/search/storage |
| Broken object-level authorization | P0 | resource authorization on every read/write; never trust client-provided role/company |
| Privilege escalation | P0 | RBAC+ABAC, admin-action controls, short-lived elevation, audit, separation of duties |
| Session theft/fixation | P0 | secure HttpOnly cookies/tokens, rotation, expiry, CSRF/same-origin controls, MFA-ready auth |
| Secret leakage | P0 | managed secrets, no secrets in frontend/logs/audit/model prompts, rotation and access logging |
| SQL/injection | P0 | parameterized queries/typed data access; schema validation; no generic AI SQL execution |
| Mass assignment | P0 | explicit command DTO allowlists and server-owned fields |
| Business state tampering | P0 | state machines, immutable posted ledgers, approvals, optimistic concurrency |
| Duplicate external mutations | P0 | idempotency keys, provider correlation IDs, transaction/outbox pattern |
| Audit manipulation | P0 | append-only audit store, restricted write API, hashes/sequence where useful, independent retention |
| AI prompt injection | P0 | untrusted-content separation, tool allowlists, typed args, retrieval ACLs, approvals, output validation |
| AI excessive agency | P0 | agent principals, least privilege, READ/RECOMMEND/DRAFT/EXECUTE, risk tiers, kill switch |
| Integration compromise | P0 | per-connection credentials, narrow scopes, encrypted tokens, webhook signatures, revoke/rotate |
| Malicious file/upload | P0 | type/size limits, isolated processing, malware/content scanning path, no active execution |
| Data export abuse | P0 | export permission, limits, async jobs, watermark/evidence where appropriate, audit |
| Account recovery takeover | P0 | secure one-time recovery, allowlisted HTTPS redirects, token expiry, no account enumeration |

## Tenant isolation

Defense layers:
1. authenticated principal bound to tenant memberships
2. application policy evaluation
3. database RLS/tenant predicates
4. tenant namespacing in storage/search/cache/jobs
5. tenant ID included in audit/events
6. automated negative tests proving Tenant A cannot access Tenant B IDs

Never use “hidden UI” as authorization.

## Authentication roadmap

P0/P1:
- verified email/password
- secure recovery
- Google/Apple where configured
- MFA/passkeys readiness
- session/device management

P2 enterprise:
- SAML/OIDC SSO
- SCIM/directory lifecycle
- enforced corporate domain/IdP policy
- enterprise admin portal

## Authorization

- central permission service
- role templates + custom roles
- ABAC scopes
- field-level restrictions
- separation of duties
- approval authority distinct from CRUD permission
- deny by default

## Data protection

- TLS in transit
- managed encryption at rest by infrastructure provider
- application-level encryption/tokenization for selected high-risk fields if threat model requires
- classification labels: public/internal/confidential/restricted
- PII minimization
- tenant-configurable retention within legal constraints
- backup encryption + restore testing
- no production data in developer previews by default

## Financial and inventory integrity

- posted journal/stock ledger entries immutable
- corrections by reversal/compensation
- posting periods and close controls
- double-entry validation
- source document linkage
- inventory reservation/fulfillment concurrency protection
- high-risk changes use approvals

## AI/agent security

Reference baselines:
- OWASP Agentic AI Threats and Mitigations: https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/
- OWASP Agentic AI security landscape 2026: https://genai.owasp.org/resource/ai-security-solutions-landscape-for-agentic-ai-q2-2026/
- NIST AI RMF GenAI Profile: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

Controls:
- agent is a principal
- allowlisted typed tools
- separate deterministic policy layer from model reasoning
- retrieved messages/docs/web are untrusted
- least data sent to model
- high-risk actions approval-gated
- result validation and postcondition checks
- budget/rate limits
- model/provider allowlist
- execution receipt without private chain-of-thought
- emergency disable per agent/tool/provider

## API security

- OpenAPI-defined contracts
- schema validation
- rate limits by user/integration/tenant
- idempotency for mutations
- replay-protected signed webhooks
- short-lived OAuth tokens where applicable
- webhook egress allowlist controls for sensitive environments
- correlation/request IDs
- structured error codes without secret/internal leakage

## Supply chain

- lock dependencies
- automated dependency/security scanning
- provenance/SBOM capability before enterprise launch
- minimal runtime dependencies
- branch protection/CI gates
- no direct production deploy from unreviewed experimental branches

## Observability/security operations

Use vendor-neutral OpenTelemetry conventions for logs/metrics/traces where possible.

Security telemetry:
- auth failures and suspicious recovery
- privilege/role changes
- bulk exports
- approval bypass attempts
- integration credential failures
- webhook signature failures
- agent denied actions
- unusual tool-call rates
- tenant-boundary test failures

Alerts must be actionable and severity-ranked.

## Backup / DR

P0:
- automated encrypted backups
- documented restore process
- periodic restore verification
- RPO/RTO targets defined before paid production
- migration rollback strategy

P1/P2:
- regional resilience based on customer/SLA needs
- tested disaster recovery exercise

## Incident response

Every incident record should preserve:
- detection time/source
- affected tenants/entities
- severity
- containment action
- evidence/correlation IDs
- customer notification decision
- recovery steps
- root cause
- prevention task

## Security acceptance gates

Before launch:
- tenant escape tests
- authorization matrix tests
- recovery/login abuse tests
- API schema/fuzz negative tests
- financial and stock invariant tests
- webhook replay/idempotency tests
- agent prompt-injection/tool-abuse tests
- secret scanning
- dependency scanning
- backup restore test
- audit completeness test

No `P0` security finding may be waived by hiding a feature from the UI.