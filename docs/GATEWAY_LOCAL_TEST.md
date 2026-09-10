# Gateway authentication outside Vercel

The Gateway accepts `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` independently of
`VERCEL_ENV`. On Vercel, runtime Project OIDC remains available. Credential
presence selects a usable route; only the provider can validate credentials.
Normal direct-provider priority and existing model defaults/fallbacks remain.

Set `DABBIR_AI_GATEWAY_TEST=1` to select Gateway explicitly, bypassing direct
providers for a controlled test. This is a routing override, not authentication.
Do not set a fake `VERCEL_ENV`. Do not enable the test override on Production.

In the repository root on the machine running the test, create the ignored,
private `.env.gateway-test` file (restrict permissions to its owner):

```dotenv
DABBIR_AI_GATEWAY_TEST=1
AI_GATEWAY_API_KEY=<raw Vercel AI Gateway key>
```

Replace the placeholder with the raw key value, with no `Bearer` prefix.
For an existing-model comparison, also supply `DABBIR_AI_GATEWAY_MODEL` with
the previously verified model ID. Omitting it retains the code's existing
default; this does not establish that it matches a prior deployment override.
An already-valid Vercel OIDC token may replace the manual key using
`VERCEL_OIDC_TOKEN`. The manual key takes priority if both are supplied.

Run with the repository's Node 24 runtime:

```sh
node --env-file=.env.gateway-test scripts/verify-gateway-auth.mjs
```

The probe makes a live text request and reports measured elapsed time, the
returned model and authentication mode, without printing any secret or text.
It is not the missing `verify-brain-live-provider.mjs` and does not prove Brain
quality or conversation cost. Normal model fallback remains bounded.
Putting a secret only in the Vercel project does not inject it into an external
test process. CI must explicitly pass its stored secret to that process's env.

## Diagnostic contract

| Code | Meaning |
| --- | --- |
| `GATEWAY_TEST_NOT_ENABLED` | The standalone probe was not explicitly enabled; no HTTP request. |
| `GATEWAY_NOT_SELECTED` | No direct provider available, no Gateway credential/runtime OIDC source, and no explicit test selection; no HTTP request. |
| `GATEWAY_AUTH_MISSING` | Gateway selected but no nonempty credential obtained; no HTTP request. |
| `GATEWAY_AUTH_INVALID` | Gateway rejected the supplied authentication with HTTP 401; no credential/model retry. |
| `GATEWAY_ACCESS_DENIED` | Gateway returned HTTP 403; permissions/policy denial, not proof of an invalid key. |
| `GATEWAY_REQUEST_FAILED` | Other transport/provider error; the `error` field retains HTTP status, timeout or network category. |

The former environment-only routing exclusion has been removed; the code no
longer reports a credential-bearing request as blocked for running outside
Vercel. Legacy `error` strings remain for consumers; new `error_code` and
`gateway_route` fields distinguish selection, missing credentials and rejection.
HTTP 402/429/network failures are not classified as bad keys. No provider error
payload or credential value is included in diagnostics.
