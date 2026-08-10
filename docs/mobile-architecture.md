# Mobile architecture

Status: accepted foundation for the Android and iOS migration.

## Decision

The mobile application will use a shared React Native shell around the existing
Blackbox viewer engine. The parser, analyser, graph renderer, workers, and
high-frequency pointer/animation work remain together inside a trusted WebView.
They will not be rewritten in the React Native JavaScript runtime during the
first migration.

This keeps Android and iOS behavior aligned while allowing the app navigation,
recent-log library, settings, errors, and accessibility work to be shared.

| Layer | Shared | Android | iOS |
| --- | --- | --- | --- |
| App shell | React Native navigation, recents, settings, status, errors | Native presentation hooks | Native presentation hooks |
| Viewer | Existing HTML/JS parser, graphs, workers, Canvas/WebGL | Android WebView host | Swift `WKWebView` host |
| Files | Typed commands and metadata only | Storage Access Framework, intents, cache | Document picker, security-scoped URLs, cache |
| Lifecycle | Pending-open state machine | Activity intents and restoration | Scene URL routing and restoration |
| Export | Request state and progress UI | Native document/share destinations | Native document/share destinations |

## Bridge boundary

Messages crossing the viewer/native boundary use a versioned envelope:

```ts
type MobileMessage = {
    v: 1;
    type: string;
    requestId?: string;
    payload?: unknown;
};
```

The bridge may carry commands, parsed metadata, state changes, progress, and
errors. Raw log bytes, decoded frame arrays, rendered frames, and gesture or
animation-tick traffic stay outside the React Native bridge.

The foundation milestone implements only the narrow native launcher and file
handoff. The versioned metadata/state protocol is defined and unit-tested, but
is not connected to the viewer yet; recents and export progress must not be
presented as implemented until that wiring lands.

All incoming messages must be schema-validated. The native hosts accept bridge
messages only from the bundled viewer's main frame and route web links through
the operating system rather than navigating the trusted viewer.

## Asset hosting

Bundled web assets use document-relative URLs. This is required by Android's
`/assets/` mapping and by the iOS host; root-relative URLs escape those mappings.

- Android keeps the existing secure
  `https://appassets.androidplatform.net/assets/` origin and
  `WebViewAssetLoader` routes.
- iOS first validates a fixed custom `WKURLSchemeHandler` origin for bundled
  assets and tokenized cached logs.
- If Web Workers, storage, fetch, or Blob behavior is incomplete under the iOS
  custom scheme, iOS will use a loopback-only server with a random session
  capability instead. Broad `file://` access is not an acceptable fallback.

## File ownership

Native code owns imported and exported bytes. A picked or externally opened log
is streamed into an app-owned cache snapshot, assigned an opaque token, and then
opened by the viewer through the trusted asset host. Provider URLs and native
filesystem paths are never exposed to web code.

Large CSV exports will be streamed to a native temporary file in bounded chunks
before the platform document picker is shown. Video export remains disabled on
mobile until it has a native bounded-memory encoding path.

Native imports and asset-host responses are streamed, but the legacy web engine
still materializes each log as a full Blob/File and then a full ArrayBuffer.
Large-log memory work and device stress tests therefore remain a release gate.

## Migration sequence

1. Establish licensed and synthetic parser fixtures and fix hosted-asset paths.
2. Add an isolated React Native mobile workspace and typed bridge protocol.
3. Embed the current Android viewer host without regressing picker, Open With,
   Share, filename-extension, external-link, or restored-state behavior.
4. Add the Swift iOS host, Files picker, Open In handling, and the custom-scheme
   compatibility spike.
5. Add native export bridges, performance telemetry, and bounded-memory large-log
   work before enabling additional mobile-only features.

## Required validation

The Node fixture suite, React Native unit checks, and Android compile/build are
automated. The platform behavior below is still a release checklist, not a
claim of current Android/iOS parity.

- The same fixture produces matching firmware metadata and time bounds on
  desktop, Android, and iOS.
- Android tests cover picker and incoming intent flows.
- iOS tests cover Files, cold/warm Open In, security-scoped access, and scene
  restoration.
- Asset-host tests cover relative scripts, models, workers, worker imports,
  local storage, Canvas, WebGL, fetch, and Blob/File behavior.
- No network access is required to parse a local log.

Android can be developed and validated from Windows. Shared TypeScript and Swift
source can also be prepared there, but an iOS build, simulator test, signing, and
WebKit compatibility validation require macOS with Xcode (locally or in CI).
