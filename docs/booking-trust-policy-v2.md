# DABBIR Booking Trust Policy — Autonomous Booking

- WhatsApp/web bookings never wait for owner, admin, manager, employee, or staff approval.
- If no deposit is configured, the booking is confirmed immediately and written to the DABBIR calendar.
- If a deposit is configured, the booking is still created immediately and reserves the slot; confirmation waits only for the deposit state, not a human decision.
- A paid deposit auto-confirms the booking.
- The owner/team receives booking notifications only; they are not part of the normal execution path.
- Customer WhatsApp confirmation/reminders remain active according to the booking state and configured reminder policy.
- Cancellation still cancels pending customer booking/reminder messages.
- Historical `owner_approval` columns remain only for backwards-compatible reads; new booking writes must not enter that state.
