# DABBIR owner dashboard consolidation — 2026-09-07

## Scope and provenance

Implementation, not an audit-only proposal. Starting main: `e4b7d5bc63b874bbc9c6658748b00bee52b841fc`. Consolidation checkpoint: `4ddfad8`. Integrated main `e04ff0d` (including the newer OTP v11 OIDC authentication, Sentry preloader and authorized legacy CEO boundary) and the existing owner PR #501 at `cca0955cd144682e7fe2b9b4a3f650c2522d2b16`, including invitation atomicity and granular permissions. No force push, replacement authentication system, new production table, or production data deletion is part of this consolidation.

Inspected routes, API handlers, UI import/injection chains, the deployed Supabase broker source, PostgreSQL function definitions and privileges, migrations, CI/build gates, Vercel configuration/deployments, and runtime environment variable names. No secret values are included here. Source inspection cannot establish whether the owner actually uses each tool: tool-level usage telemetry was not available. Decisions below use execution paths, duplication, permissions and actionable outputs, not guessed usage.

## Inventory and decisions

“Live” means a production-backed implementation exists; it does not mean an authenticated production browser action has been completed. Browser write verification uses an isolated synthetic transport. No fixture is imported by a production handler.

| Existing surface / purpose | Findings before repair | Classification / canonical outcome | Data and backend |
|---|---|---|---|
| Owner gateway | Cookie verification and role gate exist; upstream outages could be treated as invalid sessions | KEEP / FIX; one protected gateway, outage stays 503 without clearing cookie | Existing owner session RPC + Broker |
| Numbered command center v3–v29 | 27 files; stacked HTML/script injection and late DOM rewrites, overlapping dashboards and nav | REMOVE / MERGE into existing `owner-command-center.js`; old numbered URLs redirect | Same production sources through shared client |
| Runtime generator | Flattened the layered UI but retained its multiple scripts/controllers | REMOVE; one directly rendered page and one client router | Build no longer generates an owner runtime |
| Design-system overrides | Successive CSS layers and inconsistent small text | REDESIGN existing stylesheet; logical RTL properties, native dialog, touch controls | Presentation only |
| Owner dashboard v2 | Second directly rendered legacy dashboard | MERGE; compatibility redirect to the protected canonical route | No second renderer |
| Overview / executive metrics | Global and scoped values mixed; unknown values could become zero; sandbox revenue could look real | FIX / MERGE; decision metrics with timestamps, unknown states and scope filtering before counts | `command_center_overview_v1`, existing root executive RPC |
| Customer search | Existing customer-number/email/name search and scoped SQL | KEEP; one search and customer context | `customer_search_v2`, scoped implementation |
| Customer profile / diagnostic bridges | Unsupported broker actions, duplicate context screens | REMOVE / MERGE into customer360 | `customer_360_scoped_v2`; root can inspect an account before it has a business |
| Operations business picker | Real snapshot, bounded list | KEEP; shared by operations and team scope selection | `operational_snapshot_v1`; limit 80 explicitly disclosed |
| Orders and bookings | Raw entity status edits did not establish real workflow execution | KEEP read inspection; REMOVE generic lifecycle mutation buttons | Existing tenant order/booking workflows remain authoritative |
| Products / services | Existing audited operational RPC can persist activation | FIX; confirmation + reason + receipt + readback | `PRODUCT_SET_ACTIVE`, `SERVICE_SET_ACTIVE` |
| Branches / calendar sync | Valid persisted configuration actions mixed with provider-status edits | FIX; only branch activation and sync preference changes | `BRANCH_SET_STATUS`, `CALENDAR_SET_SYNC` |
| WhatsApp | Connection records and verification evidence exist; setting a status is not provider verification | MOVE into Operations; aggregate health in Overview/System | Existing connection rows, timestamps, provider status/errors; no fake connected action |
| Platform bridge | Called unsupported `platform_bridge` action | REMOVE | Replaced by explicit supported broker actions |
| Generic action bridge | Unsupported execute shape and unsafe generic action vocabulary | FIX; four allowlisted actions, real audit receipt and independent readback | `operational_action_v2`, `owner_audit` |
| Support cases | Bridge contract did not match case RPC; inconsistent status permissions | FIX; create/note/update, persisted note history, customer/business matching, reopen clears resolved timestamp | `support_action_v2`, cases, notes, existing staff audit |
| Incidents | Existing scoped incident infrastructure | KEEP / FIX API receipts; MOVE under Support with granular create/update permissions | Existing incident RPCs and event log |
| Feedback | Late layer depended on absent overview feedback data | FIX / MOVE under Support; scoped list before limit | `feedback_list_v1`; global feedback redacted from scoped customer360 |
| CEO dashboards / composer / mission tools | Several versions of the same queue; coarse permissions and global data mixed | MERGE in CEO; objective, criteria, due date, evidence and independent lifecycle writes | Existing commands and executive events/actions |
| CEO lifecycle | Readback and write-result validation incomplete | FIX; create, guidance, reprioritize, due date, cancel, resume | Existing authorized create/update RPCs; global scope + granular permission required |
| Owner decisions | Wrong fields and incomplete result verification in layers | FIX; actual question/context; approve/reject/modify with persisted resolution | Existing owner decision RPCs; ROOT_OWNER only |
| Platform copilot | Unsupported context route; another path over the same owner tools | REMOVE; retained CEO instruction workflow is canonical | No mock AI response |
| Tenant/team bridge | Different model from platform owner team | REMOVE | Platform staff model remains canonical |
| Platform team UI | Separate injected workspace with local presets and duplicated request flow | MERGE existing team module into System; role defaults come from backend | Staff list/governance RPCs, existing invitation delivery audit |
| Team business endpoint from PR #501 | Thin duplicate of operation snapshot | REMOVE; shared dashboard-data operations lookup | Same scoped snapshot |
| Invitations / OTP | Newer PR contains generation binding and atomic OTP completion | KEEP; preserve and merge these fixes; resend key remains server-bound | Broker v15 lineage, existing OTP mailer v9, atomic OTP RPC |
| Team access | Root protection exists; scope/readback checks incomplete | FIX; all five scopes, expiry, exact CUSTOM permissions, approval limit readback; no automatic MFA enablement | Existing ROOT_OWNER / OWNER_DELEGATE and governance SQL |
| Billing | Sandbox-only source; no demonstrated live MRR | MOVE into System; explicit sandbox status and unknown real revenue | Existing Stripe ledger/executive source; no new payment integration |
| Audit | Staff-only UI missed operational and owner-decision records | MERGE existing three audit sources with source IDs and actor/business scope | Staff audit, owner operations audit, customer admin audit |
| Infrastructure / settings | Scattered status cards and configuration-looking controls | MERGE into System; show real evidence and missing measurement states | Existing ops metrics/recovery checks; settings show current identity/access |

## Final navigation

| Primary | Contextual sections |
|---|---|
| Overview / نظرة عامة | Decision metrics, required attention, operational health |
| Customers / العملاء | Search, customer360, selected business context |
| Operations / العمليات | Orders, bookings, products, services, branches, WhatsApp, calendars |
| Support / الدعم | Cases, incidents, feedback |
| CEO | Missions, owner decisions |
| System / النظام | Health & integrations, billing, team, audit, settings |

Visibility follows granular capabilities. Global CEO/system/billing views are withheld from business-scoped delegates. Backend and SQL independently enforce authority. Routes, refreshes and dialogs share request cancellation, loading/error handling and result feedback. Uncertain write results are not automatically retried.

## Database and API changes

Eight existing functions are replaced in place by `20260907110000_owner_dashboard_consolidation.sql`. Signatures remain stable, every SECURITY DEFINER retains an explicit search path, and browser roles have no EXECUTE grant. No table, column or record is dropped. The rollback file restores the preceding definitions while preserving the P2 CEO capability guards; rollback also restores preceding behavior and should be used only for a demonstrated regression.

The existing pending `20260907013000_dabbir_owner_granular_capabilities_p2.sql` was tested and applied first: deployed Broker v15 already checked these capabilities, but the production catalog contained none of the CEO/incident codes. Production had only ROOT_OWNER and a CUSTOM delegate; P2 system-role reconciliation did not change either grant set. CUSTOM grants and root identity are preserved.

Both migrations applied successfully on 2026-09-07. Post-apply inspection confirmed all eight functions are server-only. Live root Overview returned 4 accounts, 8 live businesses, one recently verified WhatsApp connection, 0 open support cases, 0 critical incidents, and sandbox billing. These are timestamped observations, not constants embedded in the UI.

Broker v16 was deployed from the merged v15 source plus scoped CEO guards, safe operation allowlist, support close permission enforcement and outage handling. Its deployed SHA-256 is `fd6d49f15ae78aae95128210a7799b4129d821b0fc94ffa16709b39f1f3ba24f`. Custom session authentication and the existing verify_jwt=false configuration remain in place; no authentication bypass was introduced.

Advisors before deployment: 67 security INFO notices for RLS-enabled tables without policies, no warning/error notices; 9 unindexed foreign keys, 131 unused-index INFO notices and one connection-setting INFO notice. No RLS policy was added merely to silence a default-deny server table. No index was deleted based on low traffic/resettable usage statistics. Missing indexes are on governance/task metadata; no slow query evidence justified speculative index expansion during this repair. Existing unused tables/RPCs are not proven safe to drop just because the owner UI has no direct reference.

