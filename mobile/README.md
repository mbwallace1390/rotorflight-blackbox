# RotorLens Mobile

This directory contains the shared React Native shell and the Android/iOS
native hosts. The existing browser viewer remains the analysis engine inside a
trusted platform WebView; see [`../docs/mobile-architecture.md`](../docs/mobile-architecture.md).

## Toolchains

- Mobile JavaScript: Node 22 (minimum 22.11)
- Android: JDK 17, Android SDK 36, NDK 27.1.12297006
- iOS: macOS, Xcode, Ruby/Bundler, and CocoaPods

The repository root is still the desktop/browser viewer and retains its Node 16
toolchain. Keep the root and `mobile/` dependency installs separate.

## Install

Install the viewer dependencies from the repository root:

```sh
corepack enable
yarn install --frozen-lockfile
```

Then install the mobile dependencies:

```sh
cd mobile
npm ci
```

## Verify shared code

From `mobile/`:

```sh
npm test -- --runInBand
npm run lint
npx tsc --noEmit
```

Run the parser and hosted-asset baseline from the repository root:

```sh
npm test
```

## Android

Start Metro from `mobile/`:

```sh
npm start
```

In a second terminal:

```sh
npm run android
```

For a compile check (the debug APK still expects Metro at runtime):

```sh
cd android
bash ./gradlew assembleDebug
```

On Windows, use `gradlew.bat assembleDebug` instead. For a standalone APK
that bundles the React Native JavaScript and is signed with the development
key for device testing:

```sh
cd android
bash ./gradlew assemblePreview
```

Local and CI preview builds use the same checked-in public development key so
preview upgrades keep one certificate lineage. It is not a production release
identity; release builds remain unsigned until the project owner supplies the
RotorLens signing key. RotorLens uses the package ID
`io.github.mbwallace1390.rotorlens`, so it can remain installed alongside the
legacy `org.rotorflight.blackbox` preview. Only a RotorLens APK signed with a
different key needs a one-time uninstall before joining this preview lineage.

The Gradle build synchronizes the trusted viewer and its browser dependencies
from the repository root. Its CMake staging directory is deliberately short so
New Architecture builds also work from deep Windows checkout paths.

## iOS

iOS source can be edited on any platform, but native dependencies, compilation,
WebKit validation, signing, Simulator, and device testing require macOS/Xcode.

From `mobile/` on a Mac:

```sh
bundle install
bundle exec pod install --project-directory=ios
npm run ios
```

Before treating the iOS viewer as production-ready, validate the custom WebKit
scheme with relative assets, `fetch`, Web Workers, Blob/File, local storage,
Canvas, and WebGL. If any of those APIs reject the custom scheme, use the
loopback-only fallback described in the architecture document.

## Licensing and releases

The mobile build bundles the root GPLv3 license, modification notice,
third-party notices, and supporting license texts. Follow the complete
[`release-compliance.md`](../docs/release-compliance.md) checklist before any
public or app-store distribution. Preview builds are not a substitute for the
release-specific source tag and artifact-level dependency license scan.
