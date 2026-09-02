# DABBIR Main Lineage Guard — Live Failure-Path Proof

Date: 2026-09-02

## Purpose

Record the first real end-to-end proof that DABBIR's compensating source-control governance rejects an ungoverned direct push to `main` and restores the last governed source tree.

## Evidence

- Governed baseline: `7d558364e1aa2364cd6331a72ec2509f99139b31` from merged PR #292.
- Ungoverned direct push: `edaf6604012e532dd58c74cd2ad2c1db776e41d1`.
- DABBIR Main Lineage Guard run `33618606655`: **FAILURE**.
- DABBIR CI for the same direct push `33618606559`: **SUCCESS**. This proves the lineage gate is independent from ordinary code/test quality gates.
- Release Guardian runs `33618612726` and `33618622636`: **SUCCESS**.
- Automatic rollback commit: `e01696dd51f315a47bfa910d0b3a54bee9e55678`.
- `7d558364...` → `e01696dd...` compare shows **zero changed files**, proving the rejected source change was fully removed from the resulting tree.

## Production alias follow-up

Vercel completed the ungoverned deployment before the GitHub rollback deployment could take over the production alias. This evidence-only governed PR intentionally creates a fresh valid `main` deployment from the restored source tree so the production alias can be re-established on governed lineage without changing application behavior.

## Remaining native limitations

- GitHub native Rulesets/branch protection cannot be configured with the current integration's Administration scope.
- The Main Lineage Guard + Release Guardian is therefore a compensating control, not a claim of native branch protection.
