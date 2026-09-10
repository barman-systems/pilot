# Deleted-business provider report reconciliation

The real worker validation used an isolated QA business and the real configured
Gateway model. Guarded cleanup correctly deleted that business. The provider's
current-day billing report still contained its user UUID. The cron attempted to
write that row through the existing tenant-bound reconciliation RPC, which
correctly rejected the absent business. A single rejected report row stopped
the entire reconciliation cycle.

Production `b9c9b0ed` logged `AI_BILLING_LEDGER_HTTP_400` at 05:30:20 and 05:35:20
UTC on 2026-09-10. The same error was absent from the earlier verified
`855813a` window (04:14–04:28 UTC). A rollback-only actual SQL reproduction with
the deleted QA UUID confirmed `AI_BILLING_RECONCILIATION_ARGUMENT_INVALID`.

The cron now resolves report UUIDs against the trusted database in bounded
batches before any ledger write. Existing businesses retain the same model/day
idempotency key, actual reported amounts and guarded RPC. Unattributable spend
is explicitly counted as `unattributed_businesses` and
`unattributed_microusd`; the cycle reports `PARTIAL_UNATTRIBUTED` when present.
It does not recreate deleted businesses, transfer their spend to another
customer, or count that spend as successfully reconciled. The provider billing
report remains authoritative for that unassigned amount.

An unavailable or malformed tenant lookup still fails closed. An existing
business's ledger error or provider-report error still fails; no exception is
caught and ignored. Existing SQL authorization/validation remains unchanged.
No migration or dependency was added.

Seven executable transport regressions cover deleted/live mixed rows, fully
attributable totals, lookup outage, invalid/foreign identity, actual ledger
rejection, model-report failure and explicit unassigned spend. Three prior
billing source-contract checks also pass. Full suite and production cron result
are recorded after execution; no success is presumed by this document.

This fix was required by an observed side effect of real validation. It changes
the cost-report cron, not conversational interpretation or business tools.
