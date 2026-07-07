# Rotorflight Blackbox Android MVP

This directory contains the first Android shell for Rotorflight Blackbox Explorer.
It reuses the existing HTML, JavaScript parser, graph renderer, and workspaces from
the repository root instead of creating a second Blackbox decoder.

## Current milestone

The MVP currently provides:

- a native Android application shell
- secure loading of bundled web content through `WebViewAssetLoader`
- Android's system document picker for Blackbox logs, configuration files, JSON,
  and supported video files
- multiple-file selection when requested by the web interface
- persistent document read permission when the provider supports it
- mobile layout overrides
- safe external-link handling
- WebView state restoration across activity recreation

The desktop-only NW.js update dialog, secondary-window button, and export buttons
are disabled in the Android shell for now.

## Requirements

- Android Studio with JDK 17
- Android SDK 36
- Gradle 9.4.1
- Node.js and Yarn or npm

## Build from Android Studio

1. Clone the repository and check out `android-mvp`.
2. In the repository root, install the existing web dependencies:

   ```shell
   yarn install
   ```

   `npm install` may also be used.

3. Open the `android` directory as a project in Android Studio.
4. Allow Android Studio to install the requested SDK and Gradle components.
5. Run the `app` configuration on an Android 7.0 or newer device.

The `syncWebAssets` Gradle task copies the required Blackbox files and selected
runtime npm packages into the APK before `preBuild`. It intentionally does not
copy development files, release packages, Git metadata, or the Android project
back into itself.

## First test

1. Launch the app.
2. Tap **Open log file/video**.
3. Select a `.bbl`, `.bfl`, `.cfl`, `.txt`, or `.log` file.
4. Confirm that the flight list and main graph appear.
5. Rotate the phone to landscape and confirm that the selected log remains open.

## Known MVP limitations

- The desktop graph controls have only basic mobile layout adjustments.
- Pinch-to-zoom and native touch scrubbing still need a dedicated gesture layer.
- Video export and CSV export are not yet connected to Android's create-document
  workflow.
- Opening a log by tapping it in another Android app is not implemented yet.
- Very large logs still parse on the WebView main JavaScript thread.

## Next planned steps

1. Add touch scrubbing and pinch zoom.
2. Add an Android-first graph setup panel.
3. Add share/open-with intents.
4. Move parsing of large logs into a Web Worker.
5. Add CI that builds a debug APK and runs parser fixtures.
