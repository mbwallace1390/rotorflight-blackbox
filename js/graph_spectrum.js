"use strict";

function FlightLogAnalyser(flightLog, canvas, analyserCanvas) {

    const
        ANALYSER_LARGE_LEFT_MARGIN = 10,
        ANALYSER_LARGE_TOP_MARGIN = 10,
        ANALYSER_LARGE_HEIGHT_MARGIN = 20,
        ANALYSER_LARGE_WIDTH_MARGIN = 20,
        ANDROID_MAX_SIGNAL_GAIN = 20000,
        DEFAULT_ZOOM = 100;

    var
        that = this,

        analyserZoomX = 1.0, /* 100% */
        analyserZoomY = 1.0, /* 100% */

        dataBuffer = {
            fieldIndex: 0,
            curve: 0,
            fieldName: null
        },

        dataReload = false,
        fftData = null,
        isAndroid = Boolean(window.RotorflightPlatform && window.RotorflightPlatform.mobile),
        prefs = new PrefStorage();

    try {
        var isFullscreen = false;
        var initialAutoScalePending = false;
        var initialZoomX = DEFAULT_ZOOM;
        var initialZoomY = DEFAULT_ZOOM;
        var sysConfig = flightLog.getSysConfig();

        GraphSpectrumCalc.initialize(flightLog, sysConfig);
        GraphSpectrumPlot.initialize(analyserCanvas, sysConfig);

        var analyserParent = $(analyserCanvas).parent();
        var analyserZoomXElem = $("#analyserZoomX");
        var analyserZoomYElem = $("#analyserZoomY");
        var spectrumToolbarElem = $("#spectrumToolbar");
        var spectrumTypeElem = $("#spectrumTypeSelect");
        var overdrawSpectrumTypeElem = $("#overdrawSpectrumTypeSelect");
        var mobileScalePanel = null;
        var analyserZoomXValueElem = null;
        var analyserZoomYValueElem = null;
        var autoScaleButton = null;
        var scaleToggleButton = null;

        if (isAndroid) {
            analyserParent.find("#androidAnalyserScalePanel").remove();
            analyserParent.removeClass("android-analyser-fullscreen");
            spectrumToolbarElem.addClass("non-shift");

            spectrumTypeElem.attr("title", "Spectrum type");
            overdrawSpectrumTypeElem.attr("title", "Filter display");

            analyserZoomYElem.attr({
                max: ANDROID_MAX_SIGNAL_GAIN,
                step: 10
            });

            var storedZoomX = Number(userSettings.androidAnalyserZoomX);
            var storedZoomY = Number(userSettings.androidAnalyserZoomY);
            var minZoomX = Number(analyserZoomXElem.attr("min"));
            var maxZoomX = Number(analyserZoomXElem.attr("max"));
            var minZoomY = Number(analyserZoomYElem.attr("min"));
            var maxZoomY = Number(analyserZoomYElem.attr("max"));
            var storedScaleIsValid = Number.isFinite(storedZoomX)
                && Number.isFinite(storedZoomY)
                && storedZoomX >= minZoomX
                && storedZoomX <= maxZoomX
                && storedZoomY >= minZoomY
                && storedZoomY <= maxZoomY;

            if (storedScaleIsValid) {
                initialZoomX = storedZoomX;
                initialZoomY = storedZoomY;
            } else {
                initialAutoScalePending = true;
            }

            mobileScalePanel = $('<div id="androidAnalyserScalePanel"></div>');

            var xControl = $('<label class="android-analyser-scale-control"><span>Frequency range</span></label>');
            analyserZoomXValueElem = $("<output>100%</output>");
            xControl.append(analyserZoomXElem).append(analyserZoomXValueElem);

            var yControl = $('<label class="android-analyser-scale-control"><span>Signal gain</span></label>');
            analyserZoomYValueElem = $("<output>1.0×</output>");
            yControl.append(analyserZoomYElem).append(analyserZoomYValueElem);

            autoScaleButton = $('<button type="button" id="androidAnalyserAutoScale">Auto scale</button>');
            scaleToggleButton = $('<button type="button" id="androidAnalyserScaleToggle" aria-controls="androidAnalyserScalePanel">Scale controls</button>');

            mobileScalePanel.append(xControl, yControl, autoScaleButton);
            analyserParent.append(mobileScalePanel, scaleToggleButton);

            scaleToggleButton.on("click", function(event) {
                event.preventDefault();
                event.stopPropagation();
                setMobileScalePanelCollapsed(!analyserParent.hasClass("android-analyser-scale-collapsed"));
            });

            setMobileScalePanelCollapsed(true);
        }

        analyserZoomXElem.val(initialZoomX);
        analyserZoomYElem.val(initialZoomY);
        analyserZoomX = initialZoomX / 100;
        analyserZoomY = 100 / initialZoomY;
        GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);

        this.setFullscreen = function(size) {
            isFullscreen = size === true;
            GraphSpectrumPlot.setFullScreen(isFullscreen);

            if (isAndroid) {
                analyserParent.toggleClass("android-analyser-fullscreen", isFullscreen);
                document.documentElement.classList.toggle("has-analyser-fullscreen", isFullscreen);
                setMobileScalePanelCollapsed(true);
            }

            that.resize();
            that.refresh();
        };

        this.setInTime = function(time) {
            dataReload = true;
            return GraphSpectrumCalc.setInTime(time);
        };

        this.setOutTime = function(time) {
            dataReload = true;
            return GraphSpectrumCalc.setOutTime(time);
        };

        var getSize = function() {
            if (isFullscreen) {
                if (isAndroid) {
                    return {
                        height: Math.max(1, canvas.clientHeight - 16),
                        width: Math.max(1, canvas.clientWidth - 16),
                        left: 8,
                        top: 8
                    };
                }

                return {
                    height: canvas.clientHeight - ANALYSER_LARGE_HEIGHT_MARGIN,
                    width: canvas.clientWidth - ANALYSER_LARGE_WIDTH_MARGIN,
                    left: ANALYSER_LARGE_LEFT_MARGIN,
                    top: ANALYSER_LARGE_TOP_MARGIN
                };
            }

            if (isAndroid) {
                var portrait = window.innerHeight >= window.innerWidth;
                var widthRatio = portrait ? 0.92 : 0.48;
                var heightRatio = portrait ? 0.34 : 0.56;
                var width = Math.max(1, canvas.clientWidth * widthRatio);
                var height = Math.max(1, canvas.clientHeight * heightRatio);

                return {
                    height: height,
                    width: width,
                    left: canvas.clientWidth * (portrait ? 0.04 : 0.02),
                    top: Math.max(4, canvas.clientHeight - height - 8)
                };
            }

            var analyserSize = parseInt(userSettings.analyser.size);

            return {
                height: canvas.height * analyserSize / 100.0,
                width: canvas.width * analyserSize / 100.0,
                left: canvas.width * parseInt(userSettings.analyser.left) / 100.0,
                top: canvas.height * parseInt(userSettings.analyser.top) / 100.0
            };
        };

        this.resize = function() {
            var newSize = getSize();

            GraphSpectrumPlot.setSize(newSize.width, newSize.height);

            analyserParent.css({
                left: newSize.left + "px",
                top: newSize.top + "px",
                width: newSize.width + "px",
                height: newSize.height + "px"
            });

            $(analyserCanvas).css({
                left: "0px",
                top: "0px"
            });

            if (isAndroid) {
                analyserParent.toggleClass("android-analyser-fullscreen", isFullscreen);
                analyserZoomXElem.css({ left: "", top: "" });
                analyserZoomYElem.css({ left: "", top: "" });
                $("#analyserResize", analyserParent).css({ left: "", top: "" });
            } else {
                $("input:first-of-type", analyserParent).css({
                    left: newSize.width - 130 + "px"
                });
                $("input:last-of-type", analyserParent).css({
                    left: newSize.width - 20 + "px"
                });
                $("#analyserResize", analyserParent).css({
                    left: newSize.width - 28 + "px"
                });
            }
        };

        function setMobileScalePanelCollapsed(collapsed) {
            if (!isAndroid || !scaleToggleButton) {
                return;
            }

            analyserParent.toggleClass("android-analyser-scale-collapsed", Boolean(collapsed));
            scaleToggleButton.attr("aria-expanded", String(!collapsed));
            scaleToggleButton.text(collapsed ? "Scale controls" : "Hide scale");
        }

        function updateMobileScaleLabels() {
            if (!isAndroid) {
                return;
            }

            analyserZoomXValueElem.text(analyserZoomXElem.val() + "%");
            analyserZoomYValueElem.text((parseFloat(analyserZoomYElem.val()) / 100).toFixed(1) + "×");
        }

        function saveAndroidScale() {
            if (!isAndroid) {
                return;
            }

            var storedZoomX = Number(analyserZoomXElem.val());
            var storedZoomY = Number(analyserZoomYElem.val());

            userSettings.androidAnalyserZoomX = storedZoomX;
            userSettings.androidAnalyserZoomY = storedZoomY;

            prefs.get("userSettings", function(data) {
                data = data || {};
                data.androidAnalyserZoomX = storedZoomX;
                data.androidAnalyserZoomY = storedZoomY;
                prefs.set("userSettings", data);
            });
        }

        function getVisibleSpectrumMaximum() {
            if (!fftData) {
                return 0;
            }

            if (userSettings.spectrumType === SPECTRUM_TYPE.FREQ_VS_THROTTLE) {
                return Number(fftData.maxNoise) || 0;
            }

            if (userSettings.spectrumType !== SPECTRUM_TYPE.FREQUENCY || !fftData.fftOutput) {
                return 0;
            }

            var visibleLength = Math.min(
                fftData.fftOutput.length,
                Math.max(1, Math.floor(fftData.fftLength / analyserZoomX))
            );
            var maxFrequency = fftData.blackBoxRate / 2;
            var startIndex = Math.max(1, Math.floor(20 / maxFrequency * fftData.fftLength));
            var maxValue = 0;

            for (var index = startIndex; index < visibleLength; index++) {
                var value = Number(fftData.fftOutput[index]);
                if (Number.isFinite(value) && value > maxValue) {
                    maxValue = value;
                }
            }

            return maxValue;
        }

        function autoScaleSignal() {
            if (!isAndroid || userSettings.spectrumType === SPECTRUM_TYPE.PIDERROR_VS_SETPOINT) {
                return false;
            }

            var maxValue = getVisibleSpectrumMaximum();
            if (!Number.isFinite(maxValue) || maxValue <= 0) {
                return false;
            }

            var portrait = window.innerHeight >= window.innerWidth;
            var targetHeight = portrait ? 0.54 : 0.66;
            var signalGain = targetHeight * 10000 / maxValue;
            signalGain = Math.round(signalGain / 10) * 10;
            signalGain = constrain(signalGain, 10, ANDROID_MAX_SIGNAL_GAIN);

            analyserZoomYElem.val(signalGain);
            analyserZoomY = 100 / signalGain;
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            updateMobileScaleLabels();
            saveAndroidScale();
            that.refresh();
            return true;
        }

        var dataLoad = function() {
            GraphSpectrumCalc.setDataBuffer(dataBuffer);

            switch (userSettings.spectrumType) {
                case SPECTRUM_TYPE.FREQ_VS_THROTTLE:
                    fftData = GraphSpectrumCalc.dataLoadFrequencyVsThrottle();
                    break;

                case SPECTRUM_TYPE.PIDERROR_VS_SETPOINT:
                    fftData = GraphSpectrumCalc.dataLoadPidErrorVsSetpoint();
                    break;

                case SPECTRUM_TYPE.FREQUENCY:
                default:
                    fftData = GraphSpectrumCalc.dataLoadFrequency();
                    break;
            }
        };

        /* This function is called from the canvas drawing routines within grapher.js.
         * It records the current curve positions, collects the data and draws the analyser. */
        this.plotSpectrum = function(fieldIndex, curve, fieldName) {
            dataBuffer = {
                fieldIndex: fieldIndex,
                curve: curve,
                fieldName: fieldName
            };

            if ((fftData == null) || (fieldIndex != fftData.fieldIndex) || dataReload) {
                dataReload = false;
                dataLoad();
                GraphSpectrumPlot.setData(fftData, userSettings.spectrumType);

                if (initialAutoScalePending) {
                    initialAutoScalePending = false;
                    autoScaleSignal();
                }
            }

            that.draw();
        };

        this.destroy = function() {
            $(analyserCanvas).off("mousemove", trackFrequency);
            $(analyserCanvas).off("touchmove", trackFrequency);
            if (isAndroid) {
                $(window).off(".androidAnalyser");
            }
        };

        this.refresh = function() {
            that.draw();
        };

        this.draw = function() {
            // Resizing/fullscreen setup happens before a field is selected.
            // Do not ask the plotter to read FFT metadata until dataLoad has
            // produced a spectrum for the first visible graph field.
            if (fftData) {
                GraphSpectrumPlot.draw();
            }
        };

        $(analyserCanvas).on("mousemove", function(e) {
            trackFrequency(e, that);
        });
        $(analyserCanvas).on("touchmove", function(e) {
            trackFrequency(e, that);
        });

        analyserZoomXElem.on("input", $.debounce(100, function() {
            analyserZoomX = analyserZoomXElem.val() / 100;
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            updateMobileScaleLabels();

            if (isAndroid) {
                saveAndroidScale();
            }

            that.refresh();
        })).dblclick(function() {
            $(this).val(DEFAULT_ZOOM).trigger("input");
        });

        analyserZoomYElem.on("input", $.debounce(100, function() {
            analyserZoomY = 1 / (analyserZoomYElem.val() / 100);
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            updateMobileScaleLabels();

            if (isAndroid) {
                saveAndroidScale();
            }

            that.refresh();
        })).dblclick(function() {
            $(this).val(DEFAULT_ZOOM).trigger("input");
        });

        if (isAndroid) {
            autoScaleButton.on("click", function(event) {
                event.preventDefault();
                autoScaleSignal();
                setMobileScalePanelCollapsed(true);
            });

            $(window)
                .off("resize.androidAnalyser orientationchange.androidAnalyser")
                .on("resize.androidAnalyser orientationchange.androidAnalyser", $.debounce(220, function() {
                    that.resize();
                    that.refresh();
                }));

            updateMobileScaleLabels();
        }

        userSettings.spectrumType = userSettings.spectrumType || SPECTRUM_TYPE.FREQUENCY;
        spectrumTypeElem.val(userSettings.spectrumType);

        spectrumTypeElem.change(function() {
            var optionSelected = parseInt(spectrumTypeElem.val(), 10);

            if (optionSelected != userSettings.spectrumType) {
                userSettings.spectrumType = optionSelected;
                saveOneUserSetting("spectrumType", userSettings.spectrumType);

                dataReload = true;
                that.plotSpectrum(dataBuffer.fieldIndex, dataBuffer.curve, dataBuffer.fieldName);
            }

            const pidErrorVsSetpointSelected = optionSelected === SPECTRUM_TYPE.PIDERROR_VS_SETPOINT;

            if (isAndroid) {
                overdrawSpectrumTypeElem.parent().toggle(!pidErrorVsSetpointSelected);
                mobileScalePanel.toggleClass("pid-error-mode", pidErrorVsSetpointSelected);
            } else {
                overdrawSpectrumTypeElem.toggle(!pidErrorVsSetpointSelected);
            }

            analyserZoomYElem.toggleClass("onlyFullScreenException", pidErrorVsSetpointSelected);
        }).change();

        userSettings.overdrawSpectrumType = userSettings.overdrawSpectrumType || SPECTRUM_OVERDRAW_TYPE.ALL_FILTERS;
        overdrawSpectrumTypeElem.val(userSettings.overdrawSpectrumType);
        GraphSpectrumPlot.setOverdraw(userSettings.overdrawSpectrumType);

        overdrawSpectrumTypeElem.change(function() {
            var optionSelected = parseInt(overdrawSpectrumTypeElem.val(), 10);

            if (optionSelected != userSettings.overdrawSpectrumType) {
                userSettings.overdrawSpectrumType = optionSelected;
                saveOneUserSetting("overdrawSpectrumType", userSettings.overdrawSpectrumType);

                GraphSpectrumPlot.setOverdraw(userSettings.overdrawSpectrumType);
                that.draw();
            }
        });

        var lastMouseX = 0,
            lastMouseY = 0;

        function trackFrequency(e, analyser) {
            if (e.shiftKey) {
                spectrumToolbarElem.removeClass("non-shift");

                var rect = analyserCanvas.getBoundingClientRect();
                var mouseX = e.clientX - rect.left;
                var mouseY = e.clientY - rect.top;

                if (mouseX != lastMouseX || mouseY != lastMouseY) {
                    lastMouseX = mouseX;
                    lastMouseY = mouseY;
                    GraphSpectrumPlot.setMousePosition(mouseX, mouseY);
                    if (analyser) {
                        analyser.refresh();
                    }
                }
                e.preventDefault();
            } else {
                spectrumToolbarElem.addClass("non-shift");
            }
        }

        function saveOneUserSetting(name, value) {
            prefs.get("userSettings", function(data) {
                data = data || {};
                data[name] = value;
                prefs.set("userSettings", data);
            });
        }

    } catch (e) {
        console.log("Failed to create analyser... error:" + e);
    }
}
