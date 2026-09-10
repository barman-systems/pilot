# Independent read questions and stale clarification — 2026-09-10

The real phone greeting passed after #695/#696. The same customer then asked
«شو عندكم» at 07:45:30 UTC. Production correctly recorded SERVICE_DISCOVERY,
but routed CLARIFY for an old intent_confirmation and replied «تقصد تبا تحجز خدمة؟».
This exposed another instance of the requested independent-non-answer rule.

The reducer checked missing booking facts before routing a known catalog/price
read. Separately, side questions set requirement_loop.count to one even though
no answer had failed; the next failed answer could therefore be counted as two.
An existing test allowed that behavior. It is now stricter: no failed-attempt
counter for side questions and three actual subsequent failures before handoff.

The narrow change routes recognized reads through their own scope checks after
tenant, takeover, injection and model-risk checks. Branch/voice ambiguity and
unresolved pricing references still require clarification. The existing activity
allowlist and database-backed catalog/price execution remain authoritative.
The cognitive layer retains the draft booking and its unconfirmed intent, without
appending its stale confirmation question to the catalog response.

Non-answer turns suspend the failure counter. A new episode starts at one only
on an actual failed answer. The threshold remains three. No model/provider,
timeout, permission, schema, handoff route or business mutation code changed.

Five new regressions reproduce the real catalog question, drifting NEW_REQUEST
metadata, repeated independent reads followed by three actual failures, a price
side question and branch/human-takeover safety. Before: 0/5. After: 5/5.
The targeted dialogue set passes 51/51 and the local complete suite passes
2757/2757 with no failure or skip; syntax passes. CI and isolated real database
proof are required before deployment, followed by a new real WhatsApp check.

The earlier exact-phone greeting proof remains preserved. A separate current
Production journey failed a required English reference probe because provider
timeouts/quota exhausted interpretation; the failure retained state and did not
execute an action. That failed run is not recorded as a passing gate.
