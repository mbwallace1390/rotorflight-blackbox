"use strict";

(function(root, factory) {
    var api;

    if (typeof module === "object" && module.exports) {
        api = factory(
            require("./deterministic_metrics"),
            require("./rules")
        );
        module.exports = api;
    } else {
        api = factory(root.RotorLensAdvisorMetrics, root.RotorLensAdvisorRules);
    }

    if (root) {
        root.RotorLensTuneAdvisorEngine = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function(metrics, rules) {
    // One-second windows bound each synchronous slice so closing the Advisor
    // can cancel promptly even on high-rate or very long logs.
    var WINDOW_US = 1000000;
    var MAX_QUANTILE_SAMPLES = 8192;
    var MAX_GOVERNOR_RECORDS = 24000;
    var MAX_GOVERNOR_EVENTS = 2048;
    var GOVERNOR_STATE_EVENT = 50;
    var LOG_END_EVENT = 255;
    var COMMANDED_SETPOINT_DPS = 50;

    function cancelledError() {
        var error = new Error("Tune Advisor analysis was cancelled");
        error.code = "ANALYSIS_CANCELLED";
        return error;
    }

    function checkCancelled(options) {
        if (options && typeof options.isCancelled === "function" && options.isCancelled()) {
            throw cancelledError();
        }
    }

    function reportProgress(options, phase, completed, total) {
        if (!options || typeof options.onProgress !== "function") {
            return;
        }

        try {
            options.onProgress({
                phase: phase,
                completed: completed,
                total: total
            });
        } catch (error) {
            // Progress rendering must never invalidate a completed measurement.
        }
    }

    function yieldToEventLoop() {
        return new Promise(function(resolve) {
            setTimeout(resolve, 0);
        });
    }

    function fieldIndex(flightLog, name) {
        var index = flightLog.getMainFieldIndexByName(name);
        return index === undefined ? null : index;
    }

    function finiteFrameValue(frame, index) {
        if (index === null) {
            return null;
        }

        var value = frame[index];
        return Number.isFinite(value) ? value : null;
    }

    function firmwareName(firmwareType) {
        switch (firmwareType) {
            case 2: return "Cleanflight";
            case 3: return "Betaflight";
            case 4: return "INAV";
            case 5: return "Rotorflight";
            default: return "Unknown";
        }
    }

    function debugModeName(sysConfig) {
        var globalModes = typeof globalThis !== "undefined" ? globalThis.DEBUG_MODE : null;
        if (globalModes && typeof globalModes[sysConfig.debug_mode] === "string") {
            return globalModes[sysConfig.debug_mode];
        }

        // Governor has index 31 in the supported Rotorflight 4.2, 4.3 and 4.6 tables.
        if (sysConfig.firmwareType === 5 && sysConfig.debug_mode === 31) {
            return "GOVERNOR";
        }

        return sysConfig.debug_mode === 0 ? "NONE" : "UNKNOWN";
    }

    function makeAxisAccumulator() {
        function bucket() {
            return {
                count: 0,
                sumAbs: 0,
                sumSquares: 0,
                maxAbs: 0,
                absErrorSamples: [],
                absSetpointSamples: []
            };
        }

        return { all: bucket(), commanded: bucket() };
    }

    function addAxisMeasurement(bucket, error, setpoint, keepSample) {
        var absoluteError = Math.abs(error);
        bucket.count++;
        bucket.sumAbs += absoluteError;
        bucket.sumSquares += error * error;
        bucket.maxAbs = Math.max(bucket.maxAbs, absoluteError);

        if (keepSample && bucket.absErrorSamples.length < MAX_QUANTILE_SAMPLES) {
            bucket.absErrorSamples.push(absoluteError);
            bucket.absSetpointSamples.push(Math.abs(setpoint));
        }
    }

    function collectIndexes(flightLog, sysConfig) {
        var setpoints = [0, 1, 2].map(function(axis) {
            return fieldIndex(flightLog, "setpoint[" + axis + "]");
        });
        var gyros = [0, 1, 2].map(function(axis) {
            return fieldIndex(flightLog, "gyroADC[" + axis + "]");
        });
        var rawGyros = [0, 1, 2].map(function(axis) {
            return fieldIndex(flightLog, "gyroRAW[" + axis + "]");
        });
        var motors = [];

        for (var motor = 0; motor < 4; motor++) {
            var motorIndex = fieldIndex(flightLog, "motor[" + motor + "]");
            if (motorIndex !== null) {
                motors.push(motorIndex);
            }
        }

        var debugName = debugModeName(sysConfig);
        var namedGovernor = {
            request: fieldIndex(flightLog, "govRequest"),
            target: fieldIndex(flightLog, "govTarget"),
            actual: fieldIndex(flightLog, "headspeed")
        };
        var debugGovernor = {
            request: fieldIndex(flightLog, "debug[0]"),
            target: fieldIndex(flightLog, "debug[1]"),
            actual: fieldIndex(flightLog, "debug[2]")
        };
        var governorSource = null;
        var governor = null;

        if (namedGovernor.target !== null && namedGovernor.actual !== null) {
            governorSource = "named";
            governor = namedGovernor;
        } else if (debugName === "GOVERNOR"
                && debugGovernor.request !== null
                && debugGovernor.target !== null
                && debugGovernor.actual !== null) {
            governorSource = "debug-governor";
            governor = debugGovernor;
        }

        return {
            time: fieldIndex(flightLog, "time"),
            setpoints: setpoints,
            gyros: gyros,
            rawGyros: rawGyros,
            vbat: fieldIndex(flightLog, "Vbat"),
            headspeed: fieldIndex(flightLog, "headspeed"),
            collective: fieldIndex(flightLog, "setpoint[3]") !== null
                ? fieldIndex(flightLog, "setpoint[3]")
                : fieldIndex(flightLog, "mixer[3]"),
            mainMotor: fieldIndex(flightLog, "motor[0]"),
            motors: motors,
            failsafePhase: fieldIndex(flightLog, "failsafePhase"),
            rxSignalReceived: fieldIndex(flightLog, "rxSignalReceived"),
            rxFlightChannelsValid: fieldIndex(flightLog, "rxFlightChannelsValid"),
            debugName: debugName,
            governor: governor,
            governorSource: governorSource
        };
    }

    function motorPercent(flightLog, rawValue) {
        if (rawValue === null || typeof flightLog.rcMotorRawToPct !== "function") {
            return null;
        }

        var percent = flightLog.rcMotorRawToPct(rawValue);
        return Number.isFinite(percent) ? percent : null;
    }

    function processEvents(snapshot, chunks, seenEventKeys) {
        chunks.forEach(function(chunk) {
            (chunk.events || []).forEach(function(event) {
                var state = event.data && event.data.govState;
                var key = [event.event, event.time, state].join(":");
                if (seenEventKeys[key]) {
                    return;
                }
                seenEventKeys[key] = true;

                if (event.event === LOG_END_EVENT) {
                    snapshot.hasEndMarker = true;
                } else if (event.event === GOVERNOR_STATE_EVENT
                        && Number.isFinite(event.time)
                        && Number.isFinite(state)
                        && snapshot.governorEvents.length < MAX_GOVERNOR_EVENTS) {
                    snapshot.governorEvents.push({
                        timeUs: event.time,
                        state: state
                    });
                }
            });
        });
    }

    async function scanFlightLog(flightLog, options) {
        if (!metrics || !rules) {
            throw new Error("Tune Advisor dependencies were not loaded");
        }

        checkCancelled(options);

        if (!flightLog
                || typeof flightLog.getChunksInTimeRange !== "function"
                || typeof flightLog.getMainFieldIndexByName !== "function") {
            throw new TypeError("A parsed FlightLog is required");
        }

        var minTimeUs = flightLog.getMinTime();
        var maxTimeUs = flightLog.getMaxTime();
        var durationUs = Math.max(0, maxTimeUs - minTimeUs);
        var sysConfig = flightLog.getSysConfig() || {};
        var indexes = collectIndexes(flightLog, sysConfig);
        var stats = flightLog.getStats() || {};
        var windowCount = Math.max(1, Math.ceil(durationUs / WINDOW_US));
        var quantileStrideUs = Math.max(1, Math.ceil(durationUs / MAX_QUANTILE_SAMPLES));
        var governorStrideUs = Math.max(10000, Math.ceil(durationUs / MAX_GOVERNOR_RECORDS));
        var nextQuantileTimeUs = minTimeUs;
        var nextGovernorTimeUs = minTimeUs;
        var nextDtTimeUs = minTimeUs;
        var lastFrameTimeUs = null;
        var lastPoweredTimeUs = null;
        var seenGaps = Object.create(null);
        var seenEventKeys = Object.create(null);
        var cellCount = null;

        if (typeof flightLog.getNumCellsEstimate === "function") {
            var estimate = flightLog.getNumCellsEstimate();
            if (Number.isFinite(estimate) && estimate > 0) {
                cellCount = estimate;
            }
        }

        var snapshot = {
            firmwareType: firmwareName(sysConfig.firmwareType),
            firmwareTypeCode: sysConfig.firmwareType,
            firmwareVersion: sysConfig.firmwareVersion || null,
            debugMode: sysConfig.debug_mode,
            debugName: indexes.debugName,
            fieldsMask: sysConfig.fields_mask,
            logIndex: typeof flightLog.getLogIndex === "function" ? flightLog.getLogIndex() : 0,
            minTimeUs: minTimeUs,
            maxTimeUs: maxTimeUs,
            durationUs: durationUs,
            sampleCount: 0,
            invalidTimeCount: 0,
            invalidRequiredValueCount: 0,
            corruptFrames: Number(stats.totalCorruptFrames) || 0,
            discontinuities: 0,
            hasEndMarker: false,
            dtSamples: [],
            axisAccumulators: [makeAxisAccumulator(), makeAxisAccumulator(), makeAxisAccumulator()],
            battery: { count: 0, minRaw: Infinity, maxRaw: -Infinity },
            cellCount: cellCount,
            warningCellVoltageRaw: Number(sysConfig.vbatwarningcellvoltage),
            maximumCellVoltageRaw: Number(sysConfig.vbatmaxcellvoltage),
            poweredSampleCount: 0,
            poweredDurationUs: 0,
            failsafeSampleCount: 0,
            rxLossSampleCount: 0,
            invalidRxChannelsSampleCount: 0,
            governorSource: indexes.governorSource,
            governorRecords: [],
            governorEvents: [],
            governorRecordsCapped: false,
            coverage: {
                setpointAxes: indexes.setpoints.map(function(index) { return index !== null; }),
                gyroAxes: indexes.gyros.map(function(index) { return index !== null; }),
                rawGyroAxes: indexes.rawGyros.map(function(index) { return index !== null; }),
                battery: indexes.vbat !== null,
                headspeed: indexes.headspeed !== null,
                collective: indexes.collective !== null,
                motorCount: indexes.motors.length,
                failsafePhase: indexes.failsafePhase !== null,
                rxHealth: indexes.rxSignalReceived !== null
                    && indexes.rxFlightChannelsValid !== null,
                governor: indexes.governorSource !== null
            },
            configurationWarnings: []
        };

        if (!Number.isFinite(sysConfig.looptime)
                || !Number.isFinite(sysConfig.frameIntervalPNum)
                || !Number.isFinite(sysConfig.frameIntervalPDenom)) {
            snapshot.configurationWarnings.push("missing-logging-rate-header");
        }

        reportProgress(options, "quality", 0, windowCount);

        for (var windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            checkCancelled(options);
            var windowStartUs = minTimeUs + windowIndex * WINDOW_US;
            var windowEndUs = Math.min(maxTimeUs, windowStartUs + WINDOW_US);
            var chunks = flightLog.getChunksInTimeRange(windowStartUs, windowEndUs);
            processEvents(snapshot, chunks, seenEventKeys);

            chunks.forEach(function(chunk) {
                Object.keys(chunk.gapStartsHere || {}).forEach(function(frameKey) {
                    var gapKey = String(chunk.index) + ":" + frameKey;
                    seenGaps[gapKey] = true;
                });

                (chunk.frames || []).forEach(function(frame) {
                    var timeUs = finiteFrameValue(frame, indexes.time);
                    var isLastWindow = windowIndex === windowCount - 1;
                    if (timeUs === null) {
                        snapshot.invalidTimeCount++;
                        return;
                    }

                    if (timeUs < windowStartUs
                            || (!isLastWindow && timeUs >= windowEndUs)
                            || timeUs > maxTimeUs
                            || (lastFrameTimeUs !== null && timeUs <= lastFrameTimeUs)) {
                        return;
                    }

                    snapshot.sampleCount++;
                    if (snapshot.sampleCount % 1024 === 0) {
                        checkCancelled(options);
                    }
                    var keepQuantileSample = timeUs >= nextQuantileTimeUs;
                    if (keepQuantileSample) {
                        nextQuantileTimeUs = timeUs + quantileStrideUs;
                    }

                    if (lastFrameTimeUs !== null) {
                        var deltaUs = timeUs - lastFrameTimeUs;
                        if (deltaUs <= 0 || deltaUs > 100000) {
                            snapshot.discontinuities++;
                        }
                        if (timeUs >= nextDtTimeUs && snapshot.dtSamples.length < MAX_QUANTILE_SAMPLES) {
                            snapshot.dtSamples.push(deltaUs);
                            nextDtTimeUs = timeUs + quantileStrideUs;
                        }
                    }
                    lastFrameTimeUs = timeUs;

                    var headspeed = finiteFrameValue(frame, indexes.headspeed);
                    // Rotorflight's governor drives motor[0]. Other motor fields
                    // can represent a motorized tail and must not be used as a
                    // proxy for main-motor headroom.
                    var motorRaw = finiteFrameValue(frame, indexes.mainMotor);
                    var mainMotorPct = motorPercent(flightLog, motorRaw);
                    var powered = (headspeed !== null && headspeed > 0)
                        || (motorRaw !== null && motorRaw > 100);

                    if (powered) {
                        if (lastPoweredTimeUs !== null) {
                            var poweredDeltaUs = timeUs - lastPoweredTimeUs;
                            if (poweredDeltaUs > 0 && poweredDeltaUs <= 100000) {
                                snapshot.poweredDurationUs += poweredDeltaUs;
                            }
                        }
                        lastPoweredTimeUs = timeUs;
                        snapshot.poweredSampleCount++;
                        var invalidAxisValue = false;
                        for (var axis = 0; axis < 3; axis++) {
                            if (indexes.setpoints[axis] === null || indexes.gyros[axis] === null) {
                                continue;
                            }

                            var setpoint = finiteFrameValue(frame, indexes.setpoints[axis]);
                            var gyro = finiteFrameValue(frame, indexes.gyros[axis]);
                            if (setpoint === null || gyro === null) {
                                invalidAxisValue = true;
                                continue;
                            }

                            var error = setpoint - gyro;
                            var axisAccumulator = snapshot.axisAccumulators[axis];
                            addAxisMeasurement(axisAccumulator.all, error, setpoint, keepQuantileSample);
                            if (Math.abs(setpoint) >= COMMANDED_SETPOINT_DPS) {
                                addAxisMeasurement(
                                    axisAccumulator.commanded,
                                    error,
                                    setpoint,
                                    keepQuantileSample
                                );
                            }
                        }
                        if (invalidAxisValue) {
                            snapshot.invalidRequiredValueCount++;
                        }

                        var vbatRaw = finiteFrameValue(frame, indexes.vbat);
                        if (vbatRaw !== null && vbatRaw > 0) {
                            snapshot.battery.count++;
                            snapshot.battery.minRaw = Math.min(snapshot.battery.minRaw, vbatRaw);
                            snapshot.battery.maxRaw = Math.max(snapshot.battery.maxRaw, vbatRaw);
                        }

                        var failsafePhase = finiteFrameValue(frame, indexes.failsafePhase);
                        var rxSignalReceived = finiteFrameValue(frame, indexes.rxSignalReceived);
                        var rxChannelsValid = finiteFrameValue(frame, indexes.rxFlightChannelsValid);
                        if (failsafePhase !== null && failsafePhase !== 0) {
                            snapshot.failsafeSampleCount++;
                        }
                        if (rxSignalReceived !== null && rxSignalReceived === 0) {
                            snapshot.rxLossSampleCount++;
                        }
                        if (rxChannelsValid !== null && rxChannelsValid === 0) {
                            snapshot.invalidRxChannelsSampleCount++;
                        }
                    } else {
                        lastPoweredTimeUs = null;
                    }

                    if (indexes.governor && timeUs >= nextGovernorTimeUs) {
                        if (snapshot.governorRecords.length >= MAX_GOVERNOR_RECORDS) {
                            snapshot.governorRecordsCapped = true;
                        } else {
                            var targetRpm = finiteFrameValue(frame, indexes.governor.target);
                            var actualRpm = finiteFrameValue(frame, indexes.governor.actual);
                            var requestRpm = finiteFrameValue(frame, indexes.governor.request);
                            var collective = finiteFrameValue(frame, indexes.collective);
                            if (targetRpm !== null && actualRpm !== null) {
                                snapshot.governorRecords.push({
                                    timeUs: timeUs,
                                    requestRpm: requestRpm,
                                    targetRpm: targetRpm,
                                    actualRpm: actualRpm,
                                    collective: collective,
                                    motorPct: mainMotorPct
                                });
                            }
                        }
                        nextGovernorTimeUs = timeUs + governorStrideUs;
                    }
                });
            });

            reportProgress(options, "quality", windowIndex + 1, windowCount);
            await yieldToEventLoop();
        }

        snapshot.discontinuities += Object.keys(seenGaps).length;
        return snapshot;
    }

    async function analyzeFlightLog(flightLog, options) {
        var settings = options || {};
        var snapshot = await scanFlightLog(flightLog, settings);
        checkCancelled(settings);
        reportProgress(settings, "tracking", 0, 1);
        var measurement = metrics.summarizeSnapshot(snapshot);
        reportProgress(settings, "tracking", 1, 1);
        checkCancelled(settings);
        reportProgress(settings, "governor", 1, 1);
        await yieldToEventLoop();
        checkCancelled(settings);
        reportProgress(settings, "findings", 0, 1);
        var evidencePackage = rules.buildEvidencePackage(snapshot, measurement);
        reportProgress(settings, "findings", 1, 1);
        return evidencePackage;
    }

    return Object.freeze({
        analyzeFlightLog: analyzeFlightLog,
        scanFlightLog: scanFlightLog,
        constants: Object.freeze({
            maxGovernorRecords: MAX_GOVERNOR_RECORDS,
            maxQuantileSamples: MAX_QUANTILE_SAMPLES,
            windowUs: WINDOW_US
        })
    });
}));
