# DABBIR activity navigation implementation — 5 September 2026

Status: review branch; NOT READY for the full requested acceptance matrix. No production deployment or database changes performed by this work.

Baseline: PR #498 was open/draft at 3791cf3; main f104317 was merged into the local work. Existing navigation/history repairs retained. This document supplements DABBIR_NAVIGATION_AUDIT_2026-09-05.md, not a replacement for its limitations.

## Customer model and supported scope

The nine profiles below exist in api/activity-tasks.js. A profile is not proof of a complete vertical product. Available means source-backed route/data model, not production E2E certification. The common customer journey is inquiry → conversation/customer → booking or operational work → owner decision → result. No claims of a medical system, property CRM, campaign manager or field dispatch were added.

| Activity | Core work / daily owner needs | Source-backed surfaces | Specialized primary destination | Owner work section | Remaining vertical gaps |
|---|---|---|---|---|---|
| Store | Review inquiries, orders, stock, follow-ups, decisions | Conversations, customers, operations, tasks | Orders & stock | Order and stock alerts from owner feed | Collected payments, returns, matching filtered totals not validated |
| Salon | Today's bookings, confirmations, customers, services, decisions | Appointments, customers, services, tasks | Bookings | Today's active bookings | Staff occupancy and actual collection not established |
| Clinic | Appointments, inquiries, patient contact, follow-ups, decisions | Generic appointments/customer contacts/services | Appointments; Patients label | Today's active appointments | No medical-record or clinical workflow claim |
| Car wash | Bookings, inquiries, customer details, services, decisions | Appointment/services and existing car-wash extensions | Bookings | Today's wash bookings | Dispatch, team availability, collection E2E outstanding |
| Laundry | Pickup arrangements, inquiries, customers, services, decisions | Generic bookings/services | Pickup & drop-off | Today's pickup/drop-off bookings | Garment lifecycle/delivery completion unverified; booking is not delivery proof |
| Services | Service bookings, inquiries, customers, services, decisions | Generic bookings/services | Service bookings | Today's service appointments | Field visits, assignment, projects unverified |
| Real estate | Inquiries, leads, viewings, follow-ups, decisions | Generic conversations/customers/appointments/tasks | Viewings; Leads label | Upcoming viewings | Property catalogue/pipeline not established |
| Creator | Collaboration inquiries, contacts, schedule, follow-ups, decisions | Generic conversations/customers/appointments/tasks | Schedule; Collaboration leads label | Upcoming collaboration appointments | Campaign execution/deliverables not established |
| Other | Inquiries, customers, appointments, follow-ups, decisions | Generic conversations/customers/appointments/tasks | Appointments | Upcoming work | Capability-specific operations beyond generic workflow unverified |

## Implemented navigation

Stable MAIN order: Today → activity work → Conversations → Customers (activity label where useful) → More. Each destination is permission-filtered; 3–5 destinations for default supported roles. Explicit grants can reduce this further.

More: tasks & decisions, reports, notifications, settings, existing business switch/team access as allowed. Services remains a secondary existing shortcut only where supported. Owner action shortcut now reaches the actual command form, not the hidden copilot.

Settings: integrations & channels, scheduled follow-ups, help, plus existing business/account controls. Existing cards are moved with their handlers intact. Integrations remains reachable in three clicks from a primary screen: More → Settings → Integrations.

Visibility uses business type + business-scoped enabled capabilities + membership role/permissions. Unknown roles get no primary routes. UI filtering is not server authorization. Existing backend controls retained. No new schema/backend access policy.

## Owner dashboard

One shared renderer with registry-driven work sections; no independent application per activity. Shared regions: short heading, operational shortcuts, relevant work queue, execution-result disclosure, existing owner action center and execution controls. Repeated generic metric cards and redundant setup card are hidden for owners. Activation appears after work. Employee does not receive the new owner region/action-center/command controls.

Metrics intentionally limited: work rows are a bounded loaded-data view, NOT exact business totals. No invented revenue, collection, occupancy, delivery or savings cards. Appointment day uses business timezone (fallback Asia/Dubai); cancelled, completed, no-show and simulated rows excluded. Real-estate/creator/other queue uses upcoming timestamps. Store rows use order/inventory alerts from owner_action_center. Execution results use handled.available and server titles/completed_at from VERIFIED_SUCCESS autonomous outcomes, not accepted plans. Unavailable is distinct from zero.

## Before / after

Before counts are source-derived paths, not timed baseline user trials. After observed paths are synthetic browser tests unless stated otherwise.

