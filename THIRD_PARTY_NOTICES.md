# Third-party notices

This file records licenses verified from files in the checked-out source tree,
installed runtime packages, and resolved Android artifacts. It is bundled with
the mobile application. It is not a substitute for the release-artifact scan
required by `docs/release-compliance.md`.

## Verified runtime components

| Component | Resolved version | License | Verified notice source |
| --- | ---: | --- | --- |
| Bootstrap | 3.4.1 | MIT | `node_modules/bootstrap/LICENSE` |
| html2canvas | 1.4.1 | MIT | `node_modules/html2canvas/LICENSE` |
| Lodash | 4.17.21 | MIT; CC0 for defined documentation samples | `node_modules/lodash/LICENSE` |
| WebM Writer | 0.3.1 | WTFPL (source headers say WTFPLv2) | `node_modules/webm-writer/package.json` and source headers |
| React | 19.2.3 | MIT | `mobile/node_modules/react/LICENSE` |
| React Native | 0.86.2 | MIT | `mobile/node_modules/react-native/LICENSE` |
| react-native-safe-area-context | 5.8.1 | MIT | `mobile/node_modules/react-native-safe-area-context/LICENSE` |
| AndroidX Activity | 1.13.0 | Apache-2.0 | resolved AAR `META-INF/androidx/activity/activity/LICENSE.txt` |
| AndroidX WebKit | 1.16.0 | Apache-2.0 | resolved AAR `META-INF/androidx/webkit/webkit/LICENSE.txt` |
| complex.js and real.js | checked-in revision | BSD-2-Clause | complete headers in `js/complex.js` and `js/real.js` |
| Propwash analysis design | commit `804d3d5dd447c2e6067b02b7e1723aae8a19d5ff` | MIT | pinned upstream `LICENSE` and analysis sources |

### Copyright and attribution notices

- Bootstrap: Copyright (c) 2011-2019 Twitter, Inc.
- html2canvas: Copyright (c) 2012 Niklas von Hertzen.
- Lodash: Copyright OpenJS Foundation and other contributors. Based on
  Underscore.js, copyright Jeremy Ashkenas, DocumentCloud and Investigative
  Reporters & Editors.
- WebM Writer: By Nicholas Sherlock. Based on ideas from Whammy
  (<https://github.com/antimatter15/whammy>).
- React and React Native: Copyright (c) Meta Platforms, Inc. and affiliates.
- react-native-safe-area-context: Copyright (c) 2019 Th3rd Wave.
- AndroidX Activity and AndroidX WebKit: The Android Open Source Project.
- complex.js and real.js: Copyright (c) 2012 Jens Nockert
  <jens@ofmlabs.org>, Jussi Kalliokoski <jussi@ofmlabs.org>.
- Propwash: Copyright (c) 2026 Iteratrix. RotorLens's selected-range
  mechanical analysis adapts the time-alignment and overlapping Hann-spectrum
  design documented in Propwash's `analysis/util.rs` and `analysis/fft.rs` at
  commit `804d3d5dd447c2e6067b02b7e1723aae8a19d5ff`.

The notices above are transcribed from the verified sources in the table.

### MIT license text

The following license text is reproduced from the installed React and React
Native `LICENSE` files and applies to those packages. The same permission and
warranty text accompanies the MIT-licensed packages listed above, together
with their component-specific copyright notices.

> MIT License
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

Lodash additionally states that copyright and related rights for sample code,
as defined in its license, are waived via CC0 1.0:
<https://creativecommons.org/publicdomain/zero/1.0/>.

### BSD-2-Clause license text

The following text is reproduced from `js/complex.js` and `js/real.js`:

> Copyright (c) 2012, Jens Nockert <jens@ofmlabs.org>, Jussi Kalliokoski
> <jussi@ofmlabs.org>. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice,
> this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice,
> this list of conditions and the following disclaimer in the documentation
> and/or other materials provided with the distribution.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
> ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
> LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
> CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
> INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
> CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
> ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
> POSSIBILITY OF SUCH DAMAGE.

### Apache License 2.0

The complete Apache License 2.0 text extracted from both resolved AndroidX AAR
artifacts is included at `legal/APACHE-2.0.txt`.

### WebM Writer license notice

The installed package metadata identifies WebM Writer 0.3.1 as `WTFPL`, and
each shipped source file states: "Released under the WTFPLv2". Those source
headers are retained in the bundle.

## Checked-in legacy components requiring release verification

The viewer also ships older vendored files whose headers identify a license
but do not include a complete standalone license file, or whose exact package
revision is not recorded. Their headers remain intact. Resolve and archive the
exact upstream license/provenance before a public store or production release.

| Checked-in component | Evidence retained in this repository |
| --- | --- |
| jQuery 1.11.3 | Header in `js/vendor/jquery-1.11.3.min.js`: jQuery Foundation copyright and `jquery.org/license` |
| jQuery UI 1.11.4 | Header in `js/vendor/jquery-ui-1.11.4.min.js`: jQuery Foundation copyright; MIT |
| Ben Alman throttle/debounce plugin | Header in `js/vendor/jquery.ba-throttle-debounce.js`: copyright (c) 2010 "Cowboy" Ben Alman; dual MIT/GPL |
| noUiSlider 7.0.9 | Version header in JS and CSS; the checked-in files do not carry a complete license notice |
| Modernizr 2.6.2 bundle | Header identifies MIT & BSD; embedded matchMedia header identifies dual MIT/BSD |
| Respond.js 1.1.0 | Embedded header identifies copyright Scott Jehl and MIT/GPLv2 |
| FileSaver.js | Header identifies Eli Grey and X11/MIT, referring to a missing `LICENSE.md` |
| three.js r126 and GLTFLoader | `three.js` points to `threejs.org/license`; the checked-in GLTFLoader lacks a standalone header |
| node-semver browser bundle | `js/vendor/semver.js` does not retain package version or license metadata |
| Bell 206 model and texture | `resources/models/bell_cw.*` contain no license metadata |
| Motor-order SVG artwork | Files preserve the original Jonathan Hudson public-domain/CC-BY-SA comment; the wording needs provenance review |

This verification debt does not prevent internal preview testing. It is a
public-release gate because this file must not guess at missing versions,
copyright notices, or license choices.

## Release-generated notices still required

Android and iOS release artifacts include transitive native dependencies that
are not completely represented by the direct-source inventory above. Generate
and review an artifact-level license report for every release, then add any
required copyright, attribution, `NOTICE`, and license text before publishing.