## Validation evidence

| Gate | Result / practical limit |
|---|---|
| Full application build | `npm run dabbir:build`: passed; syntax, production dependency audit and all 1411 tests passed |
| Owner regression suite | 176 tests after merge (including 12 PostgreSQL integration tests and 8 runtime broker denial/outage tests) |
| Type checking | `deno check supabase/functions/dabbir-owner-broker/index.ts`: passed |
| Lint | Targeted ESLint correctness rules on changed production JS; existing repository has no general ESLint configuration |
| PostgreSQL execution | PGlite 0.5.8 runs actual repaired SQL: scope filtering, expiry, all five scopes, support persistence + notes + audit, mismatch rejection, global CEO denial, audit source union, grants, rollback/reapply |
| P2 migration | Actual migration executed against a disposable PostgreSQL fixture; system-role grant reconciliation revokes affected sessions; CUSTOM grants and sessions preserved |
| API execution | Actual Node handlers against isolated transport: auth, malformed bodies, same-origin checks, upstream failures, audited receipts and independent readback for operations/support/CEO/decisions/incidents/team |
| Browser | Chrome on isolated fixture executes real Node handlers: customer context, product activation, support creation and customer-visible reply, CEO creation, owner decision and team access persistence verified |
| Root protection | Synthetic root shows no authority-edit/remove controls; RPC and regression tests retain root/self-grant/expiry guards |
| Visual evidence | `owner-dashboard-evidence/` contains synthetic screenshots, not production customer data |

`npm run dev` is explicitly an isolated QA harness on port 4173. It imports the real production handlers but replaces only their external broker transport with synthetic fixtures; it cannot contact production. It is not a production backend or an alternative authentication route. Production entrypoints never import `test/fixtures`.

Ten obsolete tests that asserted numbered UI files/DOM patch layers were retired. Their requirements moved to the existing authority, UX, mission and team tests plus handler and PostgreSQL tests. Gates were not weakened or skipped.

## Support hub follow-up from current main

The customer support hub merged into main while this repair was running. Its existing message table is now displayed by the same owner case workspace, with separate internal notes and customer-visible replies. `20260907131500_owner_support_consolidation.sql` updates three existing functions: the case list includes the thread, the legacy summary delegates to that same scoped list, and customer replies require `support.reply` plus business scope before writing. No second message table, API endpoint or UI page was created. Tests cover public-reply receipts/readback and denial of out-of-scope reads/writes without a persisted message. This follow-up migration and Broker v17 are deployed; fingerprint `62bd607e6d099669b8a18364e7f478472caca56e8c46a97f42083c9ef8dad9d3`.

Real production SQL verification in `test/owner-dashboard-db-rollback.sql` created a case, note and audit record, closed and reopened the case, asserted the persisted state, and rolled back. The post-rollback query confirmed no test cases remained. An unauthenticated live Broker request returned HTTP 401.

Browser geometry confirmed no horizontal overflow: Arabic RTL phone frame 390px (375px content width), English LTR tablet frame 820px (805px content width). Captures are in `owner-dashboard-evidence/`. The customer-visible reply browser flow also passed: the case moved to waiting, the saved response appeared in the reloaded conversation, and the form reported verified persistence. These are Chrome checks, not Safari device tests.

## Remaining verification and limitations

- Authenticated production browser verification still requires the owner's secure OTP sign-in. No code or session token is requested in chat, and no email/invitation has been sent by this test run.
- Chrome layouts at phone/tablet widths do not establish iPhone/iPad Safari behavior. Actual Safari remains an explicit verification gap.
- Live MRR/paying-customer revenue remains unavailable while the source is sandbox-only. Message/booking creation failure rates and infrastructure latency are not measured by the current source; the UI says so.
- MFA enrollment is unavailable. Existing required MFA stays enforced; invitation UI cannot silently enable an unusable login requirement.
- Bounded search/list APIs expose their limits. This consolidation does not claim full tenant workflow, outbound WhatsApp, payment, or external delivery verification from local synthetic tests.
- The first delivered commit `09c14b74cf353e890ca39ef469941d5faa337231` reached READY in Vercel deployment `dpl_DxdVhV6pDkTFAcqsXzrJ4u3fsSCi`; its build logs independently recorded 1393 passing tests. The protected dashboard returned the owner sign-in page for a guest. A subsequent merge preserves newer main `e04ff0d`; its local build passed all 1411 tests. CI and deployment of this subsequent commit still need to be checked separately; the older preview is not proof of the new deployment.
