# Activity Intelligence V1

Baseline: main `9baaf3568d3e1c4adce2c3c62363d090936fa95e`, rebased onto
`98ad82b89d058723e38e1aa239c4de1d60279d47`. Live code and PostgreSQL function
definitions were inspected before implementation. Historical recovery reports
were not treated as current production evidence.

## Why this change is needed

The semantic engine selected operational requirements from a vertical map;
the native WhatsApp booking Flow always collected location. Neither represented
per-service delivery mode. An old vehicle memory UUID also did not establish
a current, structured operational fact. This produced unnecessary questions
and divergent JavaScript/database requirements.

## Execution contract

`business → branch → service → activity instance → delivery mode → requirements
→ grounded facts → missing/invalid facts → policy → tool → database proof`

The private versioned registry is seeded from `_dabbir-activity-registry.json`.
The runtime reads database contracts; it does not fall back to an embedded
prompt or model-authored requirements. Precedence is platform safety, activity
defaults, branch catalog service data, then versioned owner configuration.
Each contract hashes its registry, owner version, branch, service, duration,
price and compatible legacy knowledge. A changed contract invalidates an old
slot presentation and requires fresh availability and confirmation.

The profile exposes branch-scoped services, categories, operating models,
activity instances, delivery modes, workers/resources, service areas, required
and optional facts, constraints and policies. Existing data has no team or
asset inventory tables: these collections are explicitly unconfigured.
The existing appointment/worker engine continues to own capacity. This release
does not claim a new team, fleet or inventory scheduling engine.

## Requirements and modes

| Configuration | Customer facts before availability |
|---|---|
| Mobile car wash | service, vehicle, signed GPS, date, time |
| Car wash at business | service, date, time |
| Salon at business, optional worker | service, date, time |
| Home cleaning | service, property details, signed GPS, date, time |
| Administrative clinic booking | appointment type/service, date, time |
| Remote consultation | service, date, time |
| Laundry pickup | service, signed GPS, date, time |

Branch is grounded from the WhatsApp conversation/channel. A required staff
choice is scoped to that branch and service. `AT_BUSINESS`, `AT_CUSTOMER`,
`MOBILE`, `REMOTE`, `PICKUP`, `DELIVERY` are executable modes. `HYBRID` denotes
an unresolved choice; it cannot authorize execution. Customer-visit modes
always require verified GPS. Clinic ontology maps administrative appointment
types to services and doctors to staff; diagnosis remains forbidden.

`resolveOperationalRequirements` returns required, optional, already satisfied,
missing, invalid, needs confirmation, blocked and reasons. Collection priority
is centralized and owner configurable. Questions acknowledge grounded service,
date and time, and ask only the next missing entity. Question wording remains
bound to schema definitions; arbitrary model-generated execution claims are
never sent to the customer.

## Semantic understanding and privacy

The bounded AI interpreter handles natural language and proposes entities with
evidence. Deterministic grounding validates catalog, mode, corrections and
provenance. Most natural-language turns use one interpretation call; simple
verified selections need none. The provider receives labels and bounded
context, not operational IDs, full customer rows or secrets. A final boundary
redacts pasted credentials, internal UUIDs and structured GPS markers.

The first recoverable provider failure schedules a retry. The second rechecks
current authority and hands off with `customer_requested_human=false`.
An explicit human request hands off immediately. Repeated unresolved
requirements are reinterpreted and eventually handed off instead of looping.

## Database safety

The append-only service configuration table uses exact composite branch/service
foreign keys, owner RLS, compare-and-swap versions and SAVE/REVOKE/ROLLBACK.
Owners cannot disable tenant scope, signed location, current semantic authority,
slot verification, confirmation or inference restrictions.

A reusable appointment trigger independently recompiles requirements and
checks current semantic version/message revision, active lock, takeover,
tenant/branch/customer/service, slot/provider proof, worker, fact provenance,
memory expiry and geographic area. It persists GPS and the activity contract
snapshot atomically. Create/reschedule RPCs recheck current contracts and lock
catalog configuration against concurrent changes. Existing ledgers preserve
idempotency and verified outcome readback.

Only signed WhatsApp `message.type=location` input creates an immutable receipt
through a service-role-only RPC. Typed coordinates or AI-inferred GPS cannot
substitute for that receipt. The old Flow location field is optional on legacy
replies; new Flow schemas collect common booking details and let the activity
conversation collect remaining requirements.

Memory requires the same business, customer, branch and compatible service,
current verified status/version, structured value, confirmation and expiry.
Old UUID-only or revoked memory cannot authorize booking. Service-area V1 uses
a bounded circle and a provider-tagged result contract; an external routes
adapter can later supply geographic proof without moving authority to the LLM.

## Evidence and release

Synthetic before/after evaluation is in `docs/evidence/activity-intelligence-v1`.
It measures twelve deterministic cases, not live LLM accuracy or conversion.
Real PostgreSQL-compatible integration tests exercise the actual migration and
independent database gates; existing booking, voice, catalog, flows, names,
handoff, coexistence, branch and security tests remain part of the full suite.

Production acceptance requires: all CI/security checks, exact applied migration
SQL and history identity, production database rollback smoke, main/deployment/
release-evidence SHA agreement, and production application journeys. Synthetic
provider receipts are labelled fixtures and are never real WhatsApp evidence.
Real WhatsApp testing requires an authenticated Meta/WhatsApp session.

Applied production migration: `20260908155841_dabbir_activity_intelligence_v1.sql`.
The new file was renamed to the identity issued by Supabase after application;
its SQL was unchanged (MD5 `7bfc89e73fbaa841e3bd32d8a5fd0787`). No older
applied migration was edited. Production rollback smoke passed on 2026-09-08:
context, semantic load/commit/replay, availability, missing vehicle and inferred
location rejection, GPS readback, booking idempotency, verified memory,
reschedule, cancellation and newer-message rejection. Provider receipts in
that SQL smoke are synthetic fixtures, not Meta delivery evidence.

Supabase advisory deltas are intentional: two RLS-enabled tables deny direct
client access without policies; two owner-authorized SECURITY DEFINER RPCs
remain executable by authenticated users and enforce membership internally.
Cross-tenant/anonymous denial is tested. These notices must not be described
as an empty advisor report.
