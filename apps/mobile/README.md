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

## Theme-aware splash (manual smoke)

Cold-start splash uses a **theme-neutral** warm off-white (`#f7f5f2`, aligned with the web light `--bg-base`) because the native shell cannot read `hobbit-theme-mode` from `localStorage` before the WebView runs JS. After the web bundle boots, `sync-native-status-bar.ts` applies the resolved light/dark status bar and hides the splash (fade respects `prefers-reduced-motion`).

On a device or emulator:

1. Build and run (`cap:run:android` above).
2. Set theme to **Light** in app settings — cold start should not flash stark black; handoff should match light chrome.
3. Set theme to **Dark** — splash may briefly show the neutral background, then status bar and page should match dark.
4. Toggle **Reduce motion** in Android accessibility — splash should hide without a visible fade.

Config: `apps/mobile/capacitor.config.ts` (`launchAutoHide: false`); Android 12+ window background in `android/app/src/main/res/values/colors.xml` and `styles.xml`.

## Android App Links (invite deep links)

The APK (`com.drcode.hobbit`) declares verified App Links for `https://<WEB_DOMAIN>/join…` in `android/app/src/main/AndroidManifest.xml` (`android:autoVerify="true"`).

Production serves the matching Digital Asset Links file at:

```text
https://<WEB_DOMAIN>/.well-known/assetlinks.json
```

The file is generated at `web-host` image build from `ANDROID_SHA256_CERT_FINGERPRINTS`. See [production-hosting.md](../../docs/guides/production-hosting.md#android-app-links-digital-asset-links) for deploy steps and `keytool` fingerprint instructions.

## Signing and keystore setup

Release builds require a signing keystore and repo secrets. Set up once per deployment target (test, staging, production).

### 1. Generate a keystore

```bash
keytool -genkey -v -keystore release.keystore -alias hobbit-release -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Add CI secrets

| Secret              | Value                             |
| ------------------- | --------------------------------- |
| `KEYSTORE_BASE64`   | `base64 release.keystore` output  |
| `KEYSTORE_PASSWORD` | Keystore password                 |
| `KEY_ALIAS`         | Key alias (e.g. `hobbit-release`) |
| `KEY_PASSWORD`      | Key password                      |

### 3. Update App Links fingerprint

Extract the release SHA-256 and update `ANDROID_SHA256_CERT_FINGERPRINTS`:

```bash
keytool -list -v -keystore release.keystore -alias hobbit-release | grep SHA256 | cut -d' ' -f3
```

Redeploy `web-host` after updating the secret so `assetlinks.json` matches.

### 4. Build signed artifacts

The `release.yml` workflow auto-detects `KEYSTORE_BASE64`. When present it builds:

- `app-release.apk` — signed release APK (sideload, testing)
- `app-release.aab` — signed Android App Bundle (Google Play)

When keystore secrets are absent, only `app-debug.apk` is built (existing behavior).

## Adding iOS later

The door is open, but nothing is wired today. A future iOS lane would typically:

- Run `npx cap add ios` (on macOS with Xcode) to generate `apps/mobile/ios/`, then add `@capacitor/ios` and npm scripts such as `cap:run:ios`.
- Document Apple Developer signing, provisioning profiles, and push/associated-domains setup for universal links (iOS equivalent of App Links).
- Add an optional CI job to build or archive the Xcode project once credentials are available.
