# RotorLens distribution notice

RotorLens is an unofficial mobile viewer compatible with Rotorflight. It is
not affiliated with or endorsed by the Rotorflight project.

This distribution is based on Rotorflight Blackbox Explorer, which is
licensed under the GNU General Public License, version 3 (GPLv3). Original
copyrights remain with the Rotorflight, Betaflight, Cleanflight, and other
contributors. See `LICENSE` for the complete GPLv3 terms and
`THIRD_PARTY_NOTICES.md` for separately licensed components.

Mobile adaptation and additions copyright (c) 2026 Michael Wallace.

## Source and provenance

- Upstream project: <https://github.com/rotorflight/rotorflight-blackbox>
- Public source repository for this mobile distribution:
  <https://github.com/mbwallace1390/rotorflight-blackbox>

Every publicly distributed binary must identify the exact source tag and
commit used to build it. The repository URL alone is not a substitute for
that release-specific record. See `docs/release-compliance.md`.

## Material modifications

The 2026 mobile adaptation includes, among other changes:

- a shared React Native application shell;
- Android and iOS native viewer hosts, file pickers, and incoming-file flows;
- secure local hosting and native-to-viewer handoff for bundled web assets;
- touch, responsive-layout, and mobile platform compatibility changes;
- mobile build, test, fixture, and release automation; and
- RotorLens naming and original mobile branding.

The Git history is the authoritative file-level record of changes. This
notice summarizes the changes and does not replace that history.

## No warranty

This software is provided without warranty, to the extent permitted by
applicable law. The full disclaimer and limitation terms are in `LICENSE` and
the applicable third-party licenses.
