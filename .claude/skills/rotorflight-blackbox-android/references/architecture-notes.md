# Architecture Notes: Rotorflight Blackbox Android

Detailed file-by-file map. Read the relevant section before editing that
area; don't read this whole file into context unless doing a full audit.

## Repo layout

```
rotorflight-blackbox-android-mvp/
├── index.html, index.js          # Desktop app entry (vendored, has an nw.gui call)
├── js/                           # Vendored desktop app logic (mostly platform-agnostic)
│   ├── flightlog_parser.js       # Blackbox binary decoder — TRUSTED, don't rewrite
│   ├── decoders.js               # Field decoders — TRUSTED, don't rewrite
│   ├── datastream.js             # Binary stream reader — TRUSTED
│   ├── main.js                   # App bootstrap; has 3 nw.gui call sites (lines ~134, 2084, 2100)
│   ├── pref_storage.js           # Already has a comment acknowledging Android WebView
│   │                             #   lacks require("nw.gui") — check it degrades cleanly
│   ├── video_export_dialog.js    # KNOWN BROKEN on Android — depends on ffmpeg native libs
│   ├── graph_*.js                # Graphing/spectrum analysis — pure JS/canvas, should be fine
│   ├── craft_3d.js               # three.js WebGL 3D model — should work in WebView, verify perf
│   └── vendor/                   # Third-party libs (jquery, three.js, etc.) — never edit
├── library/                      # Per-OS native ffmpeg binaries (win/linux/osx) — NO android/ variant
├── css/                          # Desktop-oriented styling; has android_*.css overrides already
├── android/                      # The actual Android project — THIS is the native shell
│   ├── app/build.gradle.kts      # syncWebAssets task pulls index.html/js/css/etc from repo root
│   ├── app/src/main/java/org/rotorflight/blackbox/MainActivity.java
│   └── app/src/main/AndroidManifest.xml
└── package.json                  # Root JS deps (bootstrap, html2canvas, lodash, webm-writer, etc.)
```

## MainActivity.java — what it does, precisely

- Serves app assets from `https://appassets.androidplatform.net/assets/` via
  `WebViewAssetLoader`, NOT `file://`. This avoids the usual WebView
  same-origin/file-access security restrictions and CORS headaches. Any fix
  that involves loading local files should use this same asset-loader
  pattern, not raw `file://` URLs.
- **JS injection shim**: `AndroidAssetsPathHandler.handle()` specifically
  intercepts requests for `js/main.js`, and if it contains a known marker
  string (`    function loadLogFile(file) {`), injects two things ahead of
  the real file content:
  1. `ANDROID_MAIN_SCRIPT_SHIM` — defines `window.require` to return a fake
     `nw.gui` object (App/Window/Shell no-ops) when the code checks
     `navigator.userAgent` for `RotorflightBlackboxAndroid/`, and throws a
     clear error for any other module name.
  2. `LOAD_FILES_EXPORT` — exposes the internal `loadFiles` function as
     `window.RotorflightBlackboxOpenFiles` so native code can call into it.
  - **This is a live string-patch at asset-serve time**, not an edit to the
    actual `main.js` file on disk. This is deliberate — it means upstream
    `main.js` can be updated without hand-merging Android patches, as long
    as the marker string still exists. If you need to patch other vendored
    JS files similarly, follow this same pattern rather than editing the
    vendored file directly.
  - **Fragility**: if the marker string `    function loadLogFile(file) {`
    (exact whitespace) ever changes upstream, this silently falls through to
    serving the unpatched file and the app breaks. Worth a comment/TODO if
    you touch this.
- **File import flow**: `ACTION_VIEW` / `ACTION_SEND` / clipboard-data intents
  → `importSharedLog()` copies the picked/shared file into
  `getCacheDir()/imported-logs/blackbox-<nanotime>.bin` on a background
  executor → once the WebView page is ready (`pageReady` flag set in
  `onPageFinished`), calls `window.openRotorflightSharedFile(url, name)` in
  the page via `evaluateJavascript`, pointing at a local
  `https://appassets.androidplatform.net/shared/current` URL served by
  `SharedLogPathHandler`.
- **In-app WebView file picker** (the JS app's own "open file" button, as
  opposed to Android share-into-app): handled via
  `WebChromeClient.onShowFileChooser` → `launchDocumentPicker` →
  `ACTION_OPEN_DOCUMENT`. Selected URIs are handed back directly to the
  WebView's own `filePathCallback` so the page's native `<input type=file>`
  change/loadFiles path fires normally — this does NOT go through the
  cache-copy/`importSharedLog` path. Only the share-intent path copies to
  cache. Know which path you're in before "fixing" file handling.
