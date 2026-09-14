# DABBIR UI Authority Consolidation V1

## Frozen starting point

- Repository: `barman-systems/pilot`.
- Verified main / base: `0bf3bbe50e76f0ea52c5c4d5a970950463c2a7fd` (GitHub branch API).
- Timestamp: `2026-09-14T11:37:38Z`.
- Branch: `refactor/ui-authority-consolidation-v1`.
- Initial working tree: clean.
- Reference-only audit: `b476e2cd0d8177d4977e3fbc0577963c36a205fc`.
- Local tree and signed commit reconstructed from verified GitHub objects because direct Git transport is unavailable; every blob/tree and the signed commit match their GitHub SHA. This is an exact shallow checkout, not a report-derived snapshot.

## Before: actual production delivery and authority

`vercel.json` routes `/` through `api/app-safari-recovery.js` → `api/app-recovery.js` → `api/app.js` → `index.html`. The response transformers add CSS and runtime scripts. Safari recovery inlines owner-first before auth boot. Critical scripts load next; the deferred bundle loads when the workspace opens. Feature loaders add activity-specific modules. A head observer moves the owner-first style back to the end of head after subsequent injections. Therefore source order in index alone does not determine the result.

`public/dabbir-ui-critical.js` and `public/dabbir-ui-deferred.js` are generated deliveries, not separately editable sources. `config/dabbir-ui-bundles.json` + `scripts/build-dabbir-ui-bundles.mjs` determine order; imported/nested scripts explain why injection count exceeds manifest entries.

| Component | Base owner | Overrides before change | Final authority before change |
|---|---|---|---|
| Navigation | index.html | owner-first, contextual-navigation, navigation-event-bridge, Safari viewport anchor | CSS specificity + head reorder; contextual module owns route behavior |
| Dashboard / cards | index.html | owner-first, owner-action-center, customer-activation, verified-metrics, business/activity modules | owner-first important declarations + feature-specific selectors |
| Buttons / forms | index.html | owner-first, shell hardening, auth/recovery, feature CSS | cascade and specificity; mobile target hardening remains contractual |
| Conversations | index.html | app.js performance styles, chat-human-ui, owner-first, shell hardening | competing selectors + head reorder |
| AI / staff / customer bubbles | index.html | chat-human-ui identity rules; owner-first shared AI/human bubble rule and AI logo decoration | labels and role classes already distinct; final computed style must be checked, not inferred from one source |
| Booking | booking.html | api/car-wash-booking.js hardening; gcc-public-booking-ui copy/time adaptation | served /book response, not raw HTML alone |
| Team | team.html | api/team-page.js delivery | team CSS and local bilingual dictionary |
| Native shell | mobile/App.tsx | SubscriptionCard local styles | separate native StyleSheets, fixed right text alignment |
| Auth / onboarding | index.html | owner-first, auth-session-stability, auth/recovery, Safari recovery, customer-activation | verified gate behavior + specific CSS; auth state is outside this refactor |
| Modals / toasts | index.html | owner-first, feature-specific CSS | owner-first general rules + scoped feature rules |
| Typography / spacing | index + native + team + booking | owner-first and mobile hardening | separate literals and overrides |
| Status colors | root variables + inline values | owner-first remaps --accent/--green/etc; feature literals | root override + feature-specific declarations |

The current served web authority uses Executive Calm blue (`--ds-brand`), while raw index/booking retain lime defaults. No rebranding decision is inferred from the raw index.

## I18n inventory before change

- `index.html` dictionaries and module dictionaries are live runtime copy sources.
- `booking.html` and `team.html` own live standalone page copy; GCC booking module adjusts country/time/currency strings at runtime.
- Native App copy pairs and SubscriptionCard text are bundled into the native application; SubscriptionCard currently has Arabic-only text.
- `locales/ar.json` / `locales/en.json` are parity-checked catalogs but no production importer references them. They are not silently promoted or deleted.
- `translation-preview.html` is explicitly a synthetic preview with original-text preservation and fixture translations. It is not the production dictionary.
- Retired visual modules are explicitly named in `config/dabbir-architecture-ownership.json`; retained files do not prove runtime use. No module is deleted on its filename alone.

## Booking contract verified before changes

Read-only production catalog checks confirm `location_lat` and `location_lng` are NOT NULL numeric columns. The live `dabbir_public_car_wash_book` RPC rejects null/out-of-range coordinates before inserting. `location_label` is supplementary; description-only booking is unsupported. The API currently applies `Number()` before validation, which can turn null/empty input into zero.

V1 will preserve this contract: GPS or manually entered real map coordinates, clear bilingual instructions, no geocoding guess, no invented coordinates, no DDL. Descriptions alone will remain insufficient. Tighten null/empty coordinate parsing at the HTTP boundary.

## Planned mutation scope before implementation

Design token source and deterministic web/native adapters; existing index/booking/team/owner/chat style definitions; Safari design reorder implementation only as supported by visual evidence; native language-dependent styles and subscription copy; public booking location inputs and API validation; generated UI bundles; focused regression tests/guard and affected existing source-location tests; this evidence report and machine inventory. No unrelated business logic, provider, auth permission, database migration, or new UI framework.

