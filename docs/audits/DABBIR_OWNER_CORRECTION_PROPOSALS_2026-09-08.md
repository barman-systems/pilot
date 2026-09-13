# Owner correction proposals — 2026-09-08

## Problem and behavior

Owner-approved catalog aliases already existed, but owners had to enter the alias
and select a service manually. An owner correction could not enter that lifecycle.
The new optional form accepts one explicit mapping, such as `VIP means Gold Wash`
or `إذا قال العميل VIP فنحن نقصد الباقة الذهبية`.

The API verifies the active owner, parses a bounded mapping, reads only active
service IDs/names under that owner's JWT and business filter, and requires one
exact normalized catalog match. It invokes the existing `dabbir_knowledge_propose_v2`
RPC, which independently rechecks authorization, target and any supplied source
conversation/correction references. The result remains `PROPOSED`. Approval,
rejection, revocation and rollback remain separate explicit owner actions.

No raw correction text, prompt, model call, new table, new RPC or migration is
introduced. The stored source is the owner's structured alias/target correction,
creator, timestamp and proposal audit, plus verified source IDs when supplied.
The owner form does not invent a source conversation or customer message.

## Safety and limits

- Only supported positive, single-mapping Arabic/English grammar is accepted.
  This is a convenience parser, not unrestricted natural-language policy editing.
- Negation, multiple mappings, control characters and unsupported punctuation
  fail closed. Ambiguous or missing catalog matches request explicit selection.
- A 201-row query detects catalogs exceeding the 200-row resolution budget;
  a truncated prefix cannot establish name uniqueness.
- Caller target IDs, aliases and entity types cannot replace the grounded result.
  Only service aliases are supported by this new action.
- No text is logged or sent to an LLM. No business knowledge activates on save.
- Drafts survive same-business refreshes and are discarded on scope/role change.
  Old controls and concurrent duplicate submits retain the existing scope/lock guards.
- This change does not establish real WhatsApp E2E or general GCC accuracy.

## Verification

- Shared API behavior against current `main` before the change fails (400 instead
  of 200); the same grounded-proposal test passes with the change.
- Parser/API/UI suite: 70/70, including 47 added tests.
- Full local suite after integrating main `34a2a9dba26d0f818710ed4f00061775ab3c9605`:
  1964/1964, zero skips/failures.
- CI browser matrix retains manual entry and adds correction entry in both
  Chromium/WebKit and Arabic/English, including refresh and top-layer modal checks.
- The production journey now submits a real owner correction in a disposable QA
  tenant and reads back inactive proposal, approval, revoke, rollback and audit.
  Defining that test does not itself prove production; results belong in PR release evidence.

No branch protections or required checks are changed.
