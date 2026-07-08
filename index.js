"use strict";

var RotorflightPlatform = detectPlatform();
window.RotorflightPlatform = RotorflightPlatform;

applyPlatformStyles();
installAndroidControlFallbacks();
openLinksInExternalBrowserByDefault();
installAndroidSharedFileBridge();

$(document).ready(function () {
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
        var androidAssetVersion = "97";
        root.classList.add("platform-android");
        root.setAttribute("data-android-layout-version", androidAssetVersion);

        var stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = "css/android.css?v=" + androidAssetVersion;
        document.head.appendChild(stylesheet);

        var controlsStylesheet = document.createElement("link");
        controlsStylesheet.rel = "stylesheet";
        controlsStylesheet.href = "css/android_controls.css?v=" + androidAssetVersion;
        document.head.appendChild(controlsStylesheet);

        /* android_controls.js contains the analyser quick-control rail,
         * safe-area fixes and current device-specific stylesheet loader. It
         * was previously packaged but never loaded. */
        var controlsScript = document.createElement("script");
        controlsScript.src = "js/android_controls.js?v=" + androidAssetVersion;
        controlsScript.async = false;
        document.head.appendChild(controlsScript);
    } else if (RotorflightPlatform.nwjs) {
        root.classList.add("platform-nwjs");
    } else {
        root.classList.add("platform-browser");
    }
}

