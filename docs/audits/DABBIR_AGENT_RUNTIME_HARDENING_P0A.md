# DABBIR — Agent Runtime Hardening P0-A

Status: IN_PROGRESS
Observed at: 2026-09-14T13:53:32Z

This evidence file is intentionally maintained before any runtime mutation. It contains only non-secret metadata, exact-SHA findings, test evidence, and blockers for the Secret/OIDC/Credential Audit. No credential values may be recorded here.

## Freeze current truth

| item | observed truth |
|---|---|
| `barman-systems/pilot` | `main` = `00ffb68ab0dee7b184c97aa8c38c410720c23ab6` |
| `barman-systems/barman-control-plane` | `main` = `26c64fc4c90375912bfef7186e009594d98e73fd` |
| pilot AI SDK | `ai@7.0.62`, `@ai-sdk/openai-compatible@3.0.44`, `zod@4.5.4` |
| pilot autonomous operator | `ToolLoopAgent`; `MAX_STEPS=6`; 14 read tools; 7 write tools |
| default operator model | `DABBIR_AI_GATEWAY_MODEL` or `openai/gpt-5.4` |
| default fallback chain | `anthropic/claude-sonnet-4.6`, `google/gemini-3-flash`, `openai/gpt-5.4-nano` |
| WorkflowAgent | not shipped; dependency-contract test explicitly requires it to remain absent until a stable dependency graph passes the production audit |
| BARMAN persistent tool-agent | workflow exists but executor remains intentionally disabled with `if: ${{ false }}` and read-only GitHub permissions |
| browser worker | Node 24; `puppeteer-core@25.8.0`; `@sparticuz/chromium@149.0.0`; `@vercel/oidc@3.8.5`; local worker package still carries `ai@6.0.56` |
| AI Council source | current control-plane main now contains canonical `apps/ai-council-p0`; release policy remains Preview-only / discussion-only and explicitly grants no execution authority |
| Vercel Agent Runs | no project with Agent Runs data was returned by the live Vercel Agent Runs project listing during this audit; end-to-end Agent Runs visibility is therefore not yet proven |

## Correction: control-plane main protection

A previous reading of the classic branch-protection endpoint showed `required_status_checks.enforcement_level=off`. That endpoint was incomplete for this repository because protection is enforced by an active GitHub repository ruleset.

Current repository ruleset evidence:

- Ruleset: `BARMAN Main Protection` (`id=21149511`).
- Enforcement: `active`.
- Target: default branch.
- Required pull request rule present.
- Required status checks are strict and explicitly require:
  - `BM Control Plane CI`
  - `Executive Integrity`
- `bypass_actors` is empty.
- `current_user_can_bypass` is `never`.
- Both required workflow names exist on current control-plane exact SHA `26c64fc4c90375912bfef7186e009594d98e73fd` and trigger on pull requests / main / merge queue.

Conclusion for this sub-check:

`CONTROL_PLANE_REQUIRED_CHECKS_ENFORCED = true`

The earlier interpretation that control-plane `main` lacked enforced required checks is superseded by the ruleset evidence above. P0-A must not use the classic branch-protection endpoint alone as authoritative protection evidence.

## Secret / credential audit observations so far

Only names / metadata are recorded here, never values.

Observed GitHub Actions secret-reference patterns include long-lived credentials or credential handles such as Supabase management/access tokens, Vercel token, Expo token, and an AWS deployment role ARN. AWS deployment uses GitHub OIDC for role assumption. This is an inventory observation only; it is not yet a PASS assertion for credential lifecycle or rotation.

The pilot repository already carries a dedicated security gate that scans tracked source for known committed-secret patterns and blocks selected client-surface secret names. That gate is useful evidence but is not by itself a complete historical secret scan equivalent to gitleaks/history inspection.

## P0-A remaining work before PASS

- Inventory Vercel Production and Preview environment-variable metadata without decrypting values.
- Classify each variable by name/metadata only and verify sensitive/short-lived/OIDC-derived/documented-exception posture where applicable.
- Complete repository + history secret scan using a strong scanner (gitleaks or equivalent) without exposing matched credential values.
- Finish OIDC trust review across issuer, audience, repository, ref, workflow_ref, event_name, expiry, nbf and environment binding.
- Identify obsolete / long-lived credentials and produce safe rotation/remediation plans where required.
- Re-check both repository exact SHAs immediately before final P0-A verdict; if either main moved, refresh the frozen truth instead of relying on this snapshot.

No P0-A PASS is claimed yet.
