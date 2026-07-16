---
name: rotorflight-blackbox-android
description: Use this skill for ANY work on the Rotorflight Blackbox Android app — a WebView-wrapped port of the desktop Rotorflight/Betaflight Blackbox Log Viewer. Trigger this whenever the user mentions "Rotorflight," "Blackbox" (in an Android/mobile context), the blackbox-android-mvp project, log viewer android app, MainActivity.java for a flight-log viewer, WebView shims for nw.gui/NW.js, or blackbox log parsing on Android. Always consult this skill before writing or reviewing code for this project, even for small-seeming fixes — the project has specific architectural constraints (it embeds real desktop JS code in a WebView rather than being a native rewrite) that are easy to violate by accident if you don't know they're there.
---

# Rotorflight Blackbox Android

## What this project actually is

This is **not** a from-scratch native Android app. It's the real, open-source
Rotorflight/Betaflight Blackbox Log Viewer — the same HTML/CSS/JS codebase
that powers the Windows/Mac/Linux desktop app (normally run under NW.js) —
wrapped in a thin native Android shell:

- One `MainActivity.java` hosts a `WebView`
- The web app's own `index.html`/`js/`/`css/` are served locally via
  `WebViewAssetLoader` (not `file://` — this matters, see references)
- The few `require('nw.gui')` calls in the JS get shimmed so the app doesn't
  crash without NW.js present
- File import happens via Android's document picker + share-intents, copying
  logs into app cache and handing them to the web app's existing `loadFiles`
  path

**Do not treat this as "needs a native rewrite" by default.** The blackbox
binary log format (variable-length field encoding, delta/predictor schemes,
per-firmware field defs) is genuinely complex, and the existing
`flightlog_parser.js` / `decoders.js` already implement it correctly and are
kept in sync with upstream Rotorflight firmware. Reimplementing that in
Kotlin from scratch is high-risk, high-effort, and not where the real
Android-specific problems are. Treat the JS parsing/graphing engine as a
trusted vendored dependency. Point native-rewrite energy at the Android
integration layer instead: file access, WebView quirks, missing native
features, touch UX, and large-file performance.

If the user explicitly wants a full native rewrite anyway, that's their
call — but flag the tradeoff (re-deriving a complex binary format, losing
firmware-version compatibility that upstream JS already tracks) before
proceeding.

Read `references/architecture-notes.md` for the full file-by-file map before
making non-trivial changes — it covers exactly which files are
Android-specific vs. vendored-desktop-code, and known trouble spots.

## Priority order for work on this project

Work in this order unless the user directs otherwise — each step de-risks the
next one:

1. **Audit for Node/NW.js API gaps.** Only `nw.gui` is currently shimmed
   (3 call sites, see references). Any other Node/NW-only API hit at runtime
   throws `"Module unavailable on Android"` and breaks that feature silently
   until a user stumbles into it. Grep before assuming — see the audit
   workflow below.
2. **Fix known-broken features.** Chief among them: video export
   (`js/video_export_dialog.js`) depends on bundled `library/*/ffmpeg.*`
   native binaries — there is no Android ffmpeg binary, so this will fail or
   crash. Decide: disable the feature on Android (hide the UI entry point) or
   find an Android-compatible video encoding path. Check
   `references/architecture-notes.md` for other flagged features before
   assuming something works.
3. **Mobile UX pass.** The desktop UI (dense toolbars, hover-dependent
   controls, small drag targets, keyboard shortcuts) was designed for
   mouse+keyboard. Once the app doesn't crash, go through core flows
   (open log → scrub timeline → inspect graphs → export) on a real touch
   device and fix what's actually unusable, rather than redesigning
   speculatively.
4. **Build/test environment.** If not already working, get this solid early
   enough to validate 1–3 as you go — see setup below.

## Audit workflow: finding Node/NW.js gaps

Run this from the project root before trusting any code path is
Android-safe:

```bash
# Any require() call outside vendor/ and the android/ shim itself
grep -rn "require(" js/*.js index.js | grep -v vendor

# Explicit nw.gui / NW.js references
grep -rln "nw\.gui\|require('nw" js/*.js index.js

# Node-only APIs that have no browser equivalent at all
grep -rln "child_process\|require('fs')\|require(\"fs\")\|require('electron')\|require(\"electron\")" js/*.js index.js
```

