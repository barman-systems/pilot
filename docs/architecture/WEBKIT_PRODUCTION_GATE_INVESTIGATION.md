# WebKit Today Production gate investigation

Status: **BLOCKED — original persistent failure not yet reproduced; no application fix claimed.**

## Live baseline

- Production/main: `a3cfe51bffd487e708bf1a1bce3a8a61229f8bbd`.
- Deployment: `dpl_BKFfLDrH9j4NwV6zfqT955t8BP7j`.
- Readback reconfirmed on 2026-09-10 at 10:26 UTC.
- PRs #697–#699 are already merged. #701 and #702 remain held.
- This change contains only test, CI and diagnostic evidence. No application,
  Brain, provider, SQL, authorization, tenant, signature or execution code changes.

## Original failure evidence

[Run 34458663288, attempt 2, job 102817560283](https://github.com/barman-systems/pilot/actions/runs/34458663288/attempts/2)
failed in the English 768×1024 WebKit visual matrix at
`#side [data-screen="dashboard"]:visible`.

Artifact `10145615731`, SHA256:
`ee0b5b602a5d27cbf1f951ddc3e2bc6e73a3cd1c9b40e927b1564a250cb54ce7`.

The complete artifact error, unlike the truncated job step summary, proves:

1. The Today button resolved successfully.
2. Initially it was moving.
3. It then became visible, enabled and stable.
4. Playwright repeatedly scrolled it into view but still found it outside the viewport.
5. The 10,000 ms native click expired **before dispatching a click**.

Therefore this particular failure is not the previously documented failure to
acknowledge an already-dispatched WebKit input event. No timeout increase,
forced click or DOM-click replacement is justified by this evidence.

The artifact lacks failed-state menu class, target geometry and visual viewport
coordinates. It cannot establish whether the sidebar was closed, positioned
incorrectly, scrolled incorrectly, or observed incorrectly by the browser driver.
Ordinary transient movement during an RTL/LTR transition is not proof of the cause.

Attempt 1's provider-availability failure remains separate. Neither attempt is
a complete Production PASS, and their results must not be combined.

## Reproduction scope and results

The isolated browser fixture serves the actual root handler and freshly built
canonical critical/deferred UI bundles. All workspace data is synthetic;
external traffic and non-GET requests are blocked. It does not certify live
authentication, PostgreSQL, providers, tenant isolation or Meta delivery.

The deployed root and locally generated root match after trailing-newline
normalization: SHA256 `2296f77d53a18cf0619092df48c4f941309446dee437b63d5d6952d5c4642f72`.
The deployed and locally generated deferred bundle similarly match:
`8ad4a2af5b1452431da8709d9e1469d6567078f0d3bb106d077d12daf75a775e`.

Both comparisons were read-only. The generated tracked bundle was restored after
comparison and is not part of this change.

Playwright is pinned to **1.62.1**, as in the Production journey. The WebKit context
uses mobile/touch, `ar-AE`, `Asia/Dubai`, and the original viewport sequence.

The final fixture executes the existing Production visual matrix source verbatim,
including appointment capability exclusions, text doubling, modal interactions
and settings scrolling. It adds no protocol diagnostic reads between its clicks.
An in-page bounded event history records only navigation state, without forcing
layout during event dispatch.

[Run 34466293721, job 102835560725](https://github.com/barman-systems/pilot/actions/runs/34466293721/job/102835560725)
at commit `56342c14ec2ebbdbf516bacf69904d6f17a4f130`:

- 100 matrix entries: applicable entries PASS; explicit store appointment exclusions retained.
- 11 additional native language/menu/Today pointer sequences, at input offsets
  0, 8, 16, 24, 32, 48, 64, 96, 128, 176 and 208 ms: PASS.
- Customer modal included with synthetic identity.
- The original persistent offscreen timeout was **not reproduced**.

Earlier progressively closer fixtures also passed; these are investigation
evidence, not attempts that may be accumulated into Production acceptance.

## Failure-only Production diagnostic

`captureSidebarFailure` runs only after the existing visual gate catches an error.
It records fixed control geometry, sidebar open state, Today active state,
viewport offsets, scroll position, computed positioning and pointer hit result.
It reads no customer/workspace data, cookies, text or HTML, and dispatches no input.

The read is bounded to 1,500 ms independently of the unchanged 10,000 ms click.
A closed or stalled page produces a diagnostic status; the **original error is
always rethrown**, and the existing `ACTION_FAILED`/interrupted result is retained.
The metadata is added to the existing artifact, not to the public UI.

Tests cover offscreen geometry/privacy, a rejected or stalled diagnostic read,
the original failure being retained, and existing visual-gate semantics.

## Remaining gates

1. Reproduce against the unchanged live application with failure-state evidence.
2. Classify the proven cause, then implement only its fix.
3. Establish a regression that fails before and passes after that fix. The current
   fixture is characterization coverage; it does not yet prove such a fix.
4. One complete exact-SHA Production acceptance run must pass Arabic, English
   iPhone, iPad/WebKit and tenant/WhatsApp isolation in the same stable release run.
5. Only then resume #701; Production-verify it before resuming #702.

No legacy path, duplicate writer or canonical authority is removed by this
diagnostic slice. Real-phone Meta proof remains separate and unclaimed.
