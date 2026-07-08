"use strict";

/* Stability rollback.
 *
 * The experimental Android analyser/control layer introduced a page-wide
 * interaction freeze after a log loaded and prevented the WebView from
 * repainting during rotation. Keep this asset as an intentional no-op while
 * the controls are redesigned without global listeners or mutation observers.
 *
 * Android's established dropdown fallback remains in index.js, so normal file
 * opening and the previously working viewer controls are unaffected.
 */
(function () {
    if (!window.RotorflightPlatform || !window.RotorflightPlatform.android) {
        return;
    }

    document.documentElement.setAttribute("data-android-controls", "stability-rollback-99");
})();
