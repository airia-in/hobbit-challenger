# HOBBIT Mobile (Capacitor)

The mobile shell wraps the Astro web app in a native Android container. **iOS is not supported today** — only `apps/mobile/android/` is checked in; there is no `ios/` platform directory.

## Build the web bundle and sync Android

From the repository root:

```bash
pnpm --filter @workspace-starter/mobile build
```

This runs `scripts/prepare-web.mjs`, which:

1. Builds `@workspace-starter/web` with `ASTRO_DEPLOY_TARGET=static` (defaults `PUBLIC_API_URL` to `https://hobbit-api.drcode.ai`).
2. Copies `apps/web/dist` into `apps/mobile/www`.
3. Runs `cap sync` to push the bundle into the Android project.

Override the API URL for local or staging backends:

```bash
PUBLIC_API_URL=https://your-api.example.com pnpm --filter @workspace-starter/mobile build
```

## Run on a device or emulator

Requires Android Studio / SDK and a connected device or emulator:

```bash
pnpm --filter @workspace-starter/mobile cap:run:android
```

Open the native project in Android Studio:

```bash
pnpm --filter @workspace-starter/mobile cap:open:android
```

## Android App Links (invite deep links)

The APK (`com.drcode.hobbit`) declares verified App Links for `https://<WEB_DOMAIN>/join…` in `android/app/src/main/AndroidManifest.xml` (`android:autoVerify="true"`).

Production serves the matching Digital Asset Links file at:

```text
https://<WEB_DOMAIN>/.well-known/assetlinks.json
```

The file is generated at `web-host` image build from `ANDROID_SHA256_CERT_FINGERPRINTS`. See [production-hosting.md](../../docs/guides/production-hosting.md#android-app-links-digital-asset-links) for deploy steps and `keytool` fingerprint instructions.

**Signing key today:** the release workflow ships a **debug** APK (`assembleDebug`). Use the debug keystore SHA-256 until a release keystore is configured (#180). When you switch to release signing, update `ANDROID_SHA256_CERT_FINGERPRINTS` and redeploy `web-host`.

## Adding iOS later

The door is open, but nothing is wired today. A future iOS lane would typically:

- Run `npx cap add ios` (on macOS with Xcode) to generate `apps/mobile/ios/`, then add `@capacitor/ios` and npm scripts such as `cap:run:ios`.
- Document Apple Developer signing, provisioning profiles, and push/associated-domains setup for universal links (iOS equivalent of App Links).
- Add an optional CI job to build or archive the Xcode project once credentials are available.
