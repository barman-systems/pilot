# DABBIR navigation audit — 5 September 2026

Status: NOT READY for complete navigation acceptance. This is a partial source audit with implemented fixes, not a completed authenticated customer audit.
Baseline: origin/main 0072588. Production opened the login screen; /try was an explicitly labelled booking simulation. No authenticated owner, admin, manager or employee browser session was available. No internal iPhone/desktop interaction or production mutation is claimed.

## Customer mental model and navigation map

The customer needs current work, conversations requiring a response, scheduled appointments or store orders, customer records, and decisions. Five primary destinations are a reasonable base; adding every feature to the bottom bar is unwarranted.

| Group | Proposed destinations | Implementation status |
|---|---|---|
| MAIN | Today; Customer conversations; Appointments (service businesses) / Orders & inventory (stores); Customers; More | Existing five destinations retained; store currently labelled Operations |
| Today shortcuts | Decisions and remaining follow-ups; action results; urgent conversations | Metrics made actionable; urgent conversation opens its supplied record ID; other result links remain incomplete |
| SECONDARY / More | Tasks & decisions; Reports; Services (service businesses); Team; Notifications | Existing destinations retained; clearer names/grouping proposed |
| SETTINGS | Business details; Integrations; Follow-up rules; Team permissions; Account/billing; Help | Consolidation proposed, not moved in this patch |

## Findings and disposition

| Element | Current place | Problem | Intended place | Action |
|---|---|---|---|---|
| Daily metrics | Today | Base cards lack navigation | Relevant list | Added mouse and keyboard navigation; store follow-up metric routes to Tasks |
| Urgent conversation | Owner action center | Feed supplies entity_id but UI only opens generic screen | Exact conversation | Loads supplied conversation within current business |
| Notification | Notifications | Rendered items have no navigation | Relevant task/calendar/integration | Added destinations, including repeated live-calendar renders; grouped notices still open lists |
| Back | Main screen router | Screen switches do not create history entries | Previous screen | Added business-scoped history and page scroll restoration |
| Active tab | Primary bars | Secondary screens leave all primary items inactive | More as parent | Added active and aria-current state |
| Menu | Header | Expanded state not exposed | Same menu | Added accessible name, controls and expanded state |
| Tasks | More | Daily work competes with administrative features | Today shortcut, More as full list | Today needs-attention metric now links to Tasks |
| Automations | More | Base renderer copies follow-ups from Tasks | Settings / follow-up rules | Proposed; feature-layer behavior needs authenticated validation |
| Reports | More / Analytics | Technical label | Reports in More | Proposed |
| Services | More for service businesses | Context-specific, appropriate secondary destination | More | Retained |
| Orders, inventory | Store Operations | Broad label, multiple concerns | Clearly named store activity destination | Proposed; do not create separate empty main tabs |
| Team | Sidebar footer and More | Duplicate access is useful on mobile; role exposure needs verification | More with authorized controls | Retained pending role checks |
| Integrations | More | Administrative card competes with daily work | Settings, with failure shortcut from Today | Notification shortcut implemented; relocation proposed |
| AI results | Owner surfaces | Many destinations still use a generic target | Exact result/record | Only supplied conversation target fixed in this patch |
| Customer relationships | Customer and appointment screens | Base rows lack linked record journey; specialized modes differ | Record context | Open; no invented universal profile route |

## Fifteen customer journeys

Counts below are source-derived transitions from the relevant starting screen, not observed production click measurements. Authentication is excluded.

| Journey | Before | After this patch / remaining verification |
|---|---|---|
| 1. Today's work | Today, one primary selection | Same; metrics now lead to lists |
| 2. Open appointment | Appointments then calendar event | Existing two-step path; live modal and Back unverified |
| 3. Find customer | Customers then search/list | Existing; record/search state needs verification |
| 4. Remaining tasks | More → Tasks | Today metric → Tasks in one click; More path retained |
| 5. Review order | Store activity → order row | Unchanged; no exact order deep link added |
| 6. Accept approval | Owner execution surface | Unchanged; no real approval submitted |
| 7. Stock problem | Owner action → Operations → find product | Unchanged; exact product destination remains open |
| 8. What DABBIR did | Owner result/activity surface | Unchanged; complete result trail unverified |
| 9. Employee | More → Team or sidebar Team | Unchanged; role-specific access unverified |
| 10. Edit service | More → Services → Edit | Three-step source path retained |
| 11. Report | More → Analytics | Two-step path retained; Reports name proposed |
| 12. Business settings | More → Settings | Two-step path retained |
| 13. Integration | More → Integrations | Two-step retained; channel problem notice now one click |
| 14. Return to previous screen | No app screen history | Browser Back/Forward restores screen and page scroll; nested modal/search/filter state not covered |
| 15. Alert → related record | Urgent conversation → list → search/select | Urgent conversation → supplied conversation ID; other entity types remain open |

## Scope and risks

- No backend, schema, business direction or chatbot changes.
- History lives in browser history and a page-local scroll map. It does not persist form inputs, nested scroller positions, filters rebuilt by feature renderers, or selected records across a full reload.
- History entries from a different business are ignored. Authorization remains enforced by existing APIs; this is not a permission redesign.
- MAIN layout and secondary/settings relocations are proposals, not represented as deployed changes.
- Existing generated public bundles are stale relative to current source. The deployment build regenerates them; this patch does not commit unrelated generated drift.
- Required before acceptance: authenticated 15-journey run, iPhone Safari and desktop QA, Owner/Admin/Manager/Employee plus actual additional roles, appointment/customer/order/product/approval deep links, filter restoration and cross-page Team return.

## Score

| Category | Maximum | Before | After |
|---|---:|---|---|
| Tab Structure | 20 | Not verified | Not verified |
| Placement | 20 | Not verified | Not verified |
| Navigation Clarity | 20 | Not verified | Not verified |
| Click Efficiency | 15 | Not verified | Not verified |
| Contextual Navigation | 10 | Not verified | Not verified |
| Mobile UX | 10 | Not verified | Not verified |
| Back/State | 5 | Not verified | Unit-tested screen history only |

No defensible whole-product score or 90/100 claim is available from a login-gated browser and partial source evidence.

## Validation outcome

- `npm test`: 1,255 passed, 0 failed, 0 skipped after installing lockfile dependencies.
- `npm run dabbir:build`: passed syntax, production dependency audit and all 1,255 tests.
- Four executable screen-history tests cover Back/Forward, repeated/invalid destinations, cross-business rejection and page scroll restoration.
- Browser: production login and public /try inspected only. Authenticated internal journeys, mobile touch and role behavior remain untested.
- Changes are submitted for review; no production deployment or merged status is claimed.
