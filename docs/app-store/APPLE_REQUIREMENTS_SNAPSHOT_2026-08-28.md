# DABBIR Apple Requirements Snapshot — 2026-08-28

Source of truth: Apple Developer documentation reviewed on 2026-08-28.

## Build submission
- Since 2026-04-28, iOS/iPadOS uploads to App Store Connect must be built with Xcode 26 or later using the iOS/iPadOS 26 SDK or later.
- DABBIR mobile foundation uses Expo SDK 57 / React Native 0.86, whose current Expo requirements are iOS 16.4+ and Xcode 26.4+.

## Payments
- Digital functionality and SaaS subscriptions sold/unlocked in the iOS app are subject to Guideline 3.1 and In-App Purchase.
- DABBIR iOS architecture therefore uses Apple IAP for iOS subscription purchase; existing Stripe billing remains web-only and must not be exposed as an in-app purchase path.
- A free stand-alone companion-app model is only an alternative if there is no purchasing or external-purchase call to action in the iOS app.

## Account and login
- Apps supporting account creation must provide account deletion within the app.
- Sign in with Apple is not automatically required when the app exclusively uses its own email/password account system. Re-evaluate if Google/Facebook/other social login is added.

## Privacy
- App privacy answers must cover first-party and third-party SDK data collection.
- PrivacyInfo.xcprivacy must accurately disclose required-reason API usage; invalid or missing required-reason declarations can block upload.

## App completeness
- Final metadata and functional URLs are required.
- Login apps need working reviewer access/demo information and an available backend.
- Incomplete binaries, crashes, obvious technical problems, and nonfunctional IAP can be rejected.

## Current DABBIR implementation decisions
- Native implementation: React Native via Expo SDK 57, not WebView.
- iPhone first; iPad disabled until deliberately designed/tested.
- iOS deployment target: 16.4.
- Secure credentials: device Keychain through expo-secure-store.
- IAP client: expo-iap 5.4.0 / StoreKit-backed flow, with server verification required before entitlement.
- Proposed bundle identifier: com.barmansystems.dabbir. Registration/availability in the owner's Apple Developer account remains externally unverified.

## Official references
- https://developer.apple.com/news/upcoming-requirements/
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- https://docs.expo.dev/versions/latest/
