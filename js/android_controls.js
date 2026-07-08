"use strict";

/* Stable Android analyser, graph-panel and visual graph magnifier controls. */
(function () {
    if (!window.RotorflightPlatform || !window.RotorflightPlatform.android) {
        return;
    }

    function installControls() {
        if (document.getElementById("androidAnalyserTouchControls")) {
            return;
        }

        var analyser = document.getElementById("analyser");
        var graphCanvas = document.getElementById("graphCanvas");
        if (!analyser || !graphCanvas) {
            return;
        }

        var style = document.createElement("style");
        style.id = "android-analyser-touch-controls-style";
        style.textContent = [
            "html.platform-android #analyser.android-analyser-fullscreen #androidAnalyserScalePanel,",
            "html.platform-android #analyser.android-analyser-fullscreen #androidAnalyserScaleToggle,",
            "html.platform-android #analyser #androidAnalyserScalePanel,",
            "html.platform-android #analyser #androidAnalyserScaleToggle {",
            "  display:none !important; visibility:hidden !important;",
            "  pointer-events:none !important; width:0 !important; height:0 !important;",
            "  min-width:0 !important; min-height:0 !important; padding:0 !important; margin:0 !important;",
            "}",
            "html.platform-android #androidAnalyserTouchControls {",
            "  display:none; position:absolute; z-index:260; pointer-events:auto;",
            "  gap:5px; padding:6px; box-sizing:border-box;",
            "  background:rgba(20,20,20,.92); border:1px solid rgba(255,255,255,.22);",
            "  border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,.55);",
            "}",
            "html.platform-android.has-analyser #androidAnalyserTouchControls { display:flex; }",
            "html.platform-android.has-analyser:not(.has-analyser-fullscreen) #androidAnalyserTouchControls {",
            "  right:8px; bottom:24px; flex-direction:row; align-items:center;",
            "  transform:scale(.82); transform-origin:bottom right;",
            "}",
            "html.platform-android.has-analyser-fullscreen #androidAnalyserTouchControls {",
            "  position:fixed; right:12px; bottom:calc(140px + env(safe-area-inset-bottom));",
            "  width:auto; flex-direction:row; align-items:center; transform:none;",
            "}",
            "html.platform-android.has-analyser-fullscreen #androidAnalyserTouchControls .android-analyser-range-control,",
            "html.platform-android.has-analyser-fullscreen #androidAnalyserRangeStatus { display:none !important; }",
            "html.platform-android.has-analyser-fullscreen #androidAnalyserTouchControls { padding:5px; }",
            "html.platform-android #androidAnalyserTouchControls button {",
            "  min-width:54px; min-height:44px; padding:7px 9px;",
            "  color:#222; background:#fff; border:1px solid #aaa;",
            "  border-radius:7px; font-size:14px; font-weight:700; line-height:1.1;",
            "}",
            "html.platform-android #androidAnalyserTouchControls button:active,",
            "html.platform-android #androidAnalyserTouchControls button.range-set {",
            "  background:#d8ecff; border-color:#4388c7;",
            "}",
            "html.platform-android #androidAnalyserRangeStatus {",
            "  min-width:76px; padding:3px 2px; color:#fff;",
            "  font-size:11px; line-height:1.35; text-align:center; white-space:nowrap;",
            "}",
            "html.platform-android.has-analyser:not(.has-analyser-fullscreen) #androidAnalyserRangeStatus { display:none; }",
            "html.platform-android #androidGraphPanelClose {",
            "  position:absolute; top:8px; right:8px; z-index:300;",
            "  min-width:112px; min-height:46px; padding:8px 12px;",
            "  color:#222; background:#fff; border:1px solid #999;",
            "  border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.45);",
            "  font-size:15px; font-weight:700; line-height:1.1;",
            "}",
            "html.platform-android #androidGraphPanelClose:active { background:#d8ecff; }",
            "html.platform-android .log-graph { overflow:hidden !important; }",
            "html.platform-android #graphCanvas {",
            "  transform-origin:50% 50%; will-change:transform;",
            "}",
            "html.platform-android .android-main-magnify-panel { flex:0 0 auto; }",
            "html.platform-android #androidGraphMagnifyButton {",
            "  min-height:46px; padding:6px 13px; white-space:nowrap; font-size:16px;",
            "}",
            "html.platform-android #androidGraphMagnifyControls {",
            "  display:none; position:fixed; z-index:420;",
            "  right:12px; bottom:calc(96px + env(safe-area-inset-bottom));",
            "  align-items:center; gap:7px; padding:9px;",
            "  background:rgba(20,20,20,.96); border:1px solid rgba(255,255,255,.25);",
            "  border-radius:12px; box-shadow:0 3px 14px rgba(0,0,0,.65);",
            "}",
            "html.platform-android.android-magnify-controls-open #androidGraphMagnifyControls { display:flex; }",
            "html.platform-android #androidGraphMagnifyControls button {",
            "  min-width:64px; min-height:48px; padding:8px 10px;",
            "  color:#222; background:#fff; border:1px solid #999;",
            "  border-radius:8px; font-size:15px; font-weight:700;",
            "}",
            "html.platform-android #androidGraphMagnifyControls button:active { background:#d8ecff; }",
            "html.platform-android #androidGraphMagnifyReadout {",
            "  min-width:66px; color:#fff; font-size:14px; font-weight:700;",
            "  text-align:center; white-space:nowrap;",
            "}",
            "@media (orientation:portrait) {",
            "  html.platform-android #androidGraphMagnifyControls {",
            "    right:10px; left:10px; justify-content:center;",
            "  }",
            "}",
            "@media (orientation:landscape) and (max-height:500px) {",
            "  html.platform-android.has-analyser-fullscreen #androidAnalyserTouchControls {",
            "    right:calc(60px + env(safe-area-inset-right)); bottom:28px;",
            "  }",
            "  html.platform-android #androidGraphPanelClose {",
            "    top:8px; right:calc(10px + env(safe-area-inset-right));",
            "  }",
            "  html.platform-android #androidGraphMagnifyControls {",
            "    right:calc(72px + env(safe-area-inset-right)); bottom:18px; left:auto;",
            "  }",
            "}",
        ].join("\n");
        document.head.appendChild(style);

        function hideLegacyScaleControls() {
            var legacyPanel = document.getElementById("androidAnalyserScalePanel");
            var legacyToggle = document.getElementById("androidAnalyserScaleToggle");

            if (legacyPanel) {
                legacyPanel.style.setProperty("display", "none", "important");
                legacyPanel.style.setProperty("visibility", "hidden", "important");
                legacyPanel.style.setProperty("pointer-events", "none", "important");
                legacyPanel.setAttribute("aria-hidden", "true");
            }

            if (legacyToggle) {
                legacyToggle.remove();
            }
        }

        hideLegacyScaleControls();
        window.setTimeout(hideLegacyScaleControls, 0);
        window.setTimeout(hideLegacyScaleControls, 250);

        var controls = document.createElement("div");
        controls.id = "androidAnalyserTouchControls";
        controls.setAttribute("aria-label", "Analyser range and scale controls");

        var autoButton = document.createElement("button");
        autoButton.type = "button";
        autoButton.className = "android-analyser-auto-control";
        autoButton.textContent = "Auto";
        autoButton.title = "Automatically scale the analyser signal";

        var inButton = document.createElement("button");
        inButton.type = "button";
        inButton.className = "android-analyser-range-control";
        inButton.textContent = "Set I";
        inButton.title = "Set analyser range start at the red cursor";

        var outButton = document.createElement("button");
        outButton.type = "button";
        outButton.className = "android-analyser-range-control";
        outButton.textContent = "Set O";
        outButton.title = "Set analyser range end at the red cursor";

        var status = document.createElement("div");
        status.id = "androidAnalyserRangeStatus";
        status.innerHTML = "I: full<br>O: full";

        controls.appendChild(autoButton);
        controls.appendChild(inButton);
        controls.appendChild(outButton);
        controls.appendChild(status);
        analyser.appendChild(controls);

        var graphPanel = document.querySelector(".log-graph-config");
        if (graphPanel && !document.getElementById("androidGraphPanelClose")) {
            var graphCloseButton = document.createElement("button");
            graphCloseButton.type = "button";
            graphCloseButton.id = "androidGraphPanelClose";
            graphCloseButton.textContent = "✕ Close graphs";
            graphCloseButton.setAttribute("aria-label", "Close graph setup panel");
            graphPanel.appendChild(graphCloseButton);

            graphCloseButton.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();

                var originalClose = document.querySelector(".log-close-legend-dialog");
                if (originalClose) {
                    $(originalClose).trigger("click");
                } else {
                    $(graphPanel).hide();
                    $(".log-open-legend-dialog").show();
                    $(window).trigger("resize");
                }
            });
        }

        var selectedIn = null;
        var selectedOut = null;

        function currentTimeText() {
            var field = document.querySelector(".graph-time");
            return field && field.value ? field.value : "current";
        }

        function updateStatus() {
            status.innerHTML = "I: " + (selectedIn || "full")
                + "<br>O: " + (selectedOut || "full");
            inButton.classList.toggle("range-set", selectedIn !== null);
            outButton.classList.toggle("range-set", selectedOut !== null);
        }

        function dispatchShortcut(character) {
            var code = character.charCodeAt(0);
            var event = $.Event("keydown");
            event.which = code;
            event.keyCode = code;
            event.altKey = false;
            event.shiftKey = false;
            event.ctrlKey = false;
            event.metaKey = false;
            $(document).trigger(event);
        }

        autoButton.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            var internalAutoButton = document.querySelector(
                "#androidAnalyserScalePanel #androidAnalyserAutoScale"
            );
            if (internalAutoButton) {
                $(internalAutoButton).trigger("click");
                autoButton.textContent = "Scaled";
                window.setTimeout(function () {
                    autoButton.textContent = "Auto";
                }, 700);
            } else {
                autoButton.textContent = "Unavailable";
                window.setTimeout(function () {
                    autoButton.textContent = "Auto";
                }, 900);
            }
        });

        inButton.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            var time = currentTimeText();
            dispatchShortcut("I");
            selectedIn = selectedIn === time ? null : time;
            updateStatus();
        });

        outButton.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            var time = currentTimeText();
            dispatchShortcut("O");
            selectedOut = selectedOut === time ? null : time;
            updateStatus();
        });

        function installMainGraphMagnifier() {
            if (document.getElementById("androidGraphMagnifyButton")) {
                return;
            }

            var zoomPanel = document.querySelector(".log-chart-zoom-panel");
            if (!zoomPanel || !zoomPanel.parentNode) {
                return;
            }

            var zoomButton = document.getElementById("zoom-menu");
            if (zoomButton && zoomButton.firstChild) {
                zoomButton.firstChild.nodeValue = "Time ";
                zoomButton.title = "Time zoom: changes how much time is visible";
            }

            var magnifyPanelItem = document.createElement("li");
            magnifyPanelItem.className = "android-main-magnify-panel";

            var magnifyHeading = document.createElement("h4");
            magnifyHeading.textContent = "Screen";

            var magnifyButton = document.createElement("button");
            magnifyButton.type = "button";
            magnifyButton.id = "androidGraphMagnifyButton";
            magnifyButton.className = "btn btn-default";
            magnifyButton.textContent = "Screen 1.0×";
            magnifyButton.title = "Magnify the rendered graph without changing graph scaling";

            magnifyPanelItem.appendChild(magnifyHeading);
            magnifyPanelItem.appendChild(magnifyButton);
            zoomPanel.parentNode.insertBefore(magnifyPanelItem, zoomPanel.nextSibling);

            var magnifyControls = document.createElement("div");
            magnifyControls.id = "androidGraphMagnifyControls";
            magnifyControls.setAttribute("role", "dialog");
            magnifyControls.setAttribute("aria-label", "Graph screen magnification");

            var lessButton = document.createElement("button");
            lessButton.type = "button";
            lessButton.textContent = "Zoom −";

            var resetButton = document.createElement("button");
            resetButton.type = "button";
            resetButton.textContent = "Reset";

            var moreButton = document.createElement("button");
            moreButton.type = "button";
            moreButton.textContent = "Zoom +";

            var readout = document.createElement("div");
            readout.id = "androidGraphMagnifyReadout";
            readout.textContent = "1.0×";

            var doneButton = document.createElement("button");
            doneButton.type = "button";
            doneButton.textContent = "Done";

            magnifyControls.appendChild(lessButton);
            magnifyControls.appendChild(resetButton);
            magnifyControls.appendChild(moreButton);
            magnifyControls.appendChild(readout);
            magnifyControls.appendChild(doneButton);
            document.body.appendChild(magnifyControls);

            var magnificationLevels = [1, 1.25, 1.5, 2, 2.5, 3, 4];
            var magnificationIndex = 0;
            var magnification = 1;
            var originX = 50;
            var originY = 50;
            var pinchStartDistance = 0;
            var pinchStartMagnification = 1;
            var pinching = false;

            function clamp(value, minimum, maximum) {
                return Math.max(minimum, Math.min(maximum, value));
            }

            function nearestLevelIndex(value) {
                var bestIndex = 0;
                var bestDistance = Infinity;
                for (var index = 0; index < magnificationLevels.length; index++) {
                    var distance = Math.abs(magnificationLevels[index] - value);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestIndex = index;
                    }
                }
                return bestIndex;
            }

            function updateMagnifyUi() {
                var label = magnification.toFixed(magnification % 1 === 0 ? 0 : 2).replace(/\.00$/, "") + "×";
                readout.textContent = label;
                magnifyButton.textContent = "Screen " + label;
            }

            function applyMagnification(value, xPercent, yPercent) {
                magnification = clamp(value, 1, 4);
                magnificationIndex = nearestLevelIndex(magnification);
                if (typeof xPercent === "number") {
                    originX = clamp(xPercent, 0, 100);
                }
                if (typeof yPercent === "number") {
                    originY = clamp(yPercent, 0, 100);
                }

                graphCanvas.style.transformOrigin = originX + "% " + originY + "%";
                graphCanvas.style.transform = magnification === 1
                    ? "none"
                    : "translateZ(0) scale(" + magnification + ")";
                updateMagnifyUi();
            }

            function setMagnifyPanelOpen(open) {
                document.documentElement.classList.toggle("android-magnify-controls-open", Boolean(open));
                magnifyButton.setAttribute("aria-expanded", String(Boolean(open)));
            }

            function touchDistance(first, second) {
                var dx = second.clientX - first.clientX;
                var dy = second.clientY - first.clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }

            function updatePinchOrigin(first, second) {
                var viewport = graphCanvas.parentElement.getBoundingClientRect();
                var midpointX = (first.clientX + second.clientX) / 2;
                var midpointY = (first.clientY + second.clientY) / 2;
                originX = clamp((midpointX - viewport.left) / viewport.width * 100, 0, 100);
                originY = clamp((midpointY - viewport.top) / viewport.height * 100, 0, 100);
            }

            magnifyButton.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                setMagnifyPanelOpen(!document.documentElement.classList.contains("android-magnify-controls-open"));
            });

            lessButton.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                magnificationIndex = Math.max(0, nearestLevelIndex(magnification) - 1);
                applyMagnification(magnificationLevels[magnificationIndex]);
            });

            moreButton.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                magnificationIndex = Math.min(magnificationLevels.length - 1, nearestLevelIndex(magnification) + 1);
                applyMagnification(magnificationLevels[magnificationIndex]);
            });

            resetButton.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                originX = 50;
                originY = 50;
                applyMagnification(1, originX, originY);
            });

            doneButton.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                setMagnifyPanelOpen(false);
            });

            graphCanvas.addEventListener("touchstart", function (event) {
                if (event.touches.length !== 2) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                pinching = true;
                pinchStartDistance = touchDistance(event.touches[0], event.touches[1]);
                pinchStartMagnification = magnification;
                updatePinchOrigin(event.touches[0], event.touches[1]);
            }, { capture: true, passive: false });

            graphCanvas.addEventListener("touchmove", function (event) {
                if (!pinching || event.touches.length < 2) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                var distance = touchDistance(event.touches[0], event.touches[1]);
                updatePinchOrigin(event.touches[0], event.touches[1]);
                applyMagnification(pinchStartMagnification * distance / pinchStartDistance, originX, originY);
            }, { capture: true, passive: false });

            graphCanvas.addEventListener("touchend", function (event) {
                if (!pinching) {
                    return;
                }
                if (event.touches.length < 2) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    pinching = false;
                    magnificationIndex = nearestLevelIndex(magnification);
                }
            }, { capture: true, passive: false });

            graphCanvas.addEventListener("touchcancel", function () {
                pinching = false;
            }, { capture: true, passive: false });

            applyMagnification(1, 50, 50);
        }

        installMainGraphMagnifier();
        updateStatus();
        document.documentElement.setAttribute(
            "data-android-controls",
            "stable-analyser-range-105"
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", installControls, { once: true });
    } else {
        installControls();
    }
})();