For every hit outside `js/vendor/`, `android/`, or an already-known shim:
read the surrounding function, then **trace any guard condition back to its
source** before concluding it's a live risk — don't stop at the call site.
This codebase has a real platform-detection layer (`RotorflightPlatform` in
`index.js`, with `.android`/`.nwjs`/`.browser` fields set from
`navigator.userAgent` and `process.versions.nw`) that several call sites
already check correctly. A `require('nw.gui')` guarded by
`RotorflightPlatform.nwjs` is dead code on Android, safely — not a bug.
Only after confirming a call site is actually reachable on Android should you
either (a) shim it in `MainActivity.java`'s JS injection alongside the
existing `nw.gui` shim, (b) feature-flag/hide the UI path using the same
`RotorflightPlatform.android` check the rest of the code already uses, or
(c) confirm it's dead code and move on. Don't just patch the crash — confirm
what the feature was supposed to do and whether losing it is acceptable, and
tell the user which features are affected before silently disabling them.

Also check for platform-native dependencies beyond Node APIs — e.g. anything
under `library/` (per-OS native binaries) or referencing OS-specific paths —
these need the same "shim, hide, or confirm dead" treatment.

## Build & test environment setup

The user does not yet have this working. Key things that trip people up:

- **The web assets must be built before Gradle can run.** The
  `syncWebAssets` Gradle task copies `node_modules/bootstrap`,
  `node_modules/html2canvas`, `node_modules/lodash`, `node_modules/webm-writer`
  from the repo root — these only exist after running `yarn install` (or
  `npm install`) **in the repo root**, not inside `android/`. Gradle will
  throw a clear `GradleException` if this step was skipped — don't mistake
  that for a real build bug.
- **Android Studio**: open the `android/` subfolder as the project root, not
  the repo root — that's where `settings.gradle.kts` lives.
- **No Gradle wrapper is checked in** (no `gradlew`, `gradlew.bat`, or
  `gradle/wrapper/`). Android Studio will usually offer to generate one on
  first open — let it. If working from the command line instead, the user
  needs a system-installed Gradle matching the Android Gradle Plugin version
  in `android/build.gradle.kts`, or run Android Studio's "Generate Gradle
  Wrapper" action first. Don't assume `./gradlew` exists without checking.
- **Node is pinned to 16.x** (`.nvmrc` → `v16.15.1`), and root `package.json`
  deps are old (`bootstrap@~3.4.1`, `gulp-util@3.0.8`, etc.). Installing with
  a modern Node/npm can hit peer-dependency or engine-strict errors that look
  like unrelated failures. If `yarn install`/`npm install` at the repo root
  errors out, check the user's Node version first (`nvm use` if they have
  nvm) before debugging the error message literally.
- **minSdk 24 / compileSdk 36** — check the user's device/emulator meets
  `minSdk`; recommend an emulator running a recent API level for `compileSdk`
  parity.
- **Debugging the WebView content itself**: `WebView.setWebContentsDebuggingEnabled`
  is already wired to `BuildConfig.DEBUG` in `MainActivity.java`, so on a debug
  build you can open `chrome://inspect` on a desktop Chrome connected to the
  same device (via USB debugging) and get full DevTools into the running
  WebView — console, network, DOM. This is the single most useful tool for
  diagnosing "feature X doesn't work on Android" reports, since most bugs in
  this project are JS-side, not Java-side.
- Guide the user through installing Android Studio, accepting SDK licenses,
  and creating/starting an emulator (or enabling USB debugging on a physical
  device) if they haven't done this before — don't assume familiarity, ask
  what platform they're on and go step by step.

## When making changes

- Keep the vendored desktop JS and the Android integration layer clearly
  separated in your head and in diffs. If a fix belongs in the shim/native
  layer (`MainActivity.java`, the JS injection strings, the manifest), don't
  reach into `flightlog_parser.js`/`decoders.js` to work around it — that's
  the trusted, upstream-synced part.
- If you do need to touch the vendored JS (e.g. the `loadFiles` export patch
  pattern already used for `main.js`), prefer the same non-invasive pattern
  MainActivity already uses (string-patching a known marker at asset-serve
  time) over editing the vendored file in place, so future upstream syncs
  don't silently lose the patch. Explain this tradeoff to the user rather
  than picking silently.
- After any fix, state which of the four priority areas it falls under and
  what's left in that area, so the user can track progress across sessions.
