# Package purchase and restore — #45

## Implementation boundary

The local `PackageStore` Expo module uses StoreKit 2. It loads the configured
non-consumable's localized `displayName` and `displayPrice`, verifies purchase
results, observes transaction updates, and recovers current entitlements. Only
the explicit Restore Purchases action calls `AppStore.sync()`. Routine app launch
and foreground refresh do not force authentication.

The native `PackagePurchases` API is the ownership authority; its React snapshot
is presentation, not a durable receipt or a future download authorization token.
No purchase boolean, transaction payload, account identifier, or receipt is
written to application storage or CloudKit. Successfully handled verified
transactions are finished after updating ownership. Duplicate delivery sets the
same ownership state and cannot grant XP, create learning records, or download.

Cancellation, pending approval, verification failure, other failure, ownership,
and product unavailability are separate states. A verified revocation or a
successful entitlement query reporting absence removes ownership. Verification
errors preserve any previously verified in-memory ownership; a new instance
remains unknown. A failed restore or disconnected catalog query does not turn
missing cached data into a definitive revocation.

Restore Purchases is a single action in the main Settings menu, not an action
on each book card. It refreshes the shared verified ownership state; unowned
products retain their purchase action. Restoration never starts a download.
Purchased books can offer Download only once delivery is implemented and the
package is actually downloadable. Until then they remain purchased/not downloaded.

Ask to Buy denial/expiry need not emit an update. While pending, guidance points
to Settings > Restore Purchases for an approval-status recheck; a successful sync
without entitlement clears the pending UI and allows another purchase attempt.
This is user-initiated, never background forced authentication.

StoreKit supplies cached signed transactions offline. The app can only know what
StoreKit currently reports: refunds/account changes may not be reflected until
the device reconnects. There is no promise of immediate offline revocation or
permanent offline entitlement. The local StoreKit query cache can briefly lag a
purchase result; tests allow bounded propagation before checking reopening.

The paid card is separate from installed/playable catalog entries. It displays
“purchased · not downloaded” and explicitly warns before purchase that download
and study are unavailable. There is no download button or paid lesson route in
#45. Apple-hosted delivery and its verified entitlement gate belong to #46/#47.
The controlled bundled sample and its local progress remain unchanged.

## Local configuration

Copy `.env.example` to ignored local configuration and set `APPLE_BOOK_PRODUCT_ID`
to the owner-approved App Store Connect product ID. The config plugin embeds it
in the generated native Info.plist, not in a mutable JavaScript ownership flag.
Changing this value requires prebuild and a native rebuild. An empty value or
missing StoreKit product is unavailable, never replaced by a fabricated offer.
Do not put account credentials or team identifiers in tracked configuration.

The owner-approved permanent bundle identifier replaces the prototype identifier.
They are separate iOS app containers: old sample progress is not migrated, deleted,
or claimed to appear in the new app. Keep the old app if its local data is needed.
The generated iOS directory is disposable; source configuration and local module
are committed. No generated provisioning or signing files should be committed.

## Reproducible local checks

Requires Xcode with iOS 26+, a simulator, CocoaPods, and XcodeGen. Local test
identifiers and product data are fictional, isolated from the owner’s product.

```sh
npm run check
xcodegen generate --spec tests/storekit/project.yml
xcodebuild -project tests/storekit/PackageStoreTests.xcodeproj \
  -scheme PackageStoreTests \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
  -parallel-testing-enabled NO test
```

The test host's `get-task-allow` entitlement enables local StoreKit testing on
the simulator. It belongs only to that isolated test host. No production
entitlement or test bypass is added to the app. Tests use Swift Testing with
Apple's `SKTestSession`, including actual StoreKit purchase/query/update APIs;
they do not mock a successful JavaScript purchase.

Rebuild the app separately with the approved local product configuration:

```sh
npx expo prebuild --platform ios
npx expo run:ios --configuration Release
```

Expo Go cannot load this local module. Without it, only the purchase feature is
unavailable; the controlled sample remains usable.

## Measured verification — 2026-09-12

- `npm run check`: 73 domain tests passed, zero failures; TypeScript checking
  completed successfully.
- The isolated iOS 26.5 StoreKit test run reported 12 test cases passed, zero
  failures and zero skipped. Coverage includes purchase, reopening, explicit
  restore, observer updates, refund, cancellation, failed/unverified results,
  catalog failure, duplicate/concurrent attempts, and Ask to Buy approval/denial.
- The Release simulator app built successfully with the local Expo module
  autolinked. Dependency/generated-code warnings remain; there were no build
  errors. This app build coexists with unrelated working-tree UI edits, which
  are not part of the #45 commit; the StoreKit test host is isolated from them.
- Installed and launched the rebuilt app without removing the old prototype.
  Its bundled configuration matched the owner-approved product ID. The real
  catalog returned no product in this simulator, including after a Retry tap.
  UI inspection confirmed the unavailable state, disabled purchase action,
  retry control, and explicit notice that paid downloads are not implemented.
  This does not establish why Apple did not return the product, or verify its
  live localized price. No purchase or account authentication was performed.

## Acceptance still required

Local automated results are not Apple sandbox evidence. Before closing #45,
verify the owner-approved product and price on a development-signed device or
appropriate sandbox build, purchase with the designated Sandbox Apple Account,
relaunch, and restore ownership. No real-money purchase, agreement acceptance,
TestFlight upload or public release is authorized here. Never request or publish
the tester password. Keep raw logs and account/device details private.

## Manual sandbox checklist

1. In App Store Connect, verify the Paid Applications Agreement is signed by the
   owner and the non-consumable has a product ID, localized name, price and intended
   storefront availability. Metadata changes can take up to an hour to reach sandbox.
2. Connect the test iPhone to Xcode, trust the Mac, enable Developer Mode, and run
   a development-signed build with the approved bundle/product configuration.
   Disable any local StoreKit fixture for this real-product test. A TestFlight
   upload is not needed for the development-signed path.
3. Use Settings > Developer > Sandbox Apple Account, not the main iCloud account,
   to sign in to the designated tester. Apple notes this option can first appear
   after a purchase attempt in the development-signed app. This path does not
   require signing out of the normal Apple Account.
4. Confirm the real product's localized title and price. Cancel one purchase and
   confirm it stays unowned; then purchase using only the sheet marked Sandbox.
   Stop if the test-environment indicator is absent. Sandbox transactions do not
   charge real money.
5. Relaunch, then use the app's Settings > Restore Purchases. Owned products must
   not ask for payment again; unowned products remain purchasable. Currently the
   paid book reads purchased/not downloaded, because delivery is deferred.
6. Test no-purchase behavior with a separate empty sandbox tester. Do not clear
   purchase history until the restore test is complete; do not uninstall an app
   containing learning progress you want to preserve.

Follow-up UI verification: 75 domain tests and TypeScript checking passed. The
Release simulator build launched, the library no longer exposed Restore Purchases,
and Settings exposed the single action. Real sandbox purchase is still unverified.

During #49 development, the existing native StoreKit suite was rerun: 12 passed,
0 failed, 0 skipped. This is local StoreKit evidence, not sandbox acceptance.

Official references: [StoreKit transactions](https://developer.apple.com/documentation/storekit/transaction),
[explicit sync](https://developer.apple.com/documentation/storekit/appstore/sync()),
[StoreKit test sessions](https://developer.apple.com/documentation/storekittest/sktestsession),
[sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).