The actual changed-file list and `git diff --stat` will be attached after implementation. Remaining feature styles will receive an exact-value debt ceiling rather than a risky repository-wide rewrite.

## Implemented V1

The branch was refreshed first onto `2ac89aea55f90915646e0a98b9b85a6bd823cd32`, then onto `1dc947817f3d23fd86baa776e967a23164846b74` after main advanced by three unrelated semantic-core commits. The original frozen UI baseline above remains the comparison reference. No semantic-core files are changed by this PR.

| Authority | Before | After |
|---|---|---|
| Shared root palette definitions | index, booking, team, owner-first | `design/tokens.json` → deterministic CSS adapter |
| Native design values | App + SubscriptionCard literals | same token source → deterministic native adapter |
| Message CSS | index + chat-human + owner-first + app performance/hardening | `public/dabbir-chat.css` |
| Sender label decoration | chat-human + owner-first | chat-human lifecycle only; existing AI mark and all three labels retained |
| Native copy/layout language | language state + fixed-right styles + Arabic-only subscription | same App language context updates StyleSheets, writing direction, and subscription copy |
| Booking location | GPS required by UI; API could coerce empty to zero | GPS or actual manually supplied map coordinates; empty/null rejected at HTTP boundary |

Canonical CSS is linked statically and replaces the removed declarations. There is no new runtime style creation, observer, wrapper, UI framework, or library. The human-chat injection is removed. The conversation performance style block is removed from app.js and incorporated into the same message stylesheet. Existing API behavior, tenant/auth boundaries, and database schema are preserved.

The three sender surface/border pairs are the explicit existing chat-human identity values, now expressed as semantic role tokens. The redundant owner-first shared AI/human bubble override is removed. The AI label keeps the existing logo and `DABBIR` name; staff/customer retain localized labels. One lifecycle renderer owns all labels, including after language changes.

## Measured reduction

`UI_AUTHORITY_METRICS.json` records the lexical inventory, excluding generated adapters/bundles. Runtime style creation sites: **48 → 47**. HTML style blocks: **19 → 18**. Direct HEX/RGB/HSL occurrences: **1645 → 1426**. These are source metrics, not production performance or complete UI coverage claims.

The remaining message-like selectors in the lexical inventory belong to explicitly retired mobile/refinement modules and the separate TikTok page, not the current shell. They remain in place with an exact debt ceiling. The live shell message owners are consolidated into one stylesheet.

## Remaining debt and intentional limits

- General cards, navigation, auth and feature layout still have legacy scoped overrides. Owner-first head reordering remains for those surfaces; removing it safely needs a wider component migration. Message CSS and central token definitions no longer depend on that reorder.
- Feature-only colors/spacing remain budgeted, not rewritten. The guard uses a separate count for every source file/value/site; removing one value cannot fund a different value or a new style injector. Generated tokens and generated JS bundles must match their sources byte-for-byte.
- The old locale catalogs contain synthetic/preview copy and have no production import. They are retained. The two competing AI label definitions are reduced to one; native subscription copy now has both languages. Existing standalone/module dictionaries retain their current responsibilities.
- Description-only booking remains unsupported by the verified live schema/RPC. Manual fallback requires the actual latitude/longitude copied from a map. GPS denial or absence opens clear bilingual instructions and a coordinate field. No coordinates are fabricated and no migration is introduced.

## Evidence and validation status

- Initial baseline: **3111/3111** tests passed.
- Final local full suite on the refreshed branch: **3126/3126**, no failures or skips (24.24 seconds).
- Native style factories are executed for Arabic → English → Arabic across auth/onboarding/dashboard/operations/assistant/account. Centered controls remain centered. All previous native color/size/touch values match the frozen source after excluding the intentional direction changes.
- Booking tests execute the shipped page functions and HTTP handler: GPS success, denial, unsupported, manual valid/invalid/missing values, exact outbound coordinates, late-GPS protection, and bilingual key/state parity.
- Existing readability/touch assertions now read the canonical CSS with generated tokens resolved. Assertions on actual sizes are retained. The iPad source contract only gained whitespace tolerance after CSS extraction. Safari version assertions were updated for the deliberate cache invalidation.
- Production baseline was inspected read-only in the browser: `--accent/#4961e8`, `--bg/#07111f`, `--panel/#0d1a2a`, `--line/#94a3b826`, `--muted/#9cabbf`; Arabic heading font is SF Arabic/Noto Sans Arabic/Segoe UI/Tahoma/Arial. Values match the extracted Executive Calm source. This does **not** prove the new code is in production.
- Local browser URL access was blocked by the available cloud browser. A dedicated CI check runs Chromium and WebKit against real served before/after shells, compares web palette/cards, checks sender identities after all runtime modules and language changes, and completes synthetic booking flows. Results remain pending until that exact-head run completes.
- Native signed/device behavior and deployed changed-code verification are not claimed from static tests. Existing Mobile CI and iOS Maestro gates must complete before merge; no gate is weakened.

The PR body carries the final tested head, full changed-file list, `git diff --stat`, CI links, and any remaining blockers. Merge is conditional on all required and new visual checks passing on the same head.
