# Conversational Failure Benchmark governance

This change adds one synthetic contract fixture only. It does not add the 30
production cases, a scoring runner, source adapter, database changes, or evidence
of conversational quality. The synthetic UUID is not a production row claim.

Run `node scripts/dabbir-conversation-benchmark-manifest.mjs` to verify the lock,
and `node --test test/dabbir-conversation-benchmark-manifest.test.mjs` for its tests.
The gate uses Node built-ins, local files, and read-only Git object operations.
It requires no network, database connection, provider, token, or secret.

## Oracle contract

`oracle-v1` hashes only `expected`, `rubric`, and `hard_fail_rules` using recursive
object-key sorting, preserved array order, compact JSON, UTF-8 and SHA256.
Non-finite and unsupported values are rejected. Strings are never normalized.
Put every normative human statement in `expected`, including behavior summaries.
Notes, baseline, results, model/provider, timestamps, and costs are not an oracle.
The V1 failure-class allowlist is local to this benchmark; it changes no database
constraint. Case files are matched by their `case_id`, with a strict bijection to
manifest entries; filenames are not production identifiers.

The manifest schema allows only contract metadata and case ID, synthetic/eval case
UUID, failure class, and oracle hash. Do not commit customer text, conversation
IDs, customer identifiers, source messages, RAG content, or secrets. Actual source
mapping belongs in the later adapter, outside this manifest. Free-text normative
fields still require privacy review; schema validation cannot recognize every
possible identifying statement.

## Freeze and new versions

After this PR is approved, V1's case roster, eval mapping, failure classes, freeze
metadata, and oracle hashes are immutable. Do not rehash V1 to fix a wrong oracle.
Create a new version such as `v1.1/`, retaining V1, and record:

```json
{
  "supersedes": "v1",
  "change_reason": "Describe why the expected judgment itself was wrong."
}
```

All versions are verified, including historical ones. A changed case plus a
recomputed hash, coordinated case removal/replacement, or deleted frozen version
fails comparison against an independent Git reference. Whitespace and object-key
ordering can change without altering the oracle; array reordering cannot.

The checker reads the PR base SHA or push `before` SHA from the local GitHub event
file. Manual CI runs compare to `HEAD^`; local runs compare the working tree to
`HEAD`. CI must have the complete history (`fetch-depth: 0` is already configured).
Missing CI identity/history fails closed. The initial freeze may have no benchmark
in its valid base commit; reviewers approve that first oracle. A local check after
a rewrite has already been committed establishes self-consistency only; PR/push CI
uses the earlier reference to detect that rewrite.

The one synthetic V1 case also freezes the V1 roster. Therefore the later 30 real
cases must use a new approved version, with `supersedes` and `change_reason`, rather
than silently appending to V1. This preserves the meaning of a reported version.

The gate runs inside the existing required `test` job, after syntax validation
and before full tests. No new secret or production access is attached to this
step. Other pre-existing CI jobs have their own access; this PR does not expand it.
The checker and workflow themselves remain subject to the repository's existing
CODEOWNERS/review policy. An in-repository checker cannot prevent an authorized
maintainer from changing or removing its own enforcement; no Git hash can replace
protected reviews. This change does not alter branch protection or deploy code.

## Results are separate

Future run results can be stored as CI artifacts or under
`artifacts/conversation-failure-<version>/`. Each result should identify benchmark
version, manifest hash, runner SHA, model/provider, case scores, hard failures,
suite score, and cost. Changing those measurements never updates a frozen oracle.
