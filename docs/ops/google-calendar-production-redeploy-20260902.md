# Google Calendar production redeploy

Purpose: trigger a clean DABBIR production deployment after adding the Google Calendar OAuth client ID and client secret to the Vercel Production environment.

Verification target after deployment:

- `calendar_storage_configured: true`
- `calendar_security_configured: true`
- `google_calendar_configured: true`

No credential values are stored in this file.
