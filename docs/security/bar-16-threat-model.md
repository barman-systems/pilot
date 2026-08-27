# BAR-16 — DABBIR Privacy & Tenant Isolation Threat Model

## Scope

This model covers DABBIR customer data isolation, privacy export/delete execution, integration secrets, observability, and customer-scoped recovery.

## Protected assets

- Business and customer records.
- Customer identities, conversations, messages, appointments, memory and consent records.
- Payment/accounting evidence that must not be erased merely because customer-identifying data is removed.
- WhatsApp/Meta integration access tokens and integration encryption keys.
- Privacy request and audit records.
- Recovery journals, snapshots and restore cases.

## Trust boundaries

1. Browser/app -> DABBIR API.
2. DABBIR API -> Supabase Data API/RPC.
3. Tenant A -> Tenant B data boundary.
4. Authenticated user -> owner/admin-only operations.
5. DABBIR runtime -> Meta/WhatsApp provider.
6. Application logs -> operators/observability systems.
7. Production tables -> private recovery vault.

## Threats and enforced controls

### Cross-tenant read/write

Threat: a valid signed-in user attempts to read or mutate another business's rows.

Controls:
- Tenant tables use RLS and FORCE RLS where applicable.
- Membership checks bind business_id to auth.uid().
- Privacy execution re-checks active owner membership inside the SECURITY DEFINER function rather than trusting request parameters.
- Negative QA executes RPCs as the authenticated role and verifies non-owner denial.

### Privilege escalation through RPC

Threat: an authenticated caller invokes a privileged SECURITY DEFINER function directly.

Controls:
- Public privacy RPC is SECURITY INVOKER.
- Anonymous execution is revoked.
- The private executor independently checks auth.uid(), request type, business membership and owner role.
- Sensitive operations fail closed on unknown states.

### Silent or accidental deletion

Threat: customer data is erased because of a UI bug, replay, forged request, or implicit automation.

Controls:
- Privacy intake and execution are separate operations.
- Customer deletion requires exact confirmation `DELETE_CUSTOMER:<uuid>`.
- LEGAL_HOLD blocks deletion.
- Request row is locked during execution.
- Deletion verifies exactly one root customer row was removed.
- No external financial side effect is executed.

### Destruction of accounting evidence

Threat: privacy deletion removes records required for finance, reconciliation, disputes or legal obligations.

Controls:
- Orders, offers, payments and financial evidence are dissociated from the customer identity instead of blindly deleted.
- Stripe customer references are removed from the retained payment row.
- Financial-evidence metadata is replaced with a privacy-redacted marker.

### Privacy export creating a second PII store

Threat: an export request persists another plaintext copy of customer data.

Controls:
- Export body is returned inline only.
- Persisted request evidence contains SHA-256, byte count and completion metadata, not the export body.
- Maximum inline export size is bounded.

### Sensitive data in logs

Threat: tokens, email addresses, phone numbers or message bodies are accidentally logged by a caller.

Controls:
- `logEvent` performs recursive mandatory redaction centrally.
- Sensitive keys are redacted regardless of caller intent.
- Embedded Bearer/JWT/email/phone values are redacted from otherwise safe strings.
- Object depth, array size and string length are bounded.

### Integration token disclosure or key compromise

Threat: encrypted WhatsApp tokens become readable because a key leaks, or routine key rotation makes existing ciphertext unavailable.

Controls:
- Tokens are encrypted with AES-256-GCM and a tenant-derived key.
- Ciphertext, IV and authentication tag are stored separately from key material.
- Key material remains in runtime secret configuration, not the database.
- `token_key_version` identifies the encryption version.
- DABBIR supports a current key/version and exactly one previous key/version during rotation.
- When an old-version connection is loaded, DABBIR re-encrypts it with the current key automatically.
- If the required version is not available, decryption fails closed.

## Integration key rotation policy

Routine rotation target: every 90 days. Immediate rotation is required after suspected exposure, privileged-operator offboarding, secret-store compromise, or accidental secret disclosure.

Safe sequence:

1. Generate a new high-entropy `DABBIR_INTEGRATION_ENCRYPTION_KEY` and increment `DABBIR_INTEGRATION_ENCRYPTION_KEY_VERSION`.
2. Move the old key/version to `DABBIR_INTEGRATION_ENCRYPTION_KEY_PREVIOUS` and `DABBIR_INTEGRATION_ENCRYPTION_KEY_PREVIOUS_VERSION`.
3. Deploy the application before removing the previous key.
4. Existing connections are lazily rewrapped to the current version on authenticated connection load; newly linked connections use the current version immediately.
5. Verify no stored `dabbir_whatsapp_connections.token_key_version` remains on the previous version.
6. Remove the previous key/version from runtime configuration and redeploy.
7. If compromise is suspected, revoke/replace provider tokens as well; encryption-key rotation alone does not revoke a Meta token.

Never rotate by replacing the current key while omitting the previous key/version if old ciphertext still exists.

## Recovery failure and corruption

Threat: operator error or privacy execution deletes customer-scoped data that must be restored, but the recovery journal omits the root customer row.

Controls:
- Recovery journal and restore evidence are private and append-only.
- Journal events are hashed and health-checked.
- `dabbir_customers.id` is explicitly registered as a customer scope key.
- Customer-scoped recovery therefore includes both root customer and child rows.
- BAR-16 live transactional QA mutates an existing customer row, opens a recovery case to the pre-change time, applies recovery, verifies the original value, and rolls the entire QA transaction back.

## Residual risks

- Supabase leaked-password protection is an Auth configuration control and must be enabled separately when the account plan/settings allow it.
- Provider-token revocation still depends on the external provider.
- Legal retention requirements vary by business and jurisdiction; LEGAL_HOLD and retention policy must remain authoritative over deletion.
- Business-wide export/delete is outside this BAR-16 customer-data executor and requires its own explicitly reviewed workflow.

## Release gate

BAR-16 may be marked complete only when:
- CI and committed-secret scanning pass on the exact PR head.
- Security Advisor has no new BAR-16 RLS/RPC finding.
- Customer export/delete negative and positive paths pass transactionally on production schema with rollback.
- Recovery root-row test passes transactionally with rollback.
- Production deployment matches the merged commit and has no new runtime errors.