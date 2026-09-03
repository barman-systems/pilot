# DABBIR Salon Payment Canonical Route

Normal salon payment recording must follow:

`Salon UI -> /api/salon-operations record_payment -> dabbir_record_operational_payment RPC -> operational payment ledger`

Rules:
- The API must not POST directly to `dabbir_operational_payments` for `record_payment`.
- Every real payment attempt gets a unique browser request ID.
- Retrying the same still-open payment form reuses the same request ID.
- Closing and reopening the form creates a new request ID, so two legitimate equal payments remain distinct.
- The database remains the final authority for idempotency conflicts and payment-state transitions.
