-- Explicitly preserve non-callable trigger-function privileges for CI/source parity.
revoke all on function dabbir_private.ai_booking_funnel_decision_trigger() from public,anon,authenticated;
revoke all on function dabbir_private.ai_booking_funnel_appointment_trigger() from public,anon,authenticated;