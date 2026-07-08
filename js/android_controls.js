"use strict";

/* Stable Android analyser touch controls.
 *
 * This intentionally avoids mutation observers, global touch interception,
 * dropdown replacement and resize listeners. It only creates one small
 * analyser panel and handles clicks on its own buttons.
 */
(function () {
    if (!window.RotorflightPlatform || !window.RotorflightPlatform.android) {
        return;
    }

    function installControls() {
        if (document.getElementById("androidAnalyserTouchControls")) {
            return;
        }

        var analyser = document.getElementById("analyser");
        if (!analyser) {
            return;
        }

        var style = document.createElement("style");
        style.id = "android-analyser-touch-controls-style";
        style.textContent = [
            "html.platform-android #androidAnalyserScalePanel,",
            "html.platform-android #androidAnalyserScaleToggle { display:none !important; }",
            "html.platform-android #androidAnalyserTouchControls {",
            "  display:none; position:absolute; z-index:60; pointer-events:auto;",
            "  gap:5px; padding:6px; box-sizing:border-box;",
            "  background:rgba(20,20,20,.90); border:1px solid rgba(255,255,255,.18);",
            "  border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,.45);",
            "}",
            "html.platform-android.has-analyser #androidAnalyserTouchControls { display:flex; }",
            "html.platform-android.has-analyser:not(.has-analyser-fullscreen) #androidAnalyserTouchControls {",
            "  right:6px; bottom:6px; flex-direction:row; align-items:center;",
            "  transform:scale(.82); transform-origin:bottom right;",
            "}",
            "html.platform-android.has-analyser-fullscreen #androidAnalyserTouchControls {",
            "  right:10px; top:50%; width:94px; flex-direction:column;",
            "  transform:translateY(-50%);",
            "}",
            "html.platform-android #androidAnalyserTouchControls button {",
            "  min-width:48px; min-height:42px; padding:7px 9px;",
            "  color:#222; background:#fff; border:1px solid #aaa;",
            "  border-radius:7px; font-size:14px; font-weight:700; line-height:1.1;",
            "}",
            "html.platform-android #androidAnalyserTouchControls button:active,",
            "html.platform-android #androidAnalyserTouchControls button.range-set {",
            "  background:#d8ecff; border-color:#4388c7;",
            "}",
            "html.platform-android #androidAnalyserRangeStatus {",
            "  min-width:70px; padding:3px 2px; color:#fff;",
            "  font-size:11px; line-height:1.35; text-align:center; white-space:nowrap;",
            "}",
            "html.platform-android.has-analyser:not(.has-analyser-fullscreen) #androidAnalyserRangeStatus { display:none; }",
            "@media (orientation:landscape) and (max-height:500px) {",
            "  html.platform-android.has-analyser-fullscreen #androidAnalyserTouchControls {",
            "    right:8px; top:auto; bottom:8px; width:auto;",
            "    flex-direction:row; align-items:center; transform:none;",
            "  }",
            "  html.platform-android.has-analyser-fullscreen #androidAnalyserRangeStatus {",
            "    min-width:96px; text-align:left;",
            "  }",
            "}",
        ].join("\n");
        document.head.appendChild(style);

        var controls = document.createElement("div");
        controls.id = "androidAnalyserTouchControls";
        controls.setAttribute("aria-label", "Analyser range and scale controls");

        var autoButton = document.createElement("button");
        autoButton.type = "button";
        autoButton.textContent = "Auto";
        autoButton.title = "Automatically scale the analyser signal";

        var inButton = document.createElement("button");
        inButton.type = "button";
        inButton.textContent = "Set I";
        inButton.title = "Set analyser range start at the red cursor";

        var outButton = document.createElement("button");
        outButton.type = "button";
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
                autoButton.textContent = "Open analyser";
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

        updateStatus();
        document.documentElement.setAttribute(
            "data-android-controls",
            "stable-analyser-range-100"
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", installControls, { once: true });
    } else {
        installControls();
    }
})();
