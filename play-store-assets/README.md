# AstroJyotish Google Play assets

- `app-icon-512.png`: 512 × 512 Play Store app icon.
- `feature-graphic-1024x500.png`: 1024 × 500 Play Store feature graphic.
- `phone-screenshots/`: real app screenshots captured from the Android emulator
  at 1080 × 1920 (9:16).

Screenshots are supplied as listing assets. Google Play requires 2–8 phone
screenshots; choose the screens that accurately represent the features enabled
in the version you submit. Subscription purchases are currently disabled in
the release bundle until a production RevenueCat Android public SDK key is
configured.

To regenerate the icon and feature graphic from the project root on macOS, run:

```sh
swift play-store-assets/create-graphics.swift
```
