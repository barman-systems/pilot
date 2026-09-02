# CEO Center v24 evidence gates

Required before production:
1. DABBIR CI success on branch head.
2. Vercel preview READY.
3. Authenticated owner route remains OTP/session protected.
4. CEO center reads `/api/owner-dashboard-data?action=executive` only with same-origin owner session.
5. PR merge to main; no direct push.
6. Release Guardian success/no revert.
7. Production deployment READY in configured region.
8. Post-deploy runtime error check clean.
