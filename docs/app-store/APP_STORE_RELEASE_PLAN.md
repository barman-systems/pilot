# DABBIR iOS Release Plan

## Current release verdict
`APP_STORE_READY=FALSE`

The native application, server-side Apple entitlement path, account deletion, web/auth journey, cross-tenant isolation, App Store public-page source, and unsigned native Release compile now have executable evidence. A signed Apple Distribution artifact and TestFlight device run do not yet exist, so App Store readiness must remain false.

## Verified native foundation
PR #158 created the first native DABBIR iPhone implementation without wrapping the website.

Foundational PR #158 evidence on head `04ba4aecbf8318ffc4068bd41739e484efaa21b0`:
- DABBIR Mobile CI run `33161772286` completed successfully.
- `mobile-static` job `98817684658` completed successfully.
- `ios-native-compile` job `98817684653` completed successfully.

The native compile gate was subsequently strengthened by PR #202. Verified on main commit `2f721876a8014d1bea302149f26f164a97d03dff`:
- DABBIR Mobile CI run `33181956120` (#52) completed successfully.
- The native job runs on `macos-26`, explicitly requires Xcode major >= 26, generates the native iOS project, installs CocoaPods, and compiles the Release configuration twice with signing disabled:
  - generic iOS Simulator Release compile;
  - generic physical iOS device (`iphoneos`) Release compile.
- These unsigned compile gates prove the source/native dependency graph compiles for both simulator and device targets; they do **not** substitute for Apple Distribution signing, an archive/IPA, or TestFlight.

Verified native capabilities:
- Native React Native / Expo SDK 57 iPhone app; no WebView wrapper.
- Secure device session storage via iOS Keychain (`expo-secure-store`).
- Native Bearer auth bridge preserving browser CSRF/same-origin behavior.
- Login, signup, refresh, logout and password recovery.
- RLS-protected DABBIR workspace.
- In-app product-scoped account deletion that does not delete a shared Supabase Auth identity used by unrelated products.
- Deleted-account tombstone blocks future DABBIR login/runtime access.
- StoreKit client flow with Restore Purchases and user UUID `appAccountToken` binding.
- Server-side Apple transaction and App Store Server Notification JWS verification using Apple's official App Store Server Library.
- FORCE-RLS Apple entitlement ledger; client can read only its own entitlement and cannot write entitlements.
- Server verification and entitlement persistence occur before the client finishes/grants a purchase.
- iOS Privacy Manifest foundation with tracking disabled; final collected-data reconciliation is still required against the submission binary.

## Verified Supabase release migrations
Applied to project `spohjzrsymsmzsseygtw`:
- `dabbir_apple_entitlements_v1`
- `dabbir_product_scoped_account_deletion_v1`
- `dabbir_account_deletion_apple_cleanup_v1`
- `dabbir_account_deletion_identity_cleanup_v2`
- `dabbir_account_delete_private_executor_v2`
- `dabbir_account_delete_customer_number_release_v3`

## Verified security / production journey
Canonical Full Customer Journey run `33175328444` (#138) completed successfully on exact production release:
- Commit SHA: `55ed13414e31c39784b0737528a77f0dbffe911a`
- Vercel deployment: `dpl_5UDsdeQz62ZbCPzjndhUipBVLtEF`
- Full owner/customer/employee/AI journey: 28/28 PASS.
- Cross-tenant + WhatsApp isolation attack: 9/9 PASS.
- Required failures: 0.
- Release remained the same before and after the tests.
- Evidence ZIP SHA-256: `757b688872425e9dac8602e904575da564f14efc7c78f7c836d979927d56b8d5`.

This verifies server/web authentication, tenant isolation and WhatsApp cross-tenant authorization. It does **not** substitute for a real iPhone/TestFlight Meta WhatsApp pairing and message test.

## App Store public pages
The repository contains bilingual Arabic/English App Store-facing pages and stable Vercel routes:
- `/privacy` → `privacy.html`
- `/terms` → `terms.html`
- `/support` → `support.html`

Source and route contracts are covered by automated tests and the App Store static preflight. These pages do not contain a Stripe/web purchase CTA. The privacy page records the current no-tracking declaration and product-scoped deletion behavior.

This is **source readiness only**. App Store release mode still requires these paths to resolve on a genuinely public, stable HTTPS production hostname. Protected/prelaunch Vercel hosts are intentionally rejected.

## App Store preflight contract
The release pipeline must distinguish internal source readiness from Apple/external readiness.

Static preflight is required to verify:
- Native/non-WebView client.
- In-app account deletion and password recovery.
- Server-side Apple JWS verification and entitlement persistence.
- No entitlement before server verification.
- Restore Purchases.
- StoreKit-derived subscription period and introductory-offer disclosure; no hardcoded 7-day trial claim in the client.
- Privacy Policy and Terms links are required by the subscription UI before purchase is enabled.
- No Stripe, web checkout, or external purchase CTA in the iOS subscription component.
- Native API base remains explicit HTTPS and fail-closed.
- EAS production profile uses remote app versions, production environment, and build auto-increment.
- Privacy/Terms/Support source pages remain bilingual and mapped to stable Vercel routes.

Release-mode preflight must additionally fail unless all of these are real and configured:
- Bundle ID exactly `com.barmansystems.dabbir`.
- Numeric App Store Apple ID.
- Same subscription product ID on the iOS client and server.
- Apple IAP enabled for the production candidate.
- Public production HTTPS API URL, not a protected/prelaunch deployment URL.
- Public HTTPS `/privacy`, `/terms`, and `/support` URLs.
- Apple root certificates for JWS verification.
- Server-side entitlement storage credential.

The preflight must never print private keys, root certificate bodies, or service-role credentials.

## Remaining P0 release gates
1. Register/verify `com.barmansystems.dabbir` in the Apple Developer account and create/verify the App Store Connect app record.
2. Create the real auto-renewable subscription in App Store Connect and configure the intended introductory free trial there. The client must display only StoreKit-reported offer data; it must not manufacture eligibility or duration.
3. Bind a genuinely public stable production hostname for the native API and `/privacy`, `/terms`, `/support`; configure the production Apple/IAP values; then obtain a RELEASE preflight PASS.
4. Reconcile the Privacy Manifest and App Privacy questionnaire against the exact final binary, backend processing, and third-party SDKs.
5. Produce a signed Apple Distribution archive/IPA from the exact candidate and record its build/artifact identity.
6. Upload that exact build to TestFlight.
7. Perform exact TestFlight artifact QA on a real iPhone: install, launch, signup/email verification, login, password recovery, dashboard, native WhatsApp Embedded Signup/pairing, send/receive path, StoreKit purchase, server entitlement, Restore Purchases, logout/login, product-scoped account deletion, reinstall/re-auth behavior.
8. Capture App Store screenshots from the exact candidate and finish Arabic/English metadata, age rating, export-compliance answers, privacy answers, Support/Privacy/Terms URLs, reviewer demo access, and review notes.

## Known security warning outside the native source gate
Supabase Security Advisor still reports Leaked Password Protection disabled. It remains unresolved until Supabase Auth configuration can be changed through an authorized management surface. Do not mark it fixed merely because application tests pass.

## External-owner-only gates
- Apple Developer enrollment/fee if not active.
- Apple ID authentication/OTP.
- Acceptance of Apple legal agreements when Account Holder action is required.
- Banking/tax/legal identity fields where Apple requires the Account Holder.
- Apple account authorization/API credentials when no authorized machine/service credential is available.

## Release rule
Do not claim TestFlight Ready while signing/App Store Connect/TestFlight are unverified. Do not claim App Store Ready while any P0 remains. Every PASS must follow ACTION → ARTIFACT → TEST → EVIDENCE → VERIFICATION.