function installAndroidControlFallbacks() {
    if (!RotorflightPlatform.android) {
        return;
    }

    var activeOverlay = null;
    var activeDropdown = null;
    var pendingControl = null;
    var suppressClickUntil = 0;

    function closest(element, selector) {
        return element && element.closest ? element.closest(selector) : null;
    }

    function getControl(target) {
        var select = closest(target, "select");
        if (select && !select.disabled && !select.multiple && select.size <= 1) {
            return { type: "select", element: select };
        }

        var toggle = closest(target, ".dropdown-toggle");
        if (toggle && !toggle.disabled) {
            return { type: "dropdown", element: toggle };
        }

        return null;
    }

    function stopEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    function createOverlay(titleText, sheetClass) {
        var backdrop = document.createElement("div");
        backdrop.className = "android-control-backdrop";
        backdrop.setAttribute("role", "presentation");

        var sheet = document.createElement("div");
        sheet.className = "android-control-sheet " + sheetClass;
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");

        var header = document.createElement("div");
        header.className = "android-control-header";

        var title = document.createElement("div");
        title.className = "android-control-title";
        title.textContent = titleText || "Choose an option";

        var cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "android-control-cancel";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", function (event) {
            event.preventDefault();
            closeOverlay();
        });

        header.appendChild(title);
        header.appendChild(cancel);
        sheet.appendChild(header);
        backdrop.appendChild(sheet);
        document.body.appendChild(backdrop);

        backdrop.addEventListener("click", function (event) {
            if (event.target === backdrop) {
                closeOverlay();
            }
        });

        activeOverlay = backdrop;
        document.documentElement.classList.add("android-control-open");
        return sheet;
    }

    function closeOverlay() {
        if (activeDropdown) {
            var menu = activeDropdown.menu;
            menu.classList.remove("android-dropdown-menu-active");

            if (activeDropdown.originalStyle === null) {
                menu.removeAttribute("style");
            } else {
                menu.setAttribute("style", activeDropdown.originalStyle);
            }

            if (
                activeDropdown.nextSibling
                && activeDropdown.nextSibling.parentNode === activeDropdown.originalParent
            ) {
                activeDropdown.originalParent.insertBefore(menu, activeDropdown.nextSibling);
            } else {
                activeDropdown.originalParent.appendChild(menu);
            }

            activeDropdown.dropdown.classList.remove("open");
            activeDropdown = null;
        }

        if (activeOverlay) {
            activeOverlay.remove();
            activeOverlay = null;
        }

        document.documentElement.classList.remove("android-control-open");
    }

    function getSelectTitle(select) {
        var row = closest(select, "tr");
        if (row) {
            var heading = row.querySelector("th, label");
            if (heading && heading.textContent.trim()) {
                return heading.textContent.trim();
            }
        }

        var group = closest(select, ".form-group, .position, td, .spacer_box");
        if (group) {
            var label = group.querySelector("label, .control-label, th");
            if (label && label.textContent.trim()) {
                return label.textContent.trim();
            }
        }

        return select.getAttribute("title") || select.name || "Choose an option";
    }

    function openSelect(select) {
        closeOverlay();
        var sheet = createOverlay(getSelectTitle(select), "android-select-sheet");
        var options = document.createElement("div");
        options.className = "android-select-options";
        options.setAttribute("role", "listbox");

        Array.prototype.forEach.call(select.options, function (option, index) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "android-select-option";
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", index === select.selectedIndex ? "true" : "false");
            button.disabled = option.disabled;
            button.textContent = option.textContent.trim() || "(blank)";

            if (index === select.selectedIndex) {
                button.classList.add("selected");
            }

            button.addEventListener("click", function (event) {
                event.preventDefault();
                if (button.disabled) {
                    return;
                }

                select.selectedIndex = index;
                select.dispatchEvent(new Event("input", { bubbles: true }));
                select.dispatchEvent(new Event("change", { bubbles: true }));
                closeOverlay();
                select.focus();
            });

            options.appendChild(button);
        });

        sheet.appendChild(options);

        var selectedButton = options.querySelector(".android-select-option.selected");
        if (selectedButton) {
            window.setTimeout(function () {
                selectedButton.scrollIntoView({ block: "center" });
            }, 0);
        }
    }

    function directDropdownMenu(dropdown) {
        for (var index = 0; index < dropdown.children.length; index++) {
            var child = dropdown.children[index];
            if (child.classList && child.classList.contains("dropdown-menu")) {
                return child;
            }
        }
        return null;
    }

    function getDropdownTitle(toggle) {
        var text = toggle.textContent.replace(/\s+/g, " ").trim();
        return text || toggle.getAttribute("title") || "Choose an option";
    }

    function openDropdown(toggle) {
        closeOverlay();

        var dropdown = closest(toggle, ".dropdown");
        if (!dropdown) {
            return;
        }

        var menu = directDropdownMenu(dropdown);
        if (!menu) {
            return;
        }

        var originalParent = menu.parentNode;
        var nextSibling = menu.nextSibling;
        var originalStyle = menu.getAttribute("style");
        var sheet = createOverlay(getDropdownTitle(toggle), "android-dropdown-sheet");
        var host = document.createElement("div");
        host.className = "android-dropdown-host";

        activeDropdown = {
            dropdown: dropdown,
            menu: menu,
            originalParent: originalParent,
            nextSibling: nextSibling,
            originalStyle: originalStyle,
        };

        dropdown.classList.remove("open");
        menu.classList.add("android-dropdown-menu-active");
        host.appendChild(menu);
        sheet.appendChild(host);

        menu.addEventListener("click", function closeAfterChoice(event) {
            var choice = closest(event.target, "a, button");
            if (!choice || choice.disabled || choice.classList.contains("dropdown-toggle")) {
                return;
            }

            window.setTimeout(closeOverlay, 0);
        }, { once: true });
    }

    function activateControl(control) {
        if (control.type === "select") {
            openSelect(control.element);
        } else {
            openDropdown(control.element);
        }
    }

    document.addEventListener("touchstart", function (event) {
        var control = getControl(event.target);
        if (!control) {
            pendingControl = null;
            return;
        }

        pendingControl = control;
        stopEvent(event);
    }, { capture: true, passive: false });

    document.addEventListener("touchend", function (event) {
        if (!pendingControl) {
            return;
        }

        var control = pendingControl;
        pendingControl = null;
        suppressClickUntil = Date.now() + 700;
        stopEvent(event);
        activateControl(control);
    }, { capture: true, passive: false });

    document.addEventListener("click", function (event) {
        var control = getControl(event.target);
        if (!control) {
            return;
        }

        stopEvent(event);
        if (Date.now() < suppressClickUntil) {
            return;
        }

        activateControl(control);
    }, true);

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeOverlay();
        }
    });
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
        for (var attempt = 0; attempt < 100; attempt++) {
            if (typeof window.RotorflightBlackboxOpenFiles === "function") {
                window.RotorflightBlackboxOpenFiles([file]);
                return;
            }

            await sleep(100);
        }

        throw new Error("Rotorflight parser entry point is not ready");
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
