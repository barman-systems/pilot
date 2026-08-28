# DABBIR iOS Release Plan

## Verified starting state
The authoritative DABBIR repository was web/Vercel-first and had no iOS target, Podfile, Info.plist, Expo, React Native, Swift, or StoreKit app target. PR #158 creates the first native iPhone implementation without wrapping the existing website.

## Verified work completed in PR #158
- Native React Native / Expo SDK 57 iPhone app foundation.
- Secure device session storage via iOS Keychain (`expo-secure-store`).
- Native Bearer auth bridge preserving the existing browser CSRF/same-origin model.
- Native login, signup, token refresh, logout and password-recovery entry point.
- Native DABBIR workspace using the existing RLS-protected runtime.
- Native account-deletion UX and product-scoped deletion architecture that preserves the shared Supabase Auth identity used by unrelated products.
- DABBIR deleted-account tombstone blocks future DABBIR login/runtime access.
- Apple StoreKit client flow with Restore Purchases and user UUID `appAccountToken` binding.
- Server-side Apple JWS transaction verification using Apple's official App Store Server Library.
- Server-side App Store notification JWS verification.
- FORCE-RLS Apple entitlement ledger; client can only read its own entitlement and cannot write entitlements.
- Apple entitlement and retained DABBIR owner-identity cleanup on DABBIR account deletion.
- Public account deletion RPC hardened to SECURITY INVOKER; privileged implementation isolated in `dabbir_private`.
- iOS Privacy Manifest foundation and no ATT/tracking declaration because the native app currently contains no tracking/analytics SDK.
- Root CI, Expo Doctor, TypeScript, Expo config validation, lockfile integrity, CocoaPods/native prebuild gates.
- Native Release simulator compilation gate using Xcode 26 on macOS; a preceding PR commit has completed `xcodebuild Release` successfully and the latest code continues through the same gate.

## Active release gates
1. Complete latest-head CI for every source-changing commit.
2. Apply and transaction-test the final DABBIR account deletion reconciliation migration.
3. Complete synthetic tenant-isolation and WhatsApp-isolation regression tests.
4. Register/verify the final Apple Bundle ID and App Store Connect app record.
5. Provision Apple App Store verification environment values and create the actual subscription product.
6. Produce a signed Distribution build and upload it to TestFlight.
7. Perform exact TestFlight artifact on-device QA.
8. Publish final Privacy / Support / Terms URLs and reconcile App Privacy answers to the final binary and backend processors.
9. Capture screenshots from the exact production candidate and prepare App Review access/notes.

## External-owner-only gates
- Apple Developer enrollment/fee if not active.
- Apple ID authentication/OTP.
- Acceptance of Apple legal agreements when Account Holder action is required.
- Banking/tax/legal identity fields where Apple requires the Account Holder.
- Apple account authorization/API credentials if no authorized machine/service credential is available.

## Release rule
Do not claim TestFlight Ready while signing/App Store Connect/TestFlight are unverified. Do not claim App Store Ready while any P0 remains. Every PASS must follow ACTION → ARTIFACT → TEST → EVIDENCE → VERIFICATION.