| Journey | Before | After | Evidence / limitation |
|---|---|---|---|
| Owner → daily work | Generic destination then inspect list, 1+ | Activity work, 1 | All nine owner titles/switches observed; latest stable order verified by code |
| Dashboard → loaded appointment | General list then locate, 2+ | Selected summary, 1; work-page record focus, +1 | Salon summary and Back observed; native editable detail not fully verified |
| Dashboard → stock issue | General operations then search, 2+ | Identified issue summary, 1 | Store row rendered; live product resolution outstanding |
| Owner → tasks/decisions | More → tasks, 2 | Dashboard shortcut, 1 | Existing task screen retained |
| Owner → reports | More → reports, 2 | Dashboard shortcut, 1 | Metrics destinations remain legacy scope |
| Owner → integration | More → integration, 2 | More → Settings → integration, 3 | Intentional administrative grouping; settings cards observed |
| Record summary → return | General screen navigation | Back closes summary, 1 | Browser and history tests |
| Change business | Old async response could overwrite new | Only newest runtime response renders | Deferred response race test |
| Failed action-center load | Could normalize into reassuring zeros | Explicit error and cleared stale contents | Failure state observed in isolated browser |

## Implementation inventory

- api/_activity-experience.js: shared profiles, labels, roles, capability checks, work queues.
- api/_activity-experience-ui.js: shared navigation/dashboard, settings grouping, summary modal, focus/Back handling.
- api/dabbir-contextual-navigation-ui.js: inject shared registry/UI and apply after legacy navigation.
- api/activity-profile-ui.js: business-scoped capability state, ignore stale profile fetch.
- api/owner-action-center-core-ui.js: ignore stale business responses; honest load errors.
- api/dabbir-owner-first-ui.js: actual action-row handler links to entity summary; preserve error state.
- index.html: ignore out-of-order runtime responses; retain earlier history/scroll changes.
- test/dabbir-activity-experience.test.mjs: nine activities × seven roles × both languages, capability and queue cases.
- test/dabbir-navigation-history.test.mjs: added real asynchronous business-switch race scenario.
- scripts/preview-activity-experience.mjs and package.json: explicitly synthetic local-only preview server; unavailable integrations return errors; never production authentication or data proof.

Generated public bundles are rebuilt by dabbir:build/deployment and excluded from this source change to avoid unrelated pre-existing generated drift.

## Verification and evidence

- Initial full build after restructuring: 1323 tests passed, zero failed. Final gate including new runtime race test recorded in PR delivery.
- Isolated browser: owner render/activity switch for all nine profiles; salon appointment summary and Back; store stock queue replacing previous appointment context; More/Settings regrouping; English LTR; employee owner-controls hidden. Desktop screenshot captured in the conversation, explicitly marked LOCAL FIXTURE.
- Seven role models: owner/admin/manager/employee/staff/agent/viewer. Browser roles: owner and employee only. This does not certify all server permissions.
- Simulated API failures intentionally returned 503; action-center error state observed. No external message, real approval or operational write executed.
- Responsive styles include 44/48px controls, bottom-sheet safe area, visible active parent, reduced primary count. Actual iPhone/Safari/keyboard/overflow E2E remains unverified.

## Remaining acceptance gaps (do not conceal)

1. Generic summary is not yet a universal editable record deep link. Loaded DOM entity focus can report unavailable when absent; no guessed URL or wrong entity fallback.
2. Result feed does not return an outcome entity ID; verified result title/time is displayed, but an execution-evidence deep link requires an actual supported destination.
3. All-activity transactional fixtures, server authorization, deleted-record, filters/search restoration and branch switching have not been comprehensively tested.
4. Exact activity-specific financial/occupancy metrics and filter-matching counts need authoritative definitions and supported data, not fabricated UI values.
5. Legacy profile/render modules remain; the new navigation/dashboard configuration is central, but this is not a completed consolidation of all old activity-specific code.
6. Real mobile/Safari evidence and authenticated preview/production business journeys remain open.

## Per-activity score

Do not award a numeric score from unit tests or profile labels. The required scoring dimensions are Tab Structure /20, Placement /20, Clarity /20, Click Efficiency /15, Context /10, Mobile /10, Back/State /5. Each is pending sufficient per-activity interactive evidence; no 90/100 claim.

| Activity | Before score | After score | Full requested acceptance |
|---|---|---|---|
| Store | Not measured | Not certifiable yet | NOT READY |
| Salon | Not measured | Not certifiable yet | NOT READY |
| Clinic | Not measured | Not certifiable yet | NOT READY |
| Car wash | Not measured | Not certifiable yet | NOT READY |
| Laundry | Not measured | Not certifiable yet | NOT READY |
| Services | Not measured | Not certifiable yet | NOT READY |
| Real estate | Not measured | Not certifiable yet | NOT READY |
| Creator | Not measured | Not certifiable yet | NOT READY |
| Other | Not measured | Not certifiable yet | NOT READY |

These verdicts apply to completion of this requested audit/acceptance matrix, not a claim that every existing product feature is broken.
