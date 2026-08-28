# DABBIR iOS Release Plan

## Verified starting state
The authoritative DABBIR repository was web/Vercel-first and had no iOS target, Podfile, Info.plist, Expo, React Native, Swift, or StoreKit app target. This branch creates the first native iPhone foundation without wrapping the existing website.

## Gates
1. Native foundation compiles and static checks pass.
2. Mobile bearer-auth endpoints pass auth/tenant regression tests.
3. Account deletion progresses from request creation to verified deletion/anonymization execution.
4. Apple IAP server verification and entitlement ledger are implemented; Stripe remains web-only.
5. Privacy inventory/manifest are reconciled against final SDK/network behavior.
6. Production API base URL and final public privacy/support/terms URLs are set.
7. Apple Developer: register Bundle ID, capabilities, signing, App Store Connect app record.
8. EAS production build with Xcode 26+ / iOS 26 SDK+.
9. TestFlight on-device QA using the exact candidate artifact.
10. App Store metadata, screenshots, age rating, export compliance, reviewer account/notes.

## External-owner-only gates
- Apple Developer enrollment/fee if not active.
- Apple ID authentication/OTP.
- Accept Apple legal agreements as Account Holder.
- App Store Connect issuer/key creation if an authorized API credential is not already available.
- Banking/tax/legal identity fields where Apple requires the account holder.

## Do not submit while any P0 remains
Current P0s at foundation creation: no verified iOS build; no TestFlight; business/account deletion has request workflow but no verified business deletion executor; Apple IAP server verification not configured/implemented; bundle identifier and signing not registered/verified; App Store Connect record/reviewer access not verified.