- **Accepted log file extensions** (`isBlackboxLogName`): `.bbl`, `.txt`,
  `.cfl`, `.bfl`, `.log`. Manifest intent-filters additionally accept MIME
  types `application/octet-stream`, `application/x-blackbox-log`,
  `text/plain`.
- Back button delegates to `webView.goBack()` if history exists.
- `minSdk 24`, `compileSdk`/`targetSdk 36`, Java 17 source/target compat.

## Platform detection layer (index.js)

There's a real, deliberate `RotorflightPlatform` object, not just ad-hoc
patches:

```js
// index.js, near the top
var RotorflightPlatform = detectPlatform();
window.RotorflightPlatform = RotorflightPlatform;

function detectPlatform() {
    var userAgent = window.navigator.userAgent || "";
    var isNwJs = typeof process !== "undefined"
        && process.versions && Boolean(process.versions.nw);
    return {
        android: userAgent.indexOf("RotorflightBlackboxAndroid/") !== -1,
        nwjs: isNwJs,
        browser: !isNwJs,
    };
}
```

`.android` matches the exact UA marker string MainActivity's shim appends
(`RotorflightBlackboxAndroid/<version>`). Several places already gate on this
correctly: `index.js` (multiple `if (RotorflightPlatform.android)` /
`if (!RotorflightPlatform.nwjs)` checks, including around the `nw.gui`
call at line ~459, which is why that call site is *not* actually a live
crash risk despite matching the `require('nw.gui')` grep), plus
`js/android_controls.js` and `js/graph_spectrum.js` (`isAndroid` checks).

**When auditing for Node/NW.js gaps, always check whether a call site is
already gated by `RotorflightPlatform.nwjs`/`.android` before flagging it.**
The grep alone will over-report; tracing the guard is what tells you if it's
real.

## Known-broken / risky features (as of last audit)

1. **Video export** (`js/video_export_dialog.js` +
   `js/flightlog_video_renderer.js` + `library/*/ffmpeg.*`) — no Android
   ffmpeg binary exists. Will fail at runtime. Needs either: hide the
   feature's entry point on Android (check `navigator.userAgent` for the
   `RotorflightBlackboxAndroid/` marker the shim already sets), or find an
   Android-side encoding path (e.g. MediaCodec via a small native bridge) —
   the latter is real native work, not a quick fix.
2. **Only `nw.gui` is shimmed.** `main.js` (3 sites) and `index.js` (1 site,
   ~line 459) call `require('nw.gui')`. No other `require()` calls exist
   outside `js/vendor/` and the android shim as of last audit — re-run the
   grep commands in SKILL.md after any upstream sync, since new NW.js calls
   could be introduced.
3. **`pref_storage.js`** already contains a comment acknowledging the
   Android WebView gap — read it before assuming preferences silently work;
   confirm the fallback path is actually exercised and not just commented as
   intended.
4. **`craft_3d.js` (three.js 3D model rendering)** — architecturally fine in
   a WebView (pure WebGL), but not yet verified for frame-rate/battery
   behavior on real Android hardware. Flag as a UX-pass item, not a
   correctness bug, unless proven otherwise.

## Build system notes

- `android/app/build.gradle.kts` defines a `syncWebAssets` Gradle task
  (type `Sync`) that copies specific paths from the **repo root** (parent of
  `android/`) into `build/generated/webAssets`, which then becomes the
  app's `assets/` source dir. It explicitly `exclude`s `android/**` to avoid
  copying the Android project into its own assets.
- It copies: `index.html`, `index.js`, `changelog.html`, `manifest.json`,
  `css/**`, `images/**`, `js/**`, `locales/**`, `_locales/**`, `resources/**`,
  and specific `node_modules/{bootstrap,html2canvas,lodash,webm-writer}/**`
  paths.
- `doFirst` checks that `node_modules/bootstrap/dist/css/bootstrap.min.css`
  exists and throws a clear `GradleException` telling the user to run
  `yarn install`/`npm install` in the repo root if not. If you see this
  error, that's the fix — don't debug further.
- `versionCode`/`versionName` derive from `GITHUB_RUN_NUMBER` env var
  (defaults to 1 locally) — this is CI-oriented, expect version `0.1.1` in
  local builds.
