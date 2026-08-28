# DABBIR Apple Requirements Snapshot — 2026-08-28

Source of truth: Apple Developer / App Store Connect documentation reviewed on 2026-08-28.

## Build submission
- Since 2026-04-28, iOS/iPadOS uploads to App Store Connect must be built with Xcode 26 or later using the iOS/iPadOS 26 SDK or later.
- DABBIR mobile uses Expo SDK 57 / React Native 0.86; the current Expo SDK 57 toolchain requires Xcode 26.4+.
- DABBIR CI includes an actual macOS Xcode 26 Release simulator compile rather than treating TypeScript/Expo config as proof of an iOS build.

## App Store product-page constraints
- App name: 2–30 characters.
- Subtitle: maximum 30 characters.
- Promotional text: maximum 170 characters.
- Description: maximum 4000 characters.
- Keywords: maximum 100 bytes.
- Privacy Policy URL is required for iOS.
- Support URL must lead to actual contact information as required by applicable law.
- App Store screenshots: 1–10 images; iPhone 6.9-inch accepted portrait sizes currently include 1260×2736, 1290×2796 and 1320×2868; no alpha/transparency.

## Payments
- Digital functionality and SaaS subscriptions sold/unlocked in the iOS app are subject to App Review Guideline 3.1 / In-App Purchase.
- DABBIR iOS therefore uses Apple IAP for in-app subscription purchase. Existing Stripe billing remains web-side and must not be exposed as a competing in-app digital checkout.
- DABBIR's server verifies Apple signed transaction JWS before writing entitlement state; the client never grants entitlement from a local purchase callback alone.

## Account and login
- Apps supporting account creation must provide account deletion within the app.
- Sign in with Apple is not automatically required while DABBIR exclusively uses its own email/password account system. Re-evaluate if Google/Facebook/other third-party social login is added.
- DABBIR Supabase Auth is shared with other products. Account deletion must be product-scoped and must not blindly delete the shared `auth.users` identity.

## Privacy
- App privacy answers must cover first-party collection and third-party partners/processors used by the app.
- Privacy Policy URL is mandatory.
- PrivacyInfo.xcprivacy / required-reason API declarations must match actual SDK/API use.
- Current native dependency/code audit found no analytics/tracking SDK and the app declares no tracking; this must be rechecked against the final binary before submission.

## Age rating
- Age rating is required and is generated from the current App Store Connect questionnaire. DABBIR must answer according to actual AI/messaging/web/content capabilities and must not guess a rating before completing the live questionnaire.

## Current DABBIR implementation decisions
- Native implementation: React Native via Expo SDK 57, not WebView.
- iPhone first; iPad disabled until deliberately designed and tested.
- iOS deployment target: 16.4.
- Secure local credentials: device Keychain through `expo-secure-store`.
- IAP client: `expo-iap`; server verification uses Apple's official App Store Server Library.
- Proposed Bundle ID: `com.barmansystems.dabbir`. Availability/registration in the owner's Apple Developer account is still unverified.

## Official references reviewed
- https://developer.apple.com/news/upcoming-requirements/
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- https://docs.expo.dev/versions/latest/
