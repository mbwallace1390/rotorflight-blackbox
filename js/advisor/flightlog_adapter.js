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
    var INFLIGHT_ADJUSTMENT_EVENT = 13;
    var LOGGING_RESUME_EVENT = 14;
    var DISARM_EVENT = 15;
    var FLIGHT_MODE_EVENT = 30;
    var GOVERNOR_STATE_EVENT = 50;
    var RESCUE_STATE_EVENT = 51;
    var LOG_END_EVENT = 255;
    var COMMANDED_SETPOINT_DPS = 50;
    var ARMED_FLIGHT_MODE_MASK = 1;
    var RF46_UNSAFE_FLIGHT_MODE_MASK = (1 << 5) | (1 << 6) | (1 << 7)
        | (1 << 23) | (1 << 24) | (1 << 25);

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function ownFiniteArray(object, key, minimumLength) {
        if (!hasOwn(object, key) || !Array.isArray(object[key])
                || object[key].length < minimumLength) {
            return null;
        }

        var values = object[key].slice(0, minimumLength);
        return values.every(Number.isFinite) ? values : null;
    }

    function integerInRange(value, minimum, maximum) {
        return Number.isInteger(value) && value >= minimum && value <= maximum;
    }

    function updateFingerprint(hash, value) {
        var text = Number.isFinite(value) ? String(value) : "x";
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        hash ^= 124;
        return Math.imul(hash, 16777619) >>> 0;
    }

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

    function rangeError(code, message) {
        var error = new RangeError(message);
        error.code = code;
        return error;
    }

    function requireSelectedRange(flightLog, options) {
        var logMinTimeUs = flightLog.getMinTime();
        var logMaxTimeUs = flightLog.getMaxTime();
        var requested = options && options.timeRangeUs;

        if (!requested
                || !Number.isFinite(requested.startTimeUs)
                || !Number.isFinite(requested.endTimeUs)) {
            throw rangeError(
                "ANALYSIS_RANGE_REQUIRED",
                "Set both graph In and Out markers before running Tune Advisor"
            );
        }

        if (requested.startTimeUs < logMinTimeUs
                || requested.endTimeUs > logMaxTimeUs
                || requested.startTimeUs >= requested.endTimeUs) {
            throw rangeError(
                "ANALYSIS_RANGE_INVALID",
                "The selected graph In/Out range is invalid for this log"
            );
        }

        return {
            logMinTimeUs: logMinTimeUs,
            logMaxTimeUs: logMaxTimeUs,
            startTimeUs: requested.startTimeUs,
            endTimeUs: requested.endTimeUs
        };
    }

    function validateMechanicalGate(options, selectedRange) {
        if (!options || !hasOwn(options, "mechanicalGate")
                || options.mechanicalGate === undefined) {
            return null;
        }

        var gate = options.mechanicalGate;
        var allowedStatuses = ["clear", "attention", "insufficient", "unavailable"];
        var gateRange = gate && gate.range;
        if (!gate || typeof gate !== "object" || Array.isArray(gate)
                || allowedStatuses.indexOf(gate.status) === -1
                || !gateRange || typeof gateRange !== "object"
                || Array.isArray(gateRange)
                || !Number.isFinite(gateRange.startTimeUs)
                || !Number.isFinite(gateRange.endTimeUs)
                || gateRange.startTimeUs >= gateRange.endTimeUs) {
            throw rangeError(
                "MECHANICAL_GATE_INVALID",
                "Mechanical analysis returned an invalid selected-range safety gate"
            );
        }

        if (gateRange.startTimeUs !== selectedRange.startTimeUs
                || gateRange.endTimeUs !== selectedRange.endTimeUs) {
            throw rangeError(
                "MECHANICAL_GATE_RANGE_MISMATCH",
                "Mechanical analysis returned a safety gate for a different In/Out range"
            );
        }

        var reasonCodes = [];
        if (gate.reasonCodes !== undefined) {
            var seenReasonCodes = Object.create(null);
            if (!Array.isArray(gate.reasonCodes) || gate.reasonCodes.length > 16
                    || !gate.reasonCodes.every(function(code) {
                        if (typeof code !== "string"
                                || !/^[A-Z][A-Z0-9_]{0,79}$/.test(code)
                                || seenReasonCodes[code]) {
                            return false;
                        }
                        seenReasonCodes[code] = true;
                        return true;
                    })) {
                throw rangeError(
                    "MECHANICAL_GATE_INVALID",
                    "Mechanical analysis returned invalid safety-gate reason codes"
                );
            }
            reasonCodes = gate.reasonCodes.slice();
        }

        return Object.freeze({
            status: gate.status,
            range: Object.freeze({
                startTimeUs: gateRange.startTimeUs,
                endTimeUs: gateRange.endTimeUs
            }),
            reasonCodes: Object.freeze(reasonCodes)
        });
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

        if (namedGovernor.request !== null
                && namedGovernor.target !== null
                && namedGovernor.actual !== null) {
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
            flightModeFlags: fieldIndex(flightLog, "flightModeFlags"),
            rxSignalReceived: fieldIndex(flightLog, "rxSignalReceived"),
            rxFlightChannelsValid: fieldIndex(flightLog, "rxFlightChannelsValid"),
            debugName: debugName,
            governor: governor,
            governorSource: governorSource,
            governorFields: governorSource === "named"
                ? namedGovernor
                : (governorSource === "debug-governor" ? debugGovernor : null)
        };
    }

    function collectGovernorConfiguration(sysConfig, options) {
        // These exact header names are emitted by Rotorflight Blackbox. The
        // parser inherits default arrays, so own-property checks are mandatory:
        // an inherited null/default is not proof that the setting was logged.
        var govPidPresent = hasOwn(sysConfig, "govPID");
        var yawTtaPresent = hasOwn(sysConfig, "yaw_tta");
        var govPidRaw = ownFiniteArray(sysConfig, "govPID", 5);
        var yawTtaRaw = ownFiniteArray(sysConfig, "yaw_tta", 2);
        var collectiveRangePresent = hasOwn(sysConfig, "collectiveRange");
        var collectiveRangeRaw = ownFiniteArray(sysConfig, "collectiveRange", 2);
        var collectiveRange = collectiveRangeRaw;
        var govPid = govPidRaw && govPidRaw.every(function(value) {
            return integerInRange(value, 0, 250);
        }) ? govPidRaw : null;
        var yawTta = yawTtaRaw && yawTtaRaw.every(function(value) {
            return integerInRange(value, 0, 250);
        }) ? yawTtaRaw : null;
        var userInputs = options && options.userInputs;
        var suppliedCeiling = userInputs && userInputs.governorMaxThrottlePct;
        var maxThrottlePercent = Number.isInteger(suppliedCeiling)
                && suppliedCeiling >= 10
                && suppliedCeiling <= 100
            ? suppliedCeiling
            : null;

        if (collectiveRange
                && !(collectiveRange[0] < 0 && collectiveRange[1] > 0)) {
            collectiveRange = null;
        }

        return {
            pGain: govPid ? govPid[0] : null,
            iGain: govPid ? govPid[1] : null,
            dGain: govPid ? govPid[2] : null,
            fGain: govPid ? govPid[3] : null,
            masterGain: govPid ? govPid[4] : null,
            ttaGain: yawTta ? yawTta[0] : null,
            ttaLimit: yawTta ? yawTta[1] : null,
            collectiveRange: collectiveRange,
            maxThrottlePercent: maxThrottlePercent,
            maxThrottleSource: maxThrottlePercent === null
                ? null
                : "user-provided-current-profile",
            maxThrottleInputStatus: suppliedCeiling === undefined
                ? "missing"
                : (maxThrottlePercent === null ? "invalid" : "accepted"),
            govPidLogged: govPid !== null,
            ttaLogged: yawTta !== null,
            collectiveRangeLogged: collectiveRange !== null,
            numericPlausible: (!govPidPresent || govPid !== null)
                && (!yawTtaPresent || yawTta !== null)
                && (!collectiveRangePresent || collectiveRange !== null),
            invalidLoggedGainValues: (govPidPresent && govPid === null)
                || (yawTtaPresent && yawTta === null),
            invalidCollectiveRangeValues: collectiveRangePresent
                && collectiveRange === null
        };
    }

    function normalizeCollective(rawValue, collectiveRange) {
        if (!Number.isFinite(rawValue) || !collectiveRange) {
            return null;
        }

        var scale = rawValue < 0
            ? Math.abs(collectiveRange[0])
            : Math.abs(collectiveRange[1]);
        return scale > 0 ? rawValue / scale * 100 : null;
    }

    function motorPercent(flightLog, rawValue) {
        if (rawValue === null || typeof flightLog.rcMotorRawToPct !== "function") {
            return null;
        }

        var percent = flightLog.rcMotorRawToPct(rawValue);
        return Number.isFinite(percent) ? percent : null;
    }

    function processEvents(snapshot, chunks, seenEventKeys, startTimeUs, endTimeUs) {
        chunks.forEach(function(chunk) {
            (chunk.events || []).forEach(function(event) {
                if (!Number.isFinite(event.time)
                        || event.time < startTimeUs
                        || event.time > endTimeUs) {
                    return;
                }
                var state = event.data && event.data.govState;
                var newFlags = event.data && event.data.newFlags;
                var lastFlags = event.data && event.data.lastFlags;
                var key = [event.event, event.time, state, newFlags, lastFlags].join(":");
                if (seenEventKeys[key]) {
                    return;
                }
                seenEventKeys[key] = true;

                if (event.event === LOG_END_EVENT) {
                    snapshot.hasEndMarker = true;
                } else if (event.event === GOVERNOR_STATE_EVENT
                        && Number.isFinite(event.time)
                        && Number.isFinite(state)) {
                    if (snapshot.governorEvents.length >= MAX_GOVERNOR_EVENTS) {
                        snapshot.governorEventsCapped = true;
                    } else {
                        snapshot.governorEvents.push({
                            timeUs: event.time,
                            state: state
                        });
                    }
                } else if (event.event === INFLIGHT_ADJUSTMENT_EVENT) {
                    snapshot.safetyEventCodes.push("INFLIGHT_ADJUSTMENT_IN_SELECTION");
                } else if (event.event === LOGGING_RESUME_EVENT) {
                    snapshot.safetyEventCodes.push("LOGGING_RESUME_IN_SELECTION");
                } else if (event.event === DISARM_EVENT) {
                    snapshot.safetyEventCodes.push("DISARM_IN_SELECTION");
                } else if (event.event === RESCUE_STATE_EVENT) {
                    snapshot.safetyEventCodes.push("RESCUE_EVENT_IN_SELECTION");
                } else if (event.event === FLIGHT_MODE_EVENT
                        && Number.isFinite(newFlags)
                        && Number.isFinite(lastFlags)) {
                    // Exact Rotorflight 4.6 bits: rescue, GPS rescue, failsafe,
                    // governor fallback, suspend and bypass. Other firmware is
                    // not eligible for a directional recommendation.
                    if (((newFlags | lastFlags) & RF46_UNSAFE_FLIGHT_MODE_MASK) !== 0) {
                        snapshot.safetyEventCodes.push("UNSAFE_FLIGHT_MODE_IN_SELECTION");
                    }
                }
            });
        });
    }

    function gapBoundaryTimes(chunks, chunkPosition, frameIndex, timeFieldIndex) {
        var leftTimeUs = null;
        var rightTimeUs = null;
        var chunkOffset;
        var frames;
        var index;

        for (chunkOffset = chunkPosition; chunkOffset >= 0 && leftTimeUs === null; chunkOffset--) {
            frames = chunks[chunkOffset].frames || [];
            index = chunkOffset === chunkPosition
                ? Math.min(frameIndex, frames.length - 1)
                : frames.length - 1;
            for (; index >= 0; index--) {
                leftTimeUs = finiteFrameValue(frames[index], timeFieldIndex);
                if (leftTimeUs !== null) {
                    break;
                }
            }
        }

        for (chunkOffset = chunkPosition; chunkOffset < chunks.length && rightTimeUs === null; chunkOffset++) {
            frames = chunks[chunkOffset].frames || [];
            index = chunkOffset === chunkPosition ? Math.max(0, frameIndex + 1) : 0;
            for (; index < frames.length; index++) {
                rightTimeUs = finiteFrameValue(frames[index], timeFieldIndex);
                if (rightTimeUs !== null) {
                    break;
                }
            }
        }

        return {
            leftTimeUs: leftTimeUs,
            rightTimeUs: rightTimeUs
        };
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

        var selectedRange = requireSelectedRange(flightLog, options);
        var mechanicalGate = validateMechanicalGate(options, selectedRange);
        var minTimeUs = selectedRange.startTimeUs;
        var maxTimeUs = selectedRange.endTimeUs;
        var durationUs = Math.max(0, maxTimeUs - minTimeUs);
        var sysConfig = flightLog.getSysConfig() || {};
        var indexes = collectIndexes(flightLog, sysConfig);
        var governorConfiguration = collectGovernorConfiguration(sysConfig, options);
        var windowCount = Math.max(1, Math.ceil(durationUs / WINDOW_US));
        var quantileStrideUs = Math.max(1, Math.ceil(durationUs / MAX_QUANTILE_SAMPLES));
        var nextQuantileTimeUs = minTimeUs;
        var nextDtTimeUs = minTimeUs;
        var lastFrameTimeUs = null;
        var lastPoweredTimeUs = null;
        var selectedFingerprintHash = 2166136261;
        var seenAcceptedFrameKeys = Object.create(null);
        var seenGaps = Object.create(null);
        var seenEventKeys = Object.create(null);
        var cellCount = null;
        var batteryConfigurationLogged = hasOwn(sysConfig, "vbatref")
            && hasOwn(sysConfig, "vbatmincellvoltage")
            && hasOwn(sysConfig, "vbatwarningcellvoltage")
            && hasOwn(sysConfig, "vbatmaxcellvoltage");
        var batteryConfigurationValid = batteryConfigurationLogged
            && Number.isFinite(sysConfig.vbatref)
            && Number.isFinite(sysConfig.vbatmincellvoltage)
            && Number.isFinite(sysConfig.vbatwarningcellvoltage)
            && Number.isFinite(sysConfig.vbatmaxcellvoltage)
            && Number.isInteger(sysConfig.vbatref)
            && Number.isInteger(sysConfig.vbatmincellvoltage)
            && Number.isInteger(sysConfig.vbatwarningcellvoltage)
            && Number.isInteger(sysConfig.vbatmaxcellvoltage)
            && sysConfig.vbatref > 0
            && sysConfig.vbatref <= 65535
            && sysConfig.vbatmincellvoltage >= 200
            && sysConfig.vbatmaxcellvoltage <= 500
            && sysConfig.vbatmincellvoltage <= sysConfig.vbatwarningcellvoltage
            && sysConfig.vbatwarningcellvoltage < sysConfig.vbatmaxcellvoltage;
        var loggingRateConfigurationLogged = hasOwn(sysConfig, "looptime")
            && hasOwn(sysConfig, "frameIntervalPNum")
            && hasOwn(sysConfig, "frameIntervalPDenom");
        var loggingRateConfigurationValid = loggingRateConfigurationLogged
            && Number.isFinite(sysConfig.looptime)
            && Number.isFinite(sysConfig.frameIntervalPNum)
            && Number.isFinite(sysConfig.frameIntervalPDenom)
            && sysConfig.looptime > 0
            && sysConfig.frameIntervalPNum > 0
            && sysConfig.frameIntervalPDenom > 0;

        if (batteryConfigurationValid
                && typeof flightLog.getNumCellsEstimate === "function") {
            var estimate = flightLog.getNumCellsEstimate();
            if (Number.isFinite(estimate) && estimate > 0) {
                cellCount = estimate;
            }
        }

        var snapshot = {
            firmwareType: firmwareName(sysConfig.firmwareType),
            firmwareTypeCode: sysConfig.firmwareType,
            firmwareVersion: sysConfig.firmwareVersion || null,
            firmwareRevisionRaw: hasOwn(sysConfig, "Firmware revision")
                    && typeof sysConfig["Firmware revision"] === "string"
                ? sysConfig["Firmware revision"]
                : null,
            debugMode: sysConfig.debug_mode,
            debugName: indexes.debugName,
            fieldsMask: sysConfig.fields_mask,
            logIndex: typeof flightLog.getLogIndex === "function" ? flightLog.getLogIndex() : 0,
            logMinTimeUs: selectedRange.logMinTimeUs,
            logMaxTimeUs: selectedRange.logMaxTimeUs,
            minTimeUs: minTimeUs,
            maxTimeUs: maxTimeUs,
            durationUs: durationUs,
            sampleCount: 0,
            firstSampleTimeUs: null,
            lastSampleTimeUs: null,
            invalidTimeCount: 0,
            invalidRequiredValueCount: 0,
            invalidGovernorValueCount: 0,
            // The parser's aggregate corruption counter has no timestamps, so
            // attributing any part of it to a selected graph range would leak
            // whole-file evidence into a range-only result.
            corruptFrames: null,
            discontinuities: 0,
            hasEndMarker: false,
            // FlightLog's public max time is the final decoded I-frame. A
            // trailing LOG_END event can have a later timestamp that no graph
            // Out marker can select, so range-only analysis cannot fairly
            // classify the end marker as present or missing.
            endMarkerEvaluable: false,
            dtSamples: [],
            maximumFrameIntervalUs: null,
            axisAccumulators: [makeAxisAccumulator(), makeAxisAccumulator(), makeAxisAccumulator()],
            battery: { count: 0, minRaw: Infinity, maxRaw: -Infinity },
            cellCount: cellCount,
            minimumCellVoltageRaw: Number(sysConfig.vbatmincellvoltage),
            warningCellVoltageRaw: Number(sysConfig.vbatwarningcellvoltage),
            maximumCellVoltageRaw: Number(sysConfig.vbatmaxcellvoltage),
            batteryConfigurationStatus: !batteryConfigurationLogged
                ? "missing"
                : (batteryConfigurationValid ? "accepted" : "invalid"),
            loggingRateConfigurationStatus: !loggingRateConfigurationLogged
                ? "missing"
                : (loggingRateConfigurationValid ? "accepted" : "invalid"),
            poweredSampleCount: 0,
            poweredDurationUs: 0,
            safetySampleCoverage: {
                failsafePhase: { valid: 0, missing: 0 },
                rxSignalReceived: { valid: 0, missing: 0 },
                rxFlightChannelsValid: { valid: 0, missing: 0 },
                flightModeFlags: { valid: 0, missing: 0 },
                battery: { valid: 0, missing: 0 }
            },
            failsafeSampleCount: 0,
            rxLossSampleCount: 0,
            invalidRxChannelsSampleCount: 0,
            unsafeFlightModeSampleCount: 0,
            numericPlausibilityViolationCount: 0,
            governorSource: indexes.governorSource,
            governorRecords: [],
            governorEvents: [],
            governorEventsCapped: false,
            governorRecordsCapped: false,
            governorRecordsFullRate: true,
            governorConfiguration: governorConfiguration,
            mechanicalGate: mechanicalGate,
            safetyEventCodes: [],
            coverage: {
                setpointAxes: indexes.setpoints.map(function(index) { return index !== null; }),
                gyroAxes: indexes.gyros.map(function(index) { return index !== null; }),
                rawGyroAxes: indexes.rawGyros.map(function(index) { return index !== null; }),
                battery: indexes.vbat !== null,
                batteryConfiguration: batteryConfigurationValid,
                loggingRateConfiguration: loggingRateConfigurationValid,
                headspeed: indexes.headspeed !== null,
                collective: indexes.collective !== null,
                collectiveRange: governorConfiguration.collectiveRangeLogged,
                mainMotor: indexes.mainMotor !== null,
                motorCount: indexes.motors.length,
                failsafePhase: indexes.failsafePhase !== null,
                flightModeFlags: indexes.flightModeFlags !== null,
                rxHealth: indexes.rxSignalReceived !== null
                    && indexes.rxFlightChannelsValid !== null,
                governor: indexes.governorSource !== null,
                governorRequest: indexes.governorFields !== null
                    && indexes.governorFields.request !== null,
                governorTarget: indexes.governorFields !== null
                    && indexes.governorFields.target !== null,
                governorActual: indexes.governorFields !== null
                    && indexes.governorFields.actual !== null,
                governorSettings: governorConfiguration.govPidLogged,
                governorTta: governorConfiguration.ttaLogged,
                governorMaxThrottle: governorConfiguration.maxThrottlePercent !== null
            },
            configurationWarnings: []
        };

        if (!loggingRateConfigurationValid) {
            snapshot.configurationWarnings.push("missing-logging-rate-header");
        }

        reportProgress(options, "quality", 0, windowCount);

        for (var windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            checkCancelled(options);
            var windowStartUs = minTimeUs + windowIndex * WINDOW_US;
            var windowEndUs = Math.min(maxTimeUs, windowStartUs + WINDOW_US);
            var chunks = flightLog.getChunksInTimeRange(windowStartUs, windowEndUs);
            processEvents(snapshot, chunks, seenEventKeys, minTimeUs, maxTimeUs);

            chunks.forEach(function(chunk, chunkPosition) {
                Object.keys(chunk.gapStartsHere || {}).forEach(function(frameKey) {
                    var boundaries = gapBoundaryTimes(
                        chunks,
                        chunkPosition,
                        Number(frameKey),
                        indexes.time
                    );
                    if (boundaries.leftTimeUs === null
                            || boundaries.rightTimeUs === null
                            || boundaries.leftTimeUs < minTimeUs
                            || boundaries.rightTimeUs > maxTimeUs) {
                        return;
                    }
                    var gapKey = String(chunk.index) + ":" + frameKey;
                    seenGaps[gapKey] = true;
                });

                (chunk.frames || []).forEach(function(frame, framePosition) {
                    var timeUs = finiteFrameValue(frame, indexes.time);
                    var isLastWindow = windowIndex === windowCount - 1;
                    var stableFrameKey = String(chunk.index) + ":"
                        + framePosition + ":" + timeUs;
                    if (timeUs === null) {
                        // An untimestamped frame cannot be proven to lie inside
                        // the selected range, so do not attribute it to I→O.
                        return;
                    }

                    if (timeUs < windowStartUs
                            || (!isLastWindow && timeUs >= windowEndUs)
                            || timeUs > maxTimeUs) {
                        return;
                    }

                    if (lastFrameTimeUs !== null && timeUs <= lastFrameTimeUs) {
                        // FlightLog may return the same frame object in two
                        // overlapping chunks. Ignore that known overlap, but
                        // fail closed on a distinct duplicate/backward frame.
                        if (seenAcceptedFrameKeys[stableFrameKey]) {
                            return;
                        }
                        snapshot.invalidTimeCount++;
                        return;
                    }
                    seenAcceptedFrameKeys[stableFrameKey] = true;

                    snapshot.sampleCount++;
                    if (snapshot.firstSampleTimeUs === null) {
                        snapshot.firstSampleTimeUs = timeUs;
                    }
                    snapshot.lastSampleTimeUs = timeUs;
                    if (snapshot.sampleCount % 1024 === 0) {
                        checkCancelled(options);
                    }
                    var keepQuantileSample = timeUs >= nextQuantileTimeUs;
                    if (keepQuantileSample) {
                        nextQuantileTimeUs = timeUs + quantileStrideUs;
                    }

                    if (lastFrameTimeUs !== null) {
                        var deltaUs = timeUs - lastFrameTimeUs;
                        snapshot.maximumFrameIntervalUs = snapshot.maximumFrameIntervalUs === null
                            ? deltaUs
                            : Math.max(snapshot.maximumFrameIntervalUs, deltaUs);
                        if (deltaUs > 100000) {
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
                    var requestRpm = null;
                    var targetRpm = null;
                    var actualRpm = null;
                    var collective = null;
                    var collectivePercent = null;
                    var failsafePhase = null;
                    var flightModeFlags = null;
                    var rxSignalReceived = null;
                    var rxChannelsValid = null;
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
                            snapshot.safetySampleCoverage.battery.valid++;
                            snapshot.battery.count++;
                            snapshot.battery.minRaw = Math.min(snapshot.battery.minRaw, vbatRaw);
                            snapshot.battery.maxRaw = Math.max(snapshot.battery.maxRaw, vbatRaw);
                        } else {
                            snapshot.safetySampleCoverage.battery.missing++;
                        }

                        var failsafePhaseRaw = finiteFrameValue(frame, indexes.failsafePhase);
                        var flightModeFlagsRaw = finiteFrameValue(frame, indexes.flightModeFlags);
                        var rxSignalReceivedRaw = finiteFrameValue(
                            frame,
                            indexes.rxSignalReceived
                        );
                        var rxChannelsValidRaw = finiteFrameValue(
                            frame,
                            indexes.rxFlightChannelsValid
                        );
                        failsafePhase = Number.isInteger(failsafePhaseRaw)
                                && failsafePhaseRaw >= 0 && failsafePhaseRaw <= 6
                            ? failsafePhaseRaw
                            : null;
                        flightModeFlags = Number.isInteger(flightModeFlagsRaw)
                                && flightModeFlagsRaw >= 0
                                && flightModeFlagsRaw <= 0xFFFFFFFF
                            ? flightModeFlagsRaw
                            : null;
                        rxSignalReceived = rxSignalReceivedRaw === 0
                                || rxSignalReceivedRaw === 1
                            ? rxSignalReceivedRaw
                            : null;
                        rxChannelsValid = rxChannelsValidRaw === 0
                                || rxChannelsValidRaw === 1
                            ? rxChannelsValidRaw
                            : null;
                        if (failsafePhase === null) {
                            snapshot.safetySampleCoverage.failsafePhase.missing++;
                        } else {
                            snapshot.safetySampleCoverage.failsafePhase.valid++;
                        }
                        if (flightModeFlags === null) {
                            snapshot.safetySampleCoverage.flightModeFlags.missing++;
                        } else {
                            snapshot.safetySampleCoverage.flightModeFlags.valid++;
                        }
                        if (rxSignalReceived === null) {
                            snapshot.safetySampleCoverage.rxSignalReceived.missing++;
                        } else {
                            snapshot.safetySampleCoverage.rxSignalReceived.valid++;
                        }
                        if (rxChannelsValid === null) {
                            snapshot.safetySampleCoverage.rxFlightChannelsValid.missing++;
                        } else {
                            snapshot.safetySampleCoverage.rxFlightChannelsValid.valid++;
                        }
                        if (failsafePhase !== null && failsafePhase !== 0) {
                            snapshot.failsafeSampleCount++;
                        }
                        if (flightModeFlags !== null
                                && (flightModeFlags & RF46_UNSAFE_FLIGHT_MODE_MASK) !== 0) {
                            snapshot.unsafeFlightModeSampleCount++;
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

                    if (indexes.governor) {
                        if (snapshot.governorRecords.length >= MAX_GOVERNOR_RECORDS) {
                            snapshot.governorRecordsCapped = true;
                            snapshot.governorRecordsFullRate = false;
                        } else {
                            targetRpm = finiteFrameValue(frame, indexes.governor.target);
                            actualRpm = finiteFrameValue(frame, indexes.governor.actual);
                            requestRpm = finiteFrameValue(frame, indexes.governor.request);
                            collective = finiteFrameValue(frame, indexes.collective);
                            collectivePercent = normalizeCollective(
                                collective,
                                governorConfiguration.collectiveRange
                            );
                            var yawSetpoint = finiteFrameValue(frame, indexes.setpoints[2]);
                            var yawGyro = finiteFrameValue(frame, indexes.gyros[2]);
                            var rpmPlausible = requestRpm !== null
                                && targetRpm !== null
                                && actualRpm !== null
                                && requestRpm >= 0 && requestRpm <= 50000
                                && targetRpm >= 0 && targetRpm <= 50000
                                && actualRpm >= 0 && actualRpm <= 50000;
                            var motorPlausible = mainMotorPct !== null
                                && mainMotorPct >= 0 && mainMotorPct <= 100;
                            var collectivePlausible = collectivePercent !== null
                                && Math.abs(collectivePercent) <= 105;
                            if (requestRpm === null
                                    || targetRpm === null
                                    || actualRpm === null
                                    || collective === null
                                    || mainMotorPct === null
                                    || yawSetpoint === null
                                    || yawGyro === null
                                    || !rpmPlausible
                                    || !motorPlausible
                                    || !collectivePlausible) {
                                snapshot.invalidGovernorValueCount++;
                            }
                            if (((requestRpm !== null || targetRpm !== null
                                        || actualRpm !== null) && !rpmPlausible)
                                    || (mainMotorPct !== null && !motorPlausible)
                                    || (collectivePercent !== null
                                        && !collectivePlausible)) {
                                snapshot.numericPlausibilityViolationCount++;
                            }
                            if (targetRpm !== null && actualRpm !== null) {
                                snapshot.governorRecords.push({
                                    timeUs: timeUs,
                                    requestRpm: requestRpm,
                                    targetRpm: targetRpm,
                                    actualRpm: actualRpm,
                                    collective: collective,
                                    collectivePercent: collectivePercent,
                                    yawSetpointDps: yawSetpoint,
                                    yawErrorDps: yawSetpoint !== null && yawGyro !== null
                                        ? yawSetpoint - yawGyro
                                        : null,
                                    motorPct: mainMotorPct,
                                    armed: flightModeFlags === null
                                        ? null
                                        : (flightModeFlags & ARMED_FLIGHT_MODE_MASK) !== 0
                                });
                            }
                        }
                    }

                    [timeUs, requestRpm, targetRpm, actualRpm, collective, mainMotorPct]
                        .forEach(function(value) {
                            selectedFingerprintHash = updateFingerprint(
                                selectedFingerprintHash,
                                value
                            );
                        });
                });
            });

            reportProgress(options, "quality", windowIndex + 1, windowCount);
            await yieldToEventLoop();
        }

        snapshot.discontinuities += Object.keys(seenGaps).length;
        snapshot.selectedDataFingerprint = "sel-"
            + ("00000000" + (selectedFingerprintHash >>> 0).toString(16)).slice(-8)
            + "-" + snapshot.sampleCount;
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
        var evidencePackage = rules.buildEvidencePackage(
            snapshot,
            measurement,
            settings.confirmations || null
        );
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
