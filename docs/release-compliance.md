# Mobile release-compliance checklist

This is an engineering release gate, not legal advice. Internal preview builds
may be used before every public-distribution item is closed, but they must be
clearly labeled as previews and must not be published to an app store.

## Every binary

- [ ] Build from a clean, immutable commit.
- [ ] Create a signed release tag for that commit.
- [ ] Put both the tag and full commit SHA in the release notes.
- [ ] Publish the corresponding source at the same time and keep it available
      at <https://github.com/mbwallace1390/rotorflight-blackbox>.
- [ ] Record the APK/AAB or IPA checksum beside the source tag and commit.
- [ ] Confirm the in-app About & legal screen opens and both source links work.
- [ ] Confirm `LICENSE`, `NOTICE.md`, `THIRD_PARTY_NOTICES.md`, and
      `legal/APACHE-2.0.txt` are present in the packaged application.
- [ ] Confirm release notes describe material changes and do not imply
      Rotorflight endorsement.

Suggested release record:

```text
RotorLens version: <version>
Source tag: <tag>
Source commit: <40-character SHA>
Source URL: https://github.com/mbwallace1390/rotorflight-blackbox/tree/<tag>
Binary SHA-256: <checksum>
```

The source URL must resolve to the exact tag used for the binary. Do not point
only to a moving branch.

## GPL and project identity

- [ ] Keep the root `LICENSE` unchanged and distribute the complete GPLv3 text.
- [ ] Keep original copyright and contributor history intact.
- [ ] Keep `NOTICE.md` current when material mobile changes are added.
- [ ] Use RotorLens branding and the unofficial-project disclaimer; do not use
      upstream logos as the application icon or imply affiliation.
- [ ] Complete a trademark/app-store-name clearance before a production launch.
- [ ] Obtain qualified legal review of the intended iOS/App Store distribution
      path because store terms and GPL obligations require release-specific
      analysis.

## Third-party artifact scan

For each release candidate, generate notices from the dependencies actually
present in the final Android and iOS artifacts. Source `package.json` files are
not enough to prove what a linker, Gradle, CocoaPods, or Metro shipped.

- [ ] Resolve production JavaScript packages from the lockfile and compare them
      with the Metro bundle.
- [ ] Capture the Gradle release dependency graph and inspect merged AAR/JAR
      `META-INF` license and `NOTICE` files.
- [ ] Inspect the built APK/AAB to confirm merged notices were not stripped.
- [ ] On macOS, capture the CocoaPods acknowledgement data and inspect linked
      frameworks/resources in the archive.
- [ ] Add any required license text, copyright notice, attribution, or upstream
      `NOTICE` content to `THIRD_PARTY_NOTICES.md` and the bundled `legal/`
      directory.
- [ ] Re-run the scan whenever a dependency or lockfile changes.

## Legacy viewer provenance still to close

Before public distribution, archive exact upstream license files and versions
for every item in the "Checked-in legacy components requiring release
verification" section of `THIRD_PARTY_NOTICES.md`. In particular, close the
missing standalone notices for noUiSlider, Modernizr/Respond, FileSaver,
three.js/GLTFLoader, and node-semver, and verify the provenance/license of the
Bell 206 model, texture, and motor-order artwork.

Do not fill missing records from memory. Record the upstream URL, immutable tag
or commit, downloaded license text, and checksum used for each decision.

## Platform validation

- [ ] Android release/preview build, unit tests, typecheck, lint, install, file
      picker, Open With, Share, back navigation, and external links pass.
- [ ] iOS build/archive, unit tests, Files picker, cold and warm Open In,
      restoration, external links, license resources, signing, and privacy
      manifest pass on macOS with Xcode.
- [ ] A licensed fixture parses on both platforms with matching metadata and
      time bounds.
- [ ] No network access is required to parse a local log.
- [ ] Large-log memory and device stress tests pass before a production release.
