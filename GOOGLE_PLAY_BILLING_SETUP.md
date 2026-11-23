# Google Play subscription setup

The Android app uses RevenueCat for Google Play purchase flows and entitlement verification. The configured identifiers must match the Google Play and RevenueCat dashboards:

- Android package: `com.astrojyotish.app`
- Google Play subscription product: `astrojyotish_plus_monthly`
- RevenueCat entitlement: `plus`
- RevenueCat current offering: include the monthly product above

The app uses the `react-native-purchases` SDK, which supplies its Android native integration through React Native autolinking. Do not add the separate `purchases-kmp-core` Gradle dependency; it is for Kotlin Multiplatform applications.

## Required dashboard setup

1. Create the Android app in Google Play Console with package `com.astrojyotish.app`.
2. Create an auto-renewing monthly subscription with product ID `astrojyotish_plus_monthly` and configure the India base-plan price as ₹99. Activate the base plan.
3. Create a RevenueCat project and Android app with the same package ID.
4. Link RevenueCat to Google Play using a Google Play service-account credential in the RevenueCat dashboard. Do not put that credential in the app.
5. In RevenueCat, create an entitlement named `plus`, attach the Play subscription product to it, and add that product to a monthly package in the current offering.
6. Copy the RevenueCat **Android public SDK key** into `.env`:

   ```sh
   cp .env.example .env
   ```

   Set `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` to the Android public SDK key from the RevenueCat project, then restart Metro and rebuild the native app. The public SDK key is intended for use in clients; never use a RevenueCat secret API key here.

## Build and test

Expo Go cannot load Google Play Billing. Build the Android development client instead:

```sh
npm run android
```

For subsequent JavaScript changes, run `npm run start:dev-client`.

For a real Google Play test, upload the app and subscription to an internal testing track, add a license tester, and install the app from the Play Store using that tester account. The price shown in the paywall comes from the Play product; Google Play displays the final price and renewal terms before the user confirms. The app unlocks Plus only when RevenueCat reports the active `plus` entitlement. “Restore purchases” checks the signed-in Play account.

## Play Store release bundle

The release build requires a dedicated Play upload key. The local upload keystore and its signing properties are stored under `android/` and are excluded from Git. Keep a secure backup of `android/upload-keystore.jks` and `android/keystore.properties`; losing them can prevent future updates signed with this upload key.

Put the RevenueCat **Google Play Android public SDK key** (the Android app-specific `goog_...` key) in the ignored `.env.production.local` file (not the Test Store key in `.env`). Never put a RevenueCat secret API key (for example, an `sk_...` key) or Google service-account credential in the app. Release builds reject secret and Test Store keys; if the public key is absent, the bundle builds with purchases disabled until the production key is configured.

To build the upload bundle without embedding the local Test Store key, run:

```sh
cd android
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY= ./gradlew :app:bundleRelease
```

The AAB will be at `android/app/build/outputs/bundle/release/app-release.aab`. Upload it in the Google Play Console using Play App Signing. Keep the upload keystore and its local properties private and backed up; do not send signing passwords in chat or commit those files.

To enable subscriptions in the Play release, set the production `goog_...` Android public SDK key in `.env.production.local` and rebuild instead.

## RevenueCat Test Store

The Test Store can exercise the purchase UI without a Play Store purchase. In RevenueCat, attach its monthly Test Store product to the `plus` entitlement and put that product in the current offering as a monthly package. The app prefers the configured Play product ID above, then falls back to the offering's monthly package type so the Test Store product can be selected as well.

Use the Test Store public SDK key only in a local debug build. Restart Metro and rebuild after changing `.env`. Never use a Test Store key in a release build; it is not a Google Play key and does not verify a real ₹99 charge. Test Store display prices are simulated and do not establish the Google Play price.

## Current feature scope

The purchase integration removes the three-question sample limit while the subscription is active. Responses are still sample content, not AI-generated, and yearly reports are not implemented. Do not advertise those unavailable features as included subscription benefits.
