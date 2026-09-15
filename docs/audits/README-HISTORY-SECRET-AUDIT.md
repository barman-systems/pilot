# History Secret Audit Note

The canonical implementation lives in `.github/scripts/dabbir-git-history-secret-audit.mjs` and is executed by `.github/workflows/dabbir-history-secret-audit.yml`.

The audit report is intentionally redacted by design. Findings contain only detector ID, commit SHA, and repository path. Secret values must never be emitted to Actions logs or artifacts.

Use the workflow only as historical exposure evidence. Current runtime-secret validity remains an external live-system question and any confirmed historical exposure requires credential rotation or revocation at the provider.
