# Shared appointment interval contract

This slice starts after #702 completed Production run 34473014165, attempt 1,
on stable SHA `67429babf48c0426157a2729ce444126752c5355`. The legacy deletion,
Arabic, English iPhone, independent iPad/WebKit and isolation 13/13 are verified.
The original intermittent WebKit Today root cause remains unresolved.

## Proven defect

`_calendar-sync-core.js` imported a Google/Outlook move by writing `starts_at`
and status, leaving `ends_at` at the previous time. A 09:00–10:30 appointment
moved to 12:00 fails the unchanged live PostgreSQL trigger with
`INVALID_APPOINTMENT_RANGE`. Moving it to 06:00 instead expands its duration.
The owner appointment API already moved both endpoints together.

On the unchanged Production source, four real sync-function cases and two
PostgreSQL-backed cases fail. Two database-rejection controls pass. The
failing-before commit is `e4a90cbdfece1366252888293be58c9a9f6fb12f` (tree matches the executed local reproduction).
The database fixture executes a snapshot of the actual live trigger; it does not
replace, relax or apply a Production constraint.

## Boundary

| Contract | Definition |
|---|---|
| Canonical owner | `_appointment-time-window.js::appointmentTimeWindow` |
| Input | Validated start instant and a finite positive duration in milliseconds |
| Output | ISO `starts_at` and `ends_at`, both finite, end strictly after start |
| Dependencies | None |
| Failure | Invalid or unrepresentable interval throws before any write |
| Tests | Actual owner handler, real Google/Outlook sync function with synthetic I/O, unchanged PostgreSQL conflict/range trigger |

The owner API and calendar adapter now use the same interval constructor.
The calendar adapter persists both endpoints together and updates its in-memory
record only after the existing database call succeeds. Provider payloads therefore
use the same corrected interval. Rejected database writes still propagate failure
and cannot produce provider updates or a successful reschedule result.

Existing duration authorities are deliberately preserved: the owner API retains
its existing duration validation/fallback; calendar moves retain the positive
persisted interval, including two-minute and 48-hour services. The existing
60-minute fallback for missing calendar duration remains. Service duration is
only constrained to be positive in Production; imposing the owner's 24-hour
fallback on imported calendar moves would create another regression.

The active `durationMs` helper remains, with its body unchanged. No newly
superseded runtime path is deleted. This slice does not consolidate database
writers, activity-specific resize semantics, authorization or concurrency policy.
No SQL migration, Brain/provider-selection change, Meta change, timeout increase
or weakened acceptance gate is included.

## Caller map and evidence

Owner UI and car-wash editor → `appointment-management.js` → interval contract →
existing JWT/RLS appointment write.

Calendar OAuth callback, manual sync, outbox cron and salon operations →
`syncBusinessCalendars` → `syncCalendarConnection` → interval contract → existing
business/id-scoped service write → existing provider reconciliation.

`reschedule-authority-proof.json` records the focused caller graph, preceding
Production proof, metrics and verification status. API modules/imports change
from 289/513 to 290/515; functions 1405→1406; import cycles remain zero and the
one retained Brain reachability candidate remains untouched. These counts are
not claims of measured repair speed or complete booking-writer consolidation.

Fifteen new cases cover both directions, both providers, PostgreSQL range and
conflict enforcement, write rejection, short/long durations, unchanged owner
duration behavior and invalid intervals. Two existing source assertions now name
the shared constructor; their timestamp-change guards remain, and real handler
assertions verify persisted start/end and the existing historical/no-change path.

The next gate is full regression, required CI/security/browser checks, deployment
and one complete exact-SHA Production journey. Live Google/Outlook OAuth/account
delivery is outside the synthetic provider fixture; no such external proof is
claimed. Real-phone Meta proof is also separate.

Remaining debt includes operation-specific stale-write/CAS handling, other active
booking writers, web conversation, dynamic SQL and independently proven legacy
paths. No path is removed merely for its age, name or size.

Final local regression: **2845/2845**, zero failed/skipped/cancelled. Required CI and the new exact-SHA Production journey remain pending.
