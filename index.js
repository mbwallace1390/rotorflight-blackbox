"use strict";

var RotorflightPlatform = detectPlatform();
window.RotorflightPlatform = RotorflightPlatform;

applyPlatformStyles();
openLinksInExternalBrowserByDefault();

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
