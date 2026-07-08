"use strict";

function FlightLogAnalyser(flightLog, canvas, analyserCanvas) {

const
        ANALYSER_LARGE_LEFT_MARGIN    = 10,
        ANALYSER_LARGE_TOP_MARGIN     = 10,
        ANALYSER_LARGE_HEIGHT_MARGIN  = 20,
        ANALYSER_LARGE_WIDTH_MARGIN   = 20,
        ANDROID_AUTO_SCALE_TARGET     = 0.72,
        ANDROID_MAX_SIGNAL_GAIN       = 20000;

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

    isAndroid = Boolean(window.RotorflightPlatform && window.RotorflightPlatform.android),

    prefs = new PrefStorage();

    try {

        var isFullscreen = false;

        var sysConfig = flightLog.getSysConfig();
        GraphSpectrumCalc.initialize(flightLog, sysConfig);
        GraphSpectrumPlot.initialize(analyserCanvas, sysConfig);

        var analyserZoomXElem = $("#analyserZoomX");
        var analyserZoomYElem = $("#analyserZoomY");

        var spectrumToolbarElem = $('#spectrumToolbar');
        var spectrumTypeElem = $("#spectrumTypeSelect");
        var overdrawSpectrumTypeElem = $("#overdrawSpectrumTypeSelect");
        var mobileScalePanel = null;
        var analyserZoomXValueElem = null;
        var analyserZoomYValueElem = null;
        var autoScaleButton = null;

        if (isAndroid) {
            var analyserParent = $(analyserCanvas).parent();
            analyserParent.find("#androidAnalyserScalePanel").remove();

            analyserZoomYElem.attr({
                max: ANDROID_MAX_SIGNAL_GAIN,
                step: 10
            });

            mobileScalePanel = $('<div id="androidAnalyserScalePanel"></div>');

            var xControl = $('<label class="android-analyser-scale-control"><span>Frequency range</span></label>');
            analyserZoomXValueElem = $('<output>100%</output>');
            xControl.append(analyserZoomXElem).append(analyserZoomXValueElem);

            var yControl = $('<label class="android-analyser-scale-control"><span>Signal gain</span></label>');
            analyserZoomYValueElem = $('<output>1.0×</output>');
            yControl.append(analyserZoomYElem).append(analyserZoomYValueElem);

            autoScaleButton = $('<button type="button" id="androidAnalyserAutoScale">Auto scale</button>');

            mobileScalePanel.append(xControl, yControl, autoScaleButton);
            analyserParent.append(mobileScalePanel);
        }

        this.setFullscreen = function(size) {
            isFullscreen = (size==true);
            GraphSpectrumPlot.setFullScreen(isFullscreen);
            that.resize();
        };

        this.setInTime = function(time) {
            dataReload = true;
            return GraphSpectrumCalc.setInTime(time);;
        };

        this.setOutTime = function(time) {
            dataReload = true;
            return GraphSpectrumCalc.setOutTime(time);;
        };

        var getSize = function () {
            if (isFullscreen){
                return {
                        height: canvas.clientHeight - ANALYSER_LARGE_HEIGHT_MARGIN,
                        width: canvas.clientWidth - ANALYSER_LARGE_WIDTH_MARGIN,
                        left: ANALYSER_LARGE_LEFT_MARGIN,
                        top: ANALYSER_LARGE_TOP_MARGIN
                };
            } else {
                var analyserSize = parseInt(userSettings.analyser.size);
                if (isAndroid) {
                    analyserSize = Math.max(analyserSize, 45);
                }

                return {
                    height: canvas.height * analyserSize / 100.0,
                    width: canvas.width * analyserSize / 100.0,
                    left: (canvas.width * parseInt(userSettings.analyser.left) / 100.0),
                    top:  (canvas.height * parseInt(userSettings.analyser.top) / 100.0)
                };
            }
        };

               this.resize = function() {

            var newSize = getSize();

            // Determine the analyserCanvas location
            GraphSpectrumPlot.setSize(newSize.width, newSize.height);

            // Recenter the analyser canvas in the bottom left corner
            var parentElem = $(analyserCanvas).parent();

            $(parentElem).css({
                left: newSize.left, // (canvas.width  * getSize().left) + "px",
                top:  newSize.top   // (canvas.height * getSize().top ) + "px"
            });
            // place the sliders.
            $("input:first-of-type", parentElem).css({
                left: (newSize.width - 130) + "px"
            });
            $("input:last-of-type", parentElem).css({
                left: (newSize.width - 20) + "px"
            });
            $("#analyserResize", parentElem).css({
                left: (newSize.width - 28) + "px"
            });

        };

        function updateMobileScaleLabels() {
            if (!isAndroid) {
                return;
            }

            analyserZoomXValueElem.text(analyserZoomXElem.val() + "%");
            analyserZoomYValueElem.text((parseFloat(analyserZoomYElem.val()) / 100).toFixed(1) + "×");
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
                return;
            }

            var maxValue = getVisibleSpectrumMaximum();
            if (!Number.isFinite(maxValue) || maxValue <= 0) {
                return;
            }

            var signalGain = ANDROID_AUTO_SCALE_TARGET * 10000 / maxValue;
            signalGain = Math.round(signalGain / 10) * 10;
            signalGain = constrain(signalGain, 10, ANDROID_MAX_SIGNAL_GAIN);

            analyserZoomYElem.val(signalGain);
            analyserZoomY = 100 / signalGain;
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            updateMobileScaleLabels();
            that.refresh();
        }

        var dataLoad = function() {

            GraphSpectrumCalc.setDataBuffer(dataBuffer);

            switch(userSettings.spectrumType) {

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

        /* This function is called from the canvas drawing routines within grapher.js
           It is only used to record the current curve positions, collect the data and draw the
           analyser on screen*/
        this.plotSpectrum =        function (fieldIndex, curve, fieldName) {
            // Store the data pointers
            dataBuffer = {
                    fieldIndex: fieldIndex,
                    curve: curve,
                    fieldName: fieldName
            };

            // Detect change of selected field.... reload and redraw required.
            if ((fftData == null) || (fieldIndex != fftData.fieldIndex) || dataReload) {
                dataReload = false;
                dataLoad();
                GraphSpectrumPlot.setData(fftData, userSettings.spectrumType);
                autoScaleSignal();
            }

            that.draw(); // draw the analyser on the canvas....
        };

        this.destroy = function() {
            $(analyserCanvas).off("mousemove", trackFrequency);
            $(analyserCanvas).off("touchmove", trackFrequency);
        };

        this.refresh = function() {
            that.draw();
        };

        this.draw = function() {
            GraphSpectrumPlot.draw();
        };

        /* Add mouse/touch over event to read the frequency */
        $(analyserCanvas).on('mousemove', function (e) {
            trackFrequency(e, that);
        });
        $(analyserCanvas).on('touchmove', function (e) {
            trackFrequency(e, that);
        });

        /* add zoom controls */
        const DEFAULT_ZOOM = 100;
        analyserZoomXElem.on('input', $.debounce(100, function() {
            analyserZoomX = (analyserZoomXElem.val() / 100);
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            updateMobileScaleLabels();
            if (isAndroid) {
                autoScaleSignal();
            } else {
                that.refresh();
            }
        })).dblclick(function() {
            $(this).val(DEFAULT_ZOOM).trigger("input");
        }).val(DEFAULT_ZOOM);;

        analyserZoomYElem.on('input', $.debounce(100, function() {
            analyserZoomY = 1 / (analyserZoomYElem.val() / 100);
            GraphSpectrumPlot.setZoom(analyserZoomX, analyserZoomY);
            updateMobileScaleLabels();
            that.refresh();
        })).dblclick(function() {
            $(this).val(DEFAULT_ZOOM).trigger("input");
        }).val(DEFAULT_ZOOM);

        if (isAndroid) {
            autoScaleButton.on("click", function(event) {
                event.preventDefault();
                autoScaleSignal();
            });
            updateMobileScaleLabels();
        }

        // Spectrum type to show
        userSettings.spectrumType = userSettings.spectrumType || SPECTRUM_TYPE.FREQUENCY;
        spectrumTypeElem.val(userSettings.spectrumType);

        spectrumTypeElem.change(function() {
            var optionSelected = parseInt(spectrumTypeElem.val(), 10);

            if (optionSelected != userSettings.spectrumType) {
                userSettings.spectrumType = optionSelected;
                saveOneUserSetting('spectrumType', userSettings.spectrumType);

                // Recalculate the data, for the same curve than now, and draw it
                dataReload = true;
                that.plotSpectrum(dataBuffer.fieldIndex, dataBuffer.curve, dataBuffer.fieldName);
            }

            // Hide overdraw and zoomY if needed
            const pidErrorVsSetpointSelected = optionSelected === SPECTRUM_TYPE.PIDERROR_VS_SETPOINT;
            overdrawSpectrumTypeElem.toggle(!pidErrorVsSetpointSelected);
            analyserZoomYElem.toggleClass('onlyFullScreenException', pidErrorVsSetpointSelected);
            if (isAndroid) {
                mobileScalePanel.toggleClass('pid-error-mode', pidErrorVsSetpointSelected);
            }
        }).change();

        // Spectrum overdraw to show
        userSettings.overdrawSpectrumType = userSettings.overdrawSpectrumType || SPECTRUM_OVERDRAW_TYPE.ALL_FILTERS;
        overdrawSpectrumTypeElem.val(userSettings.overdrawSpectrumType);
        GraphSpectrumPlot.setOverdraw(userSettings.overdrawSpectrumType);

        overdrawSpectrumTypeElem.change(function() {
            var optionSelected = parseInt(overdrawSpectrumTypeElem.val(), 10);

            if (optionSelected != userSettings.overdrawSpectrumType) {
                userSettings.overdrawSpectrumType = optionSelected;
                saveOneUserSetting('overdrawSpectrumType', userSettings.overdrawSpectrumType);

                // Refresh the graph
                GraphSpectrumPlot.setOverdraw(userSettings.overdrawSpectrumType);
                that.draw();
            }
        });

        // track frequency under mouse
        var lastMouseX = 0,
            lastMouseY = 0;

        function trackFrequency(e, analyser) {
            if(e.shiftKey) {

                // Hide the combo and maximize buttons
                spectrumToolbarElem.removeClass('non-shift');

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
                spectrumToolbarElem.addClass('non-shift');
            }
        }

        function saveOneUserSetting(name, value) {
            prefs.get('userSettings', function(data) {
                data[name] = value;
                prefs.set('userSettings', data);
            });
        }

    } catch (e) {
        console.log('Failed to create analyser... error:' + e);
    }
}