"use strict";

(function () {
    if (!window.RotorflightPlatform || !window.RotorflightPlatform.android) {
        return;
    }

    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
        viewport.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
    }

    if (!document.querySelector('link[href="css/android_edge_to_edge.css"]')) {
        var edgeStylesheet = document.createElement("link");
        edgeStylesheet.rel = "stylesheet";
        edgeStylesheet.href = "css/android_edge_to_edge.css";
        document.head.appendChild(edgeStylesheet);
    }

    var activeSheet = null;

    function findSelect(target) {
        if (!target) {
            return null;
        }
        if (target.tagName === "SELECT") {
            return target;
        }
        return target.closest ? target.closest("select") : null;
    }

    function getSelectTitle(select) {
        var labelledBy = select.getAttribute("aria-labelledby");
        if (labelledBy) {
            var labelledElement = document.getElementById(labelledBy);
            if (labelledElement && labelledElement.textContent.trim()) {
                return labelledElement.textContent.trim();
            }
        }

        var row = select.closest ? select.closest("tr") : null;
        if (row) {
            var heading = row.querySelector("th, label");
            if (heading && heading.textContent.trim()) {
                return heading.textContent.trim();
            }
        }

        var group = select.closest ? select.closest(".form-group, .position, td, .spacer_box") : null;
        if (group) {
            var label = group.querySelector("label, .control-label, th");
            if (label && label.textContent.trim()) {
                return label.textContent.trim();
            }
        }

        return select.getAttribute("title") || select.name || "Choose an option";
    }

    function closeSheet() {
        if (!activeSheet) {
            return;
        }
        activeSheet.remove();
        activeSheet = null;
        document.documentElement.classList.remove("android-select-open");
    }

    function applySelection(select, index) {
        select.selectedIndex = index;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeSheet();
        select.focus();
    }

    function openSheet(select) {
        closeSheet();

        var backdrop = document.createElement("div");
        backdrop.className = "android-select-backdrop";
        backdrop.setAttribute("role", "presentation");

        var sheet = document.createElement("div");
        sheet.className = "android-select-sheet";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");

        var header = document.createElement("div");
        header.className = "android-select-header";

        var title = document.createElement("div");
        title.className = "android-select-title";
        title.textContent = getSelectTitle(select);

        var cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "android-select-cancel";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", function (event) {
            event.preventDefault();
            closeSheet();
        });

        header.appendChild(title);
        header.appendChild(cancel);

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

            var text = option.textContent.trim();
            button.textContent = text || "(blank)";

            if (index === select.selectedIndex) {
                button.classList.add("selected");
            }

            button.addEventListener("click", function (event) {
                event.preventDefault();
                if (!button.disabled) {
                    applySelection(select, index);
                }
            });

            options.appendChild(button);
        });

        sheet.appendChild(header);
        sheet.appendChild(options);
        backdrop.appendChild(sheet);
        document.body.appendChild(backdrop);
        activeSheet = backdrop;
        document.documentElement.classList.add("android-select-open");

        backdrop.addEventListener("click", function (event) {
            if (event.target === backdrop) {
                closeSheet();
            }
        });

        var selectedButton = options.querySelector(".android-select-option.selected");
        if (selectedButton) {
            window.setTimeout(function () {
                selectedButton.scrollIntoView({ block: "center" });
            }, 0);
        }
    }

    function installAnalyserControlToggle() {
        var analyser = document.getElementById("analyser");
        var scalePanel = document.getElementById("androidAnalyserScalePanel");

        if (!analyser || !scalePanel) {
            return;
        }

        var toggle = document.getElementById("androidAnalyserScaleToggle");
        if (!toggle) {
            toggle = document.createElement("button");
            toggle.type = "button";
            toggle.id = "androidAnalyserScaleToggle";
            toggle.setAttribute("aria-controls", "androidAnalyserScalePanel");
            analyser.appendChild(toggle);

            toggle.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                setAnalyserScaleCollapsed(analyser, toggle, !analyser.classList.contains("android-analyser-scale-collapsed"));
            });
        }

        var fullscreen = analyser.classList.contains("android-analyser-fullscreen");
        var previousFullscreen = analyser.dataset.androidScaleFullscreen === "true";
        analyser.dataset.androidScaleFullscreen = String(fullscreen);

        if (fullscreen && !previousFullscreen) {
            setAnalyserScaleCollapsed(analyser, toggle, true);
        } else {
            updateAnalyserScaleToggle(analyser, toggle);
        }

        var autoScale = document.getElementById("androidAnalyserAutoScale");
        if (autoScale && autoScale.dataset.androidCollapseBound !== "true") {
            autoScale.dataset.androidCollapseBound = "true";
            autoScale.addEventListener("click", function () {
                window.setTimeout(function () {
                    setAnalyserScaleCollapsed(analyser, toggle, true);
                }, 0);
            });
        }
    }

    function setAnalyserScaleCollapsed(analyser, toggle, collapsed) {
        analyser.classList.toggle("android-analyser-scale-collapsed", Boolean(collapsed));
        updateAnalyserScaleToggle(analyser, toggle);
    }

    function updateAnalyserScaleToggle(analyser, toggle) {
        var collapsed = analyser.classList.contains("android-analyser-scale-collapsed");
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.textContent = collapsed ? "Scale controls" : "Hide scale";
    }

    function watchAnalyserControls() {
        installAnalyserControlToggle();

        var observer = new MutationObserver(function () {
            installAnalyserControlToggle();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", watchAnalyserControls, { once: true });
    } else {
        watchAnalyserControls();
    }

    document.addEventListener("click", function (event) {
        var select = findSelect(event.target);
        if (!select || select.disabled || select.multiple || select.size > 1) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        openSheet(select);
    }, true);

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeSheet();
        }
    });
})();
