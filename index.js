"use strict";

var RotorflightPlatform = detectPlatform();
window.RotorflightPlatform = RotorflightPlatform;

applyPlatformStyles();
openLinksInExternalBrowserByDefault();
installAndroidSharedFileBridge();

$(document).ready(function () {
    // Translate to the user-selected language.
    localize();
});

function detectPlatform() {
    var userAgent = window.navigator.userAgent || "";
    var isNwJs = typeof process !== "undefined"
        && process.versions
        && Boolean(process.versions.nw);

    return {
        android: userAgent.indexOf("RotorflightBlackboxAndroid/") !== -1,
        nwjs: isNwJs,
        browser: !isNwJs,
    };
}

function applyPlatformStyles() {
    var root = document.documentElement;

    if (RotorflightPlatform.android) {
        root.classList.add("platform-android");

        var stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = "css/android.css";
        document.head.appendChild(stylesheet);
    } else if (RotorflightPlatform.nwjs) {
        root.classList.add("platform-nwjs");
    } else {
        root.classList.add("platform-browser");
    }
}

function installAndroidSharedFileBridge() {
    if (!RotorflightPlatform.android) {
        return;
    }

    function sleep(delay) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, delay);
        });
    }

    async function deliverFileToViewer(file) {
        var input;

        // main.js registers the normal Rotorflight file-input change handler.
        // Android WebView rejects DataTransfer-based FileList assignment, so
        // temporarily expose the real cached File through the input's files
        // property and dispatch an ordinary change event.
        for (var attempt = 0; attempt < 60; attempt++) {
            input = document.querySelector("input.file-open");

            if (input && window.blackboxLogViewer && document.readyState !== "loading") {
                try {
                    Object.defineProperty(input, "files", {
                        configurable: true,
                        get: function () {
                            return [file];
                        },
                    });

                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    delete input.files;
                    return;
                } catch (error) {
                    try {
                        delete input.files;
                    } catch (cleanupError) {
                        console.warn("Unable to restore Android file input", cleanupError);
                    }
                    throw error;
                }
            }

            await sleep(100);
        }

        throw new Error("Rotorflight log loader is not ready");
    }

    window.openRotorflightSharedFile = async function (url, fileName) {
        try {
            var response = await fetch(url, { cache: "no-store" });
            if (!response.ok) {
                throw new Error("Unable to read shared log (HTTP " + response.status + ")");
            }

            var blob = await response.blob();
            var file = new File([blob], fileName || "BLACKBOX_LOG.BBL", {
                type: blob.type || "application/octet-stream",
                lastModified: Date.now(),
            });

            await deliverFileToViewer(file);
        } catch (error) {
            console.error("Unable to open Android-shared Blackbox log", error);
            alert("Unable to open the shared Blackbox log: " + error.message);
        }
    };
}

function checkForConfiguratorUpdates() {
    // Desktop releases are NW.js packages. Android has its own app version and
    // update path, so the desktop release dialog must not run there.
    if (!RotorflightPlatform.nwjs) {
        return;
    }

    var releaseChecker = new ReleaseChecker(
        "configurator",
        "https://api.github.com/repos/rotorflight/rotorflight-blackbox/releases"
    );

    releaseChecker.loadReleaseData(notifyOutdatedVersion);
}

function notifyOutdatedVersion(releaseData) {
    var storage = window.chrome
        && window.chrome.storage
        && window.chrome.storage.local;

    if (!storage) {
        return;
    }

    storage.get("checkForUnstableVersions", function (result) {
        var showUnstableReleases = false;
        if (result.checkForConfiguratorUnstableVersions) {
            showUnstableReleases = true;
        }

        var versions = releaseData.filter(function (version) {
            var semVerVersion = semver.parse(version.tag_name);
            if (
                semVerVersion
                && (showUnstableReleases || semVerVersion.prerelease.length === 0)
            ) {
                return version;
            }
        }).sort(function (v1, v2) {
            try {
                return semver.compare(v2.tag_name, v1.tag_name);
            } catch (error) {
                return false;
            }
        });

        if (versions.length > 0 && semver.lt(getManifestVersion(), versions[0].tag_name)) {
            GUI.log(chrome.i18n.getMessage(
                "updateNotice",
                [versions[0].tag_name, versions[0].html_url]
            ));
            var dialog = $(".dialogUpdate")[0];
            $(".dialogUpdate-content").html(chrome.i18n.getMessage(
                "updateNotice",
                [versions[0].tag_name, versions[0].html_url]
            ));
            $(".dialogUpdate-closebtn").click(function () {
                dialog.close();
            });
            $(".dialogUpdate-websitebtn").click(function () {
                dialog.close();
                window.open(versions[0].html_url);
            });
            dialog.showModal();
        }
    });
}

checkForConfiguratorUpdates();

function openLinksInExternalBrowserByDefault() {
    if (!RotorflightPlatform.nwjs || typeof require !== "function") {
        return;
    }

    try {
        var gui = require("nw.gui");
        var win = gui.Window.get();
        win.on("new-win-policy", function (frame, url, policy) {
            policy.ignore();
            gui.Shell.openExternal(url);
        });
    } catch (error) {
        console.warn("Unable to initialize NW.js external-link handling", error);
    }
}
