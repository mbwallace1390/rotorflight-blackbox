"use strict";

(function(root, factory) {
    var isCommonJs = typeof module === "object" && module.exports;
    var api = factory(isCommonJs);

    if (isCommonJs) {
        module.exports = api;
    }

    if (root && !isCommonJs) {
        root.RotorLensCyclicPidAnalysis = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this,
function(enableNodeTestSeam) {
    var SCHEMA_VERSION = 1;
    var CAPTURE_KIND = "rotorlens-cyclic-pid-capture";
    var COMPARISON_KIND = "rotorlens-cyclic-pid-comparison";
    var AXES = ["roll", "pitch", "yaw"];
    var TERMS = ["P", "I", "D"];
    var LOG_WINDOW_US = 1000000;
    var MAX_SELECTION_DURATION_US = 30000000;
    var MAX_INPUT_SAMPLES = 64000;
    var MAX_STOP_EVENTS = 64;
    var MAX_REASON_CODES = 32;
    var SUPPORTED_FIRMWARE_TYPE = 5;
    var SUPPORTED_FIRMWARE_VERSION = "4.6.0";
    var SUPPORTED_FIRMWARE_REVISION =
        /^Rotorflight 4\.6\.0 \(118e912\) [A-Za-z0-9_.-]+$/i;
    var MIN_SAMPLE_RATE_HZ = 900;
    var MAX_P99_INTERVAL_US = 1500;
    var MAX_FRAME_INTERVAL_US = 5000;
    var MIN_RANGE_COVERAGE_RATIO = 0.98;
    var MIN_POWERED_COVERAGE_RATIO = 0.98;
    var MIN_STOP_EVENTS = 4;
    var COMMAND_THRESHOLD_DPS = 80;
    var STOP_THRESHOLD_DPS = 20;
    var OFF_AXIS_LIMIT_DPS = 30;
    var OFF_AXIS_GYRO_LIMIT_DPS = 45;
    var OFF_AXIS_GYRO_MATCH_RATIO = 0.20;
    var OFF_AXIS_GYRO_ABSOLUTE_TOLERANCE_DPS = 2;
    var MIN_COMMAND_DURATION_US = 150000;
    var TRACKING_WINDOW_US = 150000;
    var FAST_WINDOW_START_US = 20000;
    var FAST_WINDOW_END_US = 250000;
    var SLOW_WINDOW_START_US = 250000;
    var SLOW_WINDOW_END_US = 1000000;
    var MIN_EVENT_SPACING_US = 1050000;
    var COMPARISON_TOLERANCE_RATIO = 0.10;
    var SAMPLE_RATE_MATCH_RATIO = 0.10;
    var RANGE_DURATION_MATCH_RATIO = 0.20;
    var MANEUVER_AMPLITUDE_MATCH_RATIO = 0.20;
    var HEADSPEED_MATCH_RATIO = 0.05;
    var MAX_HEADSPEED_VARIATION_RATIO = 0.05;
    var MIN_PLAUSIBLE_HEADSPEED_RPM = 300;
    var MAX_PLAUSIBLE_HEADSPEED_RPM = 10000;
    var COMMAND_DURATION_MATCH_RATIO = 0.20;
    var COLLECTIVE_MATCH_RANGE_RATIO = 0.05;
    var MAX_COLLECTIVE_VARIATION_RANGE_RATIO = 0.10;
    var BATTERY_MATCH_RATIO = 0.10;
    var MAX_BATTERY_VARIATION_RATIO = 0.10;
    var BATTERY_VARIATION_MATCH_RATIO = 0.05;
    var MAX_PRESELECTION_EVENT_CHUNKS = 256;
    var MAX_ACTIVITY_SUMMARY_POINTS = 65536;
    var EVENT_INFLIGHT_ADJUSTMENT = 13;
    var EVENT_LOGGING_RESUME = 14;
    var EVENT_DISARM = 15;
    var EVENT_FLIGHT_MODE = 30;
    var EVENT_RESCUE_STATE = 51;
    var EVENT_AIRBORNE_STATE = 52;
    var ARMED_MODE_MASK = 1;
    // Rotorflight 4.6: self-level/trainer/altitude/rescue/failsafe,
    // paralyze/calibration/stick-disable, and governor fallback states.
    var UNSAFE_MODE_MASK = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)
        | (1 << 5) | (1 << 6) | (1 << 7) | (1 << 9) | (1 << 13)
        | (1 << 24) | (1 << 25) | (1 << 26) | (1 << 27);
    var PID_FIELD_NAMES = ["axisP", "axisI", "axisD", "axisF", "axisB", "axisO"];
    var CONFIG_CONTEXT_KEYS = [
        "looptime", "gyro_sync_denom", "gyro_decimation_hz", "pid_process_denom",
        "filter_process_denom", "frameIntervalPNum", "frameIntervalPDenom",
        "fields_mask", "gyro_to_use", "features", "govPID", "gyroScale",
        "vbatscale", "vbatref", "motor_poles", "dshot_bidir",
        "motorOutput", "motor_output_limit", "digitalIdleOffset",
        "rollBW", "pitchBW", "yawBW", "iterm_relax_type",
        "iterm_relax_cutoff", "error_limit", "error_decay",
        "error_decay_ground", "cyclic_coupling", "yaw_stop_gain",
        "yaw_precomp", "yaw_precomp_impulse", "yaw_inertia_precomp",
        "yaw_tta", "hsi_gain", "hsi_limit", "pitch_compensation",
        "pidProfile", "pid_profile",
        "profile", "pidController", "pid_mode", "rates", "rate_limits",
        "rates_type", "rc_rates", "rc_expo", "accel_limit", "response_time",
        "ff_transition", "ff_averaging", "ff_smooth_factor",
        "ff_jitter_factor", "ff_boost", "ff_max_rate_limit",
        "dterm_average_count", "dterm_lpf_hz", "dterm_lpf_dyn_hz",
        "dterm_lpf2_hz", "dterm_differentiator", "dterm_filter_type",
        "dterm_filter2_type", "dterm_notch_hz", "dterm_notch_cutoff",
        "dterm_rpm_notch_harmonics", "dterm_rpm_notch_q",
        "dterm_rpm_notch_min", "gyro_lpf", "gyro_32khz_hardware_lpf",
        "gyro_soft_type", "gyro_soft2_type",
        "gyro_lowpass_hz", "gyro_lowpass_dyn_hz", "gyro_lowpass2_hz",
        "gyro_notch_hz", "gyro_notch_cutoff", "dyn_notch_range",
        "dyn_notch_width_percent", "dyn_notch_count", "dyn_notch_q",
        "dyn_notch_min_hz", "dyn_notch_max_hz",
        "gyro_rpm_notch_harmonics", "gyro_rpm_notch_q",
        "gyro_rpm_notch_min", "rpm_notch_lpf", "rpm_filter_fade_range_hz",
        "gyro_rpm_filter_bank_rpm_source", "gyro_rpm_filter_bank_rpm_limit",
        "gyro_rpm_filter_bank_notch_q", "gyro_rpm_notch_preset",
        "gyro_rpm_notch_min_hz", "gyro_rpm_notch_source_pitch",
        "gyro_rpm_notch_center_pitch", "gyro_rpm_notch_q_pitch",
        "gyro_rpm_notch_source_roll", "gyro_rpm_notch_center_roll",
        "gyro_rpm_notch_q_roll", "gyro_rpm_notch_source_yaw",
        "gyro_rpm_notch_center_yaw", "gyro_rpm_notch_q_yaw",
        "rollPitchItermResetRate", "yawItermResetRate", "iterm_reset_offset",
        "yaw_p_limit", "yaw_lpf_hz", "use_integrated_yaw", "d_min",
        "d_min_gain", "d_min_advance", "ptermSetpointWeight",
        "dtermSetpointWeight", "deadband",
        "yaw_deadband", "rc_smoothing", "rc_interpolation",
        "rc_interpolation_channels", "rc_interpolation_interval",
        "rc_smoothing_rx_average", "rc_smoothing_mode",
        "rc_smoothing_feedforward_hz", "rc_smoothing_setpoint_hz",
        "rc_smoothing_auto_factor_setpoint", "rc_smoothing_throttle_hz",
        "rc_smoothing_auto_factor_throttle", "rc_smoothing_active_cutoffs",
        "rc_smoothing_cutoffs", "rc_smoothing_filter_type",
        "rc_smoothing_active_cutoffs_ff_sp_thr", "collectiveRange"
    ];

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function addCode(codes, code) {
        if (codes.length < MAX_REASON_CODES && codes.indexOf(code) === -1) {
            codes.push(code);
        }
    }

    function codedError(Constructor, code, message) {
        var error = new Constructor(message);
        error.code = code;
        return error;
    }

    function cancelledError() {
        return codedError(
            Error,
            "CYCLIC_ANALYSIS_CANCELLED",
            "Cyclic PID comparison analysis was cancelled"
        );
    }

    function checkCancelled(options) {
        if (options && typeof options.isCancelled === "function"
                && options.isCancelled()) {
            throw cancelledError();
        }
    }

    function reportProgress(options, phase, completed, total) {
        if (!options || typeof options.onProgress !== "function") {
            return;
        }
        try {
            options.onProgress(Object.freeze({
                phase: phase,
                completed: completed,
                total: total
            }));
        } catch (error) {
            // Rendering progress must not change deterministic evidence.
        }
    }

    function yieldToEventLoop() {
        return new Promise(function(resolve) {
            setTimeout(resolve, 0);
        });
    }

    function deepFreeze(value) {
        if (!value || typeof value !== "object" || Object.isFrozen(value)) {
            return value;
        }
        Object.keys(value).forEach(function(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function finiteOutput(value, path) {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw codedError(
                TypeError,
                "CYCLIC_OUTPUT_NONFINITE",
                "Non-finite cyclic evidence at " + path
            );
        }
        if (!value || typeof value !== "object") {
            return;
        }
        Object.keys(value).forEach(function(key) {
            finiteOutput(value[key], path + "." + key);
        });
    }

    function seal(value) {
        finiteOutput(value, "result");
        return deepFreeze(value);
    }

    function round(value, digits) {
        if (!Number.isFinite(value)) {
            return null;
        }
        var scale = Math.pow(10, digits === undefined ? 4 : digits);
        return Math.round(value * scale) / scale;
    }

    function updateHash(hash, text) {
        var source = String(text);
        for (var index = 0; index < source.length; index++) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        hash ^= 124;
        return Math.imul(hash, 16777619) >>> 0;
    }

    function hashValue(hash, value, ignoredKey) {
        if (value === null) {
            return updateHash(hash, "null");
        }
        if (Array.isArray(value)) {
            hash = updateHash(hash, "[");
            value.forEach(function(item) {
                hash = hashValue(hash, item, ignoredKey);
            });
            return updateHash(hash, "]");
        }
        if (value && typeof value === "object") {
            hash = updateHash(hash, "{");
            Object.keys(value).sort().forEach(function(key) {
                if (key === ignoredKey) {
                    return;
                }
                hash = updateHash(hash, key);
                hash = hashValue(hash, value[key], ignoredKey);
            });
            return updateHash(hash, "}");
        }
        return updateHash(hash, typeof value + ":" + String(value));
    }

    function hashLabel(prefix, value, ignoredKey) {
        var hash = hashValue(2166136261, value, ignoredKey);
        return prefix + ("00000000" + hash.toString(16)).slice(-8);
    }

    function selectedFingerprint(records) {
        var hash = 2166136261;
        records.forEach(function(record) {
            hash = hashValue(hash, [
                record.timeUs,
                record.setpoint,
                record.gyro,
                record.raw,
                record.terms,
                record.collective,
                record.headspeed,
                record.motor,
                record.vbat,
                record.failsafePhase,
                record.flightModeFlags,
                record.rxSignalReceived,
                record.rxFlightChannelsValid
            ]);
        });
        return "sel-" + ("00000000" + hash.toString(16)).slice(-8)
            + "-" + records.length;
    }

    function captureIntegrityKey(capture) {
        return hashLabel("cap-", capture, "integrityKey");
    }

    function finiteValues(values) {
        return (values || []).filter(Number.isFinite);
    }

    function quantile(values, percentile) {
        var source = finiteValues(values).slice().sort(function(a, b) {
            return a - b;
        });
        if (source.length === 0) {
            return null;
        }
        var index = (source.length - 1) * Math.max(0, Math.min(1, percentile));
        var lower = Math.floor(index);
        var upper = Math.ceil(index);
        if (lower === upper) {
            return source[lower];
        }
        return source[lower] + (source[upper] - source[lower]) * (index - lower);
    }

    function rms(values) {
        var source = finiteValues(values);
        if (source.length === 0) {
            return null;
        }
        return Math.sqrt(source.reduce(function(sum, value) {
            return sum + value * value;
        }, 0) / source.length);
    }

    function relativeDifference(left, right) {
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
            return null;
        }
        var reference = Math.max(Math.abs(left), Math.abs(right), 1e-9);
        return Math.abs(left - right) / reference;
    }

    function fieldIndex(flightLog, name) {
        var index = flightLog.getMainFieldIndexByName(name);
        return index === undefined ? null : index;
    }

    function frameValue(frame, index) {
        if (index === null) {
            return null;
        }
        var value = frame[index];
        return Number.isFinite(value) ? value : null;
    }

    function requireFlightLog(flightLog) {
        if (!flightLog
                || typeof flightLog.getMinTime !== "function"
                || typeof flightLog.getMaxTime !== "function"
                || typeof flightLog.getSysConfig !== "function"
                || typeof flightLog.getMainFieldIndexByName !== "function"
                || typeof flightLog.getChunksInTimeRange !== "function") {
            throw codedError(
                TypeError,
                "CYCLIC_FLIGHT_LOG_REQUIRED",
                "A parsed FlightLog is required"
            );
        }
    }

    function requireAxisTerm(options) {
        var axis = options && options.axis;
        var term = options && options.term;
        if (AXES.indexOf(axis) === -1) {
            throw codedError(
                RangeError,
                "CYCLIC_AXIS_INVALID",
                "Cyclic axis must be roll, pitch, or yaw"
            );
        }
        if (TERMS.indexOf(term) === -1) {
            throw codedError(
                RangeError,
                "CYCLIC_TERM_INVALID",
                "Cyclic PID term must be P, I, or D"
            );
        }
        return { axis: axis, term: term };
    }

    function requireRange(flightLog, options) {
        var requested = options && options.timeRangeUs;
        if (!requested || !Number.isFinite(requested.startTimeUs)
                || !Number.isFinite(requested.endTimeUs)) {
            throw codedError(
                RangeError,
                "CYCLIC_RANGE_REQUIRED",
                "Set both graph In and Out markers before capturing cyclic PID evidence"
            );
        }
        var logStart = flightLog.getMinTime();
        var logEnd = flightLog.getMaxTime();
        if (!Number.isFinite(logStart) || !Number.isFinite(logEnd)
                || requested.startTimeUs < logStart
                || requested.endTimeUs > logEnd
                || requested.startTimeUs >= requested.endTimeUs) {
            throw codedError(
                RangeError,
                "CYCLIC_RANGE_INVALID",
                "The selected graph In/Out range is invalid for this log"
            );
        }
        if (requested.endTimeUs - requested.startTimeUs
                > MAX_SELECTION_DURATION_US) {
            throw codedError(
                RangeError,
                "CYCLIC_RANGE_DURATION_LIMIT",
                "The selected cyclic PID range exceeds the analysis limit"
            );
        }
        return {
            startTimeUs: requested.startTimeUs,
            endTimeUs: requested.endTimeUs,
            durationUs: requested.endTimeUs - requested.startTimeUs
        };
    }

    function copyConfigValue(value) {
        if (Number.isFinite(value) || typeof value === "boolean" || value === null) {
            return value;
        }
        if (typeof value === "string" && value.length <= 128) {
            return value;
        }
        if (Array.isArray(value) && value.length <= 32
                && value.every(function(item) {
                    return Number.isFinite(item) || typeof item === "boolean"
                        || item === null || (typeof item === "string"
                            && item.length <= 128);
                })) {
            return value.slice();
        }
        return undefined;
    }

    function pidArray(sysConfig, key, codes) {
        if (!hasOwn(sysConfig, key) || !Array.isArray(sysConfig[key])
                || sysConfig[key].length < 5 || sysConfig[key].length > 6
                || !sysConfig[key].every(Number.isFinite)) {
            addCode(codes, "PID_CONFIGURATION_MISSING_OR_INVALID");
            return null;
        }
        return sysConfig[key].slice();
    }

    function collectConfiguration(sysConfig, codes) {
        var pid = {
            roll: pidArray(sysConfig, "rollPID", codes),
            pitch: pidArray(sysConfig, "pitchPID", codes),
            yaw: pidArray(sysConfig, "yawPID", codes)
        };
        var context = {};
        var invalidContext = [];
        CONFIG_CONTEXT_KEYS.forEach(function(key) {
            if (!hasOwn(sysConfig, key)) {
                return;
            }
            var copied = copyConfigValue(sysConfig[key]);
            if (copied === undefined) {
                invalidContext.push(key);
            } else {
                context[key] = copied;
            }
        });
        if (invalidContext.length > 0) {
            addCode(codes, "CONFIGURATION_CONTEXT_INVALID");
        }
        return {
            pid: pid,
            context: context,
            contextKeys: Object.keys(context).sort(),
            invalidContextKeys: invalidContext.sort()
        };
    }

    function collectIndexes(flightLog, axisIndex) {
        var raw = [0, 1, 2].map(function(index) {
            var rawIndex = fieldIndex(flightLog, "gyroRAW[" + index + "]");
            return rawIndex !== null
                ? { index: rawIndex, source: "gyroRAW" }
                : (function() {
                    var unfiltered = fieldIndex(flightLog, "gyroUnfilt[" + index + "]");
                    return unfiltered === null
                        ? { index: null, source: null }
                        : { index: unfiltered, source: "gyroUnfilt" };
                }());
        });
        var terms = PID_FIELD_NAMES.map(function(prefix) {
            return fieldIndex(flightLog, prefix + "[" + axisIndex + "]");
        });
        var collectiveIndex = fieldIndex(flightLog, "setpoint[3]");
        var collectiveSource = collectiveIndex === null ? null : "setpoint[3]";
        if (collectiveIndex === null) {
            collectiveIndex = fieldIndex(flightLog, "mixer[3]");
            collectiveSource = collectiveIndex === null ? null : "mixer[3]";
        }
        return {
            time: fieldIndex(flightLog, "time"),
            setpoint: [0, 1, 2].map(function(index) {
                return fieldIndex(flightLog, "setpoint[" + index + "]");
            }),
            gyro: [0, 1, 2].map(function(index) {
                return fieldIndex(flightLog, "gyroADC[" + index + "]");
            }),
            raw: raw,
            terms: terms,
            collective: {
                index: collectiveIndex,
                source: collectiveSource
            },
            headspeed: fieldIndex(flightLog, "headspeed"),
            motor: fieldIndex(flightLog, "motor[0]"),
            vbat: fieldIndex(flightLog, "Vbat"),
            failsafePhase: fieldIndex(flightLog, "failsafePhase"),
            flightModeFlags: fieldIndex(flightLog, "flightModeFlags"),
            rxSignalReceived: fieldIndex(flightLog, "rxSignalReceived"),
            rxFlightChannelsValid: fieldIndex(flightLog, "rxFlightChannelsValid")
        };
    }

    function fieldAvailability(indexes) {
        var availability = {
            time: indexes.time !== null,
            setpointAxes: indexes.setpoint.map(function(index) { return index !== null; }),
            gyroAxes: indexes.gyro.map(function(index) { return index !== null; }),
            rawGyroAxes: indexes.raw.map(function(item) { return item.index !== null; }),
            rawGyroSources: indexes.raw.map(function(item) { return item.source; }),
            pidTerms: {}
        };
        PID_FIELD_NAMES.forEach(function(name, index) {
            availability.pidTerms[name.slice(4)] = indexes.terms[index] !== null;
        });
        availability.collective = indexes.collective.index !== null;
        availability.collectiveSource = indexes.collective.source;
        availability.headspeed = indexes.headspeed !== null;
        availability.motor = indexes.motor !== null;
        availability.vbat = indexes.vbat !== null;
        availability.failsafePhase = indexes.failsafePhase !== null;
        availability.flightModeFlags = indexes.flightModeFlags !== null;
        availability.rxSignalReceived = indexes.rxSignalReceived !== null;
        availability.rxFlightChannelsValid = indexes.rxFlightChannelsValid !== null;
        return availability;
    }

    function validateFieldAvailability(availability, codes) {
        if (!availability.time
                || availability.setpointAxes.some(function(value) { return !value; })
                || availability.gyroAxes.some(function(value) { return !value; })) {
            addCode(codes, "COMMAND_OR_GYRO_FIELDS_MISSING");
        }
        if (availability.rawGyroAxes.some(function(value) { return !value; })) {
            addCode(codes, "RAW_GYRO_FIELDS_MISSING");
        }
        if (Object.keys(availability.pidTerms).some(function(key) {
            return !availability.pidTerms[key];
        })) {
            addCode(codes, "PID_TERM_FIELDS_MISSING");
        }
        if (!availability.headspeed) {
            addCode(codes, "HEADSPEED_FIELD_MISSING");
        }
        if (!availability.collective) {
            addCode(codes, "COLLECTIVE_FIELD_MISSING");
        }
        if (!availability.vbat) {
            addCode(codes, "BATTERY_FIELD_MISSING");
        }
        if (!availability.failsafePhase || !availability.flightModeFlags
                || !availability.rxSignalReceived
                || !availability.rxFlightChannelsValid) {
            addCode(codes, "SAFETY_FIELDS_MISSING");
        }
        if (!availability.headspeed && !availability.motor) {
            addCode(codes, "POWER_FIELDS_MISSING");
        }
    }

    function eventCodes(chunks, range, seenEvents, codes, counters) {
        (chunks || []).forEach(function(chunk) {
            (chunk.events || []).forEach(function(event) {
                var data = event.data || {};
                var key = [event.event, event.time, data.func, data.newFlags,
                    data.lastFlags, data.rescueState, data.airborneState].join(":");
                if (seenEvents[key]) {
                    return;
                }
                seenEvents[key] = true;
                if (!Number.isFinite(event.time)) {
                    if (event.event === EVENT_INFLIGHT_ADJUSTMENT) {
                        addCode(codes, "CONFIGURATION_STATE_UNVERIFIED");
                    }
                    return;
                }
                if (event.event === EVENT_INFLIGHT_ADJUSTMENT
                        && event.time < range.startTimeUs) {
                    addCode(codes, "PRESELECTION_INFLIGHT_ADJUSTMENT");
                    return;
                }
                if (event.time < range.startTimeUs || event.time > range.endTimeUs) {
                    return;
                }
                if (event.event === EVENT_INFLIGHT_ADJUSTMENT) {
                    addCode(codes, data.func === 2
                        ? "PID_PROFILE_CHANGE_IN_SELECTION"
                        : "INFLIGHT_ADJUSTMENT_IN_SELECTION");
                } else if (event.event === EVENT_LOGGING_RESUME) {
                    addCode(codes, "LOGGING_RESUME_IN_SELECTION");
                } else if (event.event === EVENT_DISARM) {
                    addCode(codes, "DISARM_IN_SELECTION");
                } else if (event.event === EVENT_RESCUE_STATE) {
                    addCode(codes, "RESCUE_EVENT_IN_SELECTION");
                } else if (event.event === EVENT_AIRBORNE_STATE) {
                    counters.airborneTransitions++;
                    addCode(codes, "AIRBORNE_TRANSITION_IN_SELECTION");
                } else if (event.event === EVENT_FLIGHT_MODE
                        && Number.isInteger(data.newFlags)
                        && Number.isInteger(data.lastFlags)
                        && ((data.newFlags | data.lastFlags) & UNSAFE_MODE_MASK) !== 0) {
                    addCode(codes, "UNSAFE_FLIGHT_MODE_IN_SELECTION");
                }
            });
        });
    }

    function scanPreselectionEvents(flightLog, range, seenEvents, codes, counters,
            options) {
        if (range.startTimeUs <= flightLog.getMinTime()) {
            return;
        }
        if (typeof flightLog.getActivitySummary !== "function") {
            addCode(codes, "CONFIGURATION_STATE_UNVERIFIED");
            return;
        }
        var summary;
        try {
            summary = flightLog.getActivitySummary();
        } catch (error) {
            addCode(codes, "CONFIGURATION_STATE_UNVERIFIED");
            return;
        }
        if (!summary || !Array.isArray(summary.times)
                || !Array.isArray(summary.hasEvent)
                || summary.hasEvent.length > summary.times.length
                || summary.times.length > MAX_ACTIVITY_SUMMARY_POINTS) {
            addCode(codes, "CONFIGURATION_STATE_UNVERIFIED");
            return;
        }
        var eventChunkTimes = [];
        for (var index = 0; index < summary.times.length; index++) {
            if (index % 1024 === 0) {
                checkCancelled(options);
            }
            if (summary.hasEvent[index] && Number.isFinite(summary.times[index])
                    && summary.times[index] < range.startTimeUs) {
                eventChunkTimes.push(summary.times[index]);
            }
        }
        if (eventChunkTimes.length > MAX_PRESELECTION_EVENT_CHUNKS) {
            addCode(codes, "CONFIGURATION_STATE_UNVERIFIED");
            return;
        }
        for (var eventIndex = 0; eventIndex < eventChunkTimes.length; eventIndex++) {
            checkCancelled(options);
            var timeUs = eventChunkTimes[eventIndex];
            var chunks;
            try {
                chunks = flightLog.getChunksInTimeRange(timeUs, timeUs) || [];
            } catch (error) {
                addCode(codes, "CONFIGURATION_STATE_UNVERIFIED");
                continue;
            }
            eventCodes(chunks, range, seenEvents, codes, counters);
        }
    }

    function recordFromFrame(frame, indexes, counters) {
        function presentValue(index) {
            var value = frameValue(frame, index);
            if (index !== null && value === null) {
                counters.nonfiniteSamples++;
            }
            return value;
        }
        return {
            timeUs: presentValue(indexes.time),
            setpoint: indexes.setpoint.map(presentValue),
            gyro: indexes.gyro.map(presentValue),
            raw: indexes.raw.map(function(item) { return presentValue(item.index); }),
            terms: indexes.terms.map(presentValue),
            collective: presentValue(indexes.collective.index),
            headspeed: presentValue(indexes.headspeed),
            motor: presentValue(indexes.motor),
            vbat: presentValue(indexes.vbat),
            failsafePhase: presentValue(indexes.failsafePhase),
            flightModeFlags: presentValue(indexes.flightModeFlags),
            rxSignalReceived: presentValue(indexes.rxSignalReceived),
            rxFlightChannelsValid: presentValue(indexes.rxFlightChannelsValid)
        };
    }

    function requiredRecordFinite(record) {
        return record.setpoint.every(Number.isFinite)
            && record.gyro.every(Number.isFinite)
            && record.raw.every(Number.isFinite)
            && record.terms.every(Number.isFinite);
    }

    function updateSafety(record, counters) {
        var headspeedPlausible = Number.isFinite(record.headspeed)
            && record.headspeed >= MIN_PLAUSIBLE_HEADSPEED_RPM
            && record.headspeed <= MAX_PLAUSIBLE_HEADSPEED_RPM;
        if (!headspeedPlausible) {
            counters.invalidHeadspeedSamples++;
        } else {
            counters.poweredSamples++;
        }
        if (!Number.isFinite(record.vbat) || record.vbat <= 0) {
            counters.invalidBatterySamples++;
        }
        if (!Number.isInteger(record.failsafePhase)
                || record.failsafePhase < 0 || record.failsafePhase > 6
                || !Number.isInteger(record.flightModeFlags)
                || record.flightModeFlags < 0 || record.flightModeFlags > 0xFFFFFFFF
                || (record.rxSignalReceived !== 0 && record.rxSignalReceived !== 1)
                || (record.rxFlightChannelsValid !== 0
                    && record.rxFlightChannelsValid !== 1)) {
            counters.invalidSafetySamples++;
            return;
        }
        if ((record.flightModeFlags & ARMED_MODE_MASK) === 0) {
            counters.unarmedSamples++;
        }
        if ((record.flightModeFlags & UNSAFE_MODE_MASK) !== 0) {
            counters.unsafeModeSamples++;
        }
        if (record.failsafePhase !== 0) {
            counters.failsafeSamples++;
        }
        if (record.rxSignalReceived !== 1 || record.rxFlightChannelsValid !== 1) {
            counters.rxFaultSamples++;
        }
    }

    function invalidTimestampCouldOverlapRange(frames, framePosition, timeIndex,
            range) {
        var previousTime = null;
        var nextTime = null;
        var index;
        for (index = framePosition - 1; index >= 0; index--) {
            previousTime = frameValue(frames[index], timeIndex);
            if (previousTime !== null) {
                break;
            }
        }
        for (index = framePosition + 1; index < frames.length; index++) {
            nextTime = frameValue(frames[index], timeIndex);
            if (nextTime !== null) {
                break;
            }
        }
        if (previousTime !== null && nextTime !== null
                && previousTime >= nextTime) {
            return true;
        }
        // Frame order proves a corrupt leading/trailing timestamp is outside
        // only when the nearest valid boundary already reaches graph In/Out.
        if (nextTime !== null && nextTime <= range.startTimeUs) {
            return false;
        }
        if (previousTime !== null && previousTime >= range.endTimeUs) {
            return false;
        }
        return true;
    }

    function lowerBound(records, timeUs) {
        var low = 0;
        var high = records.length;
        while (low < high) {
            var middle = (low + high) >>> 1;
            if (records[middle].timeUs < timeUs) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return low;
    }

    function recordsBetween(records, startUs, endUs) {
        return records.slice(lowerBound(records, startUs), lowerBound(records, endUs));
    }

    function maximumGap(records) {
        var result = 0;
        for (var index = 1; index < records.length; index++) {
            result = Math.max(result, records[index].timeUs - records[index - 1].timeUs);
        }
        return result;
    }

    function completeWindow(records, startUs, endUs, medianIntervalUs) {
        if (records.length < 3 || !Number.isFinite(medianIntervalUs)) {
            return false;
        }
        var toleranceUs = Math.max(MAX_FRAME_INTERVAL_US, medianIntervalUs * 3);
        return records[0].timeUs <= startUs + toleranceUs
            && records[records.length - 1].timeUs >= endUs - toleranceUs
            && maximumGap(records) <= MAX_FRAME_INTERVAL_US;
    }

    function stepNoiseRms(values) {
        var differences = [];
        for (var index = 1; index < values.length; index++) {
            if (Number.isFinite(values[index]) && Number.isFinite(values[index - 1])) {
                differences.push((values[index] - values[index - 1]) / Math.sqrt(2));
            }
        }
        return rms(differences);
    }

    function minimum(values) {
        var source = finiteValues(values);
        return source.length ? Math.min.apply(Math, source) : null;
    }

    function maximum(values) {
        var source = finiteValues(values);
        return source.length ? Math.max.apply(Math, source) : null;
    }

    function spanRatio(values, center) {
        var low = minimum(values);
        var high = maximum(values);
        if (!Number.isFinite(low) || !Number.isFinite(high)
                || !Number.isFinite(center) || Math.abs(center) < 1e-9) {
            return null;
        }
        return (high - low) / Math.abs(center);
    }

    function eventMetric(records, commandStartIndex, stopIndex, axisIndex,
            termIndex, medianIntervalUs) {
        var stopTimeUs = records[stopIndex].timeUs;
        var trackingStartUs = Math.max(
            records[commandStartIndex].timeUs,
            stopTimeUs - TRACKING_WINDOW_US
        );
        var tracking = recordsBetween(records, trackingStartUs, stopTimeUs);
        var fast = recordsBetween(
            records,
            stopTimeUs + FAST_WINDOW_START_US,
            stopTimeUs + FAST_WINDOW_END_US
        );
        var slow = recordsBetween(
            records,
            stopTimeUs + SLOW_WINDOW_START_US,
            stopTimeUs + SLOW_WINDOW_END_US
        );
        var response = recordsBetween(
            records,
            stopTimeUs,
            stopTimeUs + SLOW_WINDOW_END_US
        );
        var full = recordsBetween(
            records,
            records[commandStartIndex].timeUs,
            stopTimeUs + SLOW_WINDOW_END_US
        );
        if (!completeWindow(tracking, trackingStartUs, stopTimeUs, medianIntervalUs)
                || !completeWindow(fast, stopTimeUs + FAST_WINDOW_START_US,
                    stopTimeUs + FAST_WINDOW_END_US, medianIntervalUs)
                || !completeWindow(slow, stopTimeUs + SLOW_WINDOW_START_US,
                    stopTimeUs + SLOW_WINDOW_END_US, medianIntervalUs)) {
            return null;
        }
        var commandValues = tracking.map(function(record) {
            return record.setpoint[axisIndex];
        });
        var commandMedian = quantile(commandValues, 0.5);
        var commandSignValue = commandMedian >= 0 ? 1 : -1;
        if (!Number.isFinite(commandMedian) || commandValues.some(function(value) {
            return !Number.isFinite(value) || Math.abs(value) < COMMAND_THRESHOLD_DPS
                || (value >= 0 ? 1 : -1) !== commandSignValue;
        })) {
            return { invalidCommand: true };
        }
        var otherAxes = [0, 1, 2].filter(function(index) { return index !== axisIndex; });
        var offAxisPeakDps = Math.max.apply(Math, full.map(function(record) {
            return Math.max(
                Math.abs(record.setpoint[otherAxes[0]]),
                Math.abs(record.setpoint[otherAxes[1]])
            );
        }));
        var selectedPostPeakDps = Math.max.apply(Math, response.map(
            function(record) { return Math.abs(record.setpoint[axisIndex]); }
        ));
        var offAxisGyroRmsDps = rms(full.reduce(function(values, record) {
            values.push(record.gyro[otherAxes[0]], record.gyro[otherAxes[1]]);
            return values;
        }, []));
        var offAxisGyroPeakDps = Math.max.apply(Math, full.map(function(record) {
            return Math.max(
                Math.abs(record.gyro[otherAxes[0]]),
                Math.abs(record.gyro[otherAxes[1]])
            );
        }));
        if (offAxisPeakDps > OFF_AXIS_LIMIT_DPS) {
            return { mixedAxis: true };
        }
        if (selectedPostPeakDps > STOP_THRESHOLD_DPS) {
            return { invalidCommand: true };
        }
        if (offAxisGyroPeakDps > OFF_AXIS_GYRO_LIMIT_DPS) {
            return { excessiveOffAxisGyro: true };
        }
        var headspeeds = full.map(function(record) { return record.headspeed; });
        if (headspeeds.some(function(value) {
            return !Number.isFinite(value)
                || value < MIN_PLAUSIBLE_HEADSPEED_RPM
                || value > MAX_PLAUSIBLE_HEADSPEED_RPM;
        })) {
            return { invalidHeadspeed: true };
        }
        var headspeedMedian = quantile(headspeeds, 0.5);
        var headspeedVariationRatio = spanRatio(headspeeds, headspeedMedian);
        var collectiveValues = full.map(function(record) { return record.collective; });
        if (collectiveValues.some(function(value) { return !Number.isFinite(value); })) {
            return { invalidCollective: true };
        }
        var batteryValues = full.map(function(record) { return record.vbat; });
        if (batteryValues.some(function(value) {
            return !Number.isFinite(value) || value <= 0;
        })) {
            return { invalidBattery: true };
        }
        var commandSign = commandSignValue > 0 ? "positive" : "negative";
        return {
            stopTimeUs: stopTimeUs,
            commandSign: commandSign,
            commandDurationUs: stopTimeUs - records[commandStartIndex].timeUs,
            commandAmplitudeDps: Math.abs(commandMedian),
            trackingRmsDps: rms(tracking.map(function(record) {
                return record.setpoint[axisIndex] - record.gyro[axisIndex];
            })),
            fastRingingRmsDps: rms(fast.map(function(record) {
                return record.gyro[axisIndex];
            })),
            slowOscillationRmsDps: rms(slow.map(function(record) {
                return record.gyro[axisIndex];
            })),
            rawNoiseStepRmsDps: stepNoiseRms(fast.concat(slow).map(function(record) {
                return record.raw[axisIndex];
            })),
            selectedTermRms: rms(tracking.concat(fast).map(function(record) {
                return record.terms[termIndex];
            })),
            offAxisCommandPeakDps: offAxisPeakDps,
            offAxisGyroRmsDps: offAxisGyroRmsDps,
            offAxisGyroPeakDps: offAxisGyroPeakDps,
            headspeedRpm: headspeedMedian,
            headspeedMinimumRpm: minimum(headspeeds),
            headspeedMaximumRpm: maximum(headspeeds),
            headspeedVariationRatio: headspeedVariationRatio,
            collectiveMedian: quantile(collectiveValues, 0.5),
            collectiveMinimum: minimum(collectiveValues),
            collectiveMaximum: maximum(collectiveValues),
            batteryMedian: quantile(batteryValues, 0.5),
            batteryMinimum: minimum(batteryValues),
            batteryMaximum: maximum(batteryValues),
            batteryVariationRatio: spanRatio(
                batteryValues,
                quantile(batteryValues, 0.5)
            )
        };
    }

    function detectStops(records, axisIndex, termIndex, medianIntervalUs, range) {
        var events = [];
        var activeStart = null;
        var activeSign = 0;
        var mixedAxisCandidates = 0;
        var incompleteCandidates = 0;
        var overlappingCandidates = 0;
        var invalidCommandCandidates = 0;
        var excessiveOffAxisGyroCandidates = 0;
        var invalidHeadspeedCandidates = 0;
        var invalidCollectiveCandidates = 0;
        var invalidBatteryCandidates = 0;
        var previousStopTimeUs = -Infinity;

        for (var index = 0; index < records.length; index++) {
            var setpoint = records[index].setpoint[axisIndex];
            if (!Number.isFinite(setpoint)) {
                activeStart = null;
                activeSign = 0;
                continue;
            }
            var absolute = Math.abs(setpoint);
            var sign = setpoint >= 0 ? 1 : -1;
            if (absolute >= COMMAND_THRESHOLD_DPS) {
                if (activeStart === null || sign !== activeSign) {
                    activeStart = index;
                    activeSign = sign;
                }
                continue;
            }
            if (activeStart === null) {
                continue;
            }
            if (absolute > STOP_THRESHOLD_DPS) {
                // A valid stop must release directly from a sustained command.
                // Dropping into a 21..79 dps dwell invalidates that candidate.
                activeStart = null;
                activeSign = 0;
                invalidCommandCandidates++;
                continue;
            }

            var stopTimeUs = records[index].timeUs;
            var commandDurationUs = stopTimeUs - records[activeStart].timeUs;
            if (commandDurationUs < MIN_COMMAND_DURATION_US) {
                activeStart = null;
                activeSign = 0;
                continue;
            }
            if (stopTimeUs + SLOW_WINDOW_END_US > range.endTimeUs) {
                incompleteCandidates++;
                activeStart = null;
                activeSign = 0;
                continue;
            }
            if (stopTimeUs - previousStopTimeUs < MIN_EVENT_SPACING_US) {
                overlappingCandidates++;
                activeStart = null;
                activeSign = 0;
                continue;
            }
            var metric = eventMetric(
                records,
                activeStart,
                index,
                axisIndex,
                termIndex,
                medianIntervalUs
            );
            if (!metric) {
                incompleteCandidates++;
            } else if (metric.mixedAxis) {
                mixedAxisCandidates++;
            } else if (metric.invalidCommand) {
                invalidCommandCandidates++;
            } else if (metric.excessiveOffAxisGyro) {
                excessiveOffAxisGyroCandidates++;
            } else if (metric.invalidHeadspeed) {
                invalidHeadspeedCandidates++;
            } else if (metric.invalidCollective) {
                invalidCollectiveCandidates++;
            } else if (metric.invalidBattery) {
                invalidBatteryCandidates++;
            } else if (events.length < MAX_STOP_EVENTS) {
                events.push(metric);
                previousStopTimeUs = stopTimeUs;
            }
            activeStart = null;
            activeSign = 0;
        }
        return {
            events: events,
            mixedAxisCandidates: mixedAxisCandidates,
            incompleteCandidates: incompleteCandidates,
            overlappingCandidates: overlappingCandidates,
            invalidCommandCandidates: invalidCommandCandidates,
            excessiveOffAxisGyroCandidates: excessiveOffAxisGyroCandidates,
            invalidHeadspeedCandidates: invalidHeadspeedCandidates,
            invalidCollectiveCandidates: invalidCollectiveCandidates,
            invalidBatteryCandidates: invalidBatteryCandidates,
            capped: events.length >= MAX_STOP_EVENTS
        };
    }

    function aggregateEvents(detected, records) {
        var events = detected.events;
        function eventMedian(key) {
            return quantile(events.map(function(event) { return event[key]; }), 0.5);
        }
        function eventMaximum(key) {
            return maximum(events.map(function(event) { return event[key]; }));
        }
        function summarizeSign(commandSign) {
            var matching = events.filter(function(event) {
                return event.commandSign === commandSign;
            });
            function signedMedian(key) {
                return round(quantile(matching.map(function(event) {
                    return event[key];
                }), 0.5), 4);
            }
            return {
                stopCount: matching.length,
                trackingRmsDps: signedMedian("trackingRmsDps"),
                fastRingingRmsDps: signedMedian("fastRingingRmsDps"),
                slowOscillationRmsDps: signedMedian("slowOscillationRmsDps"),
                rawNoiseStepRmsDps: signedMedian("rawNoiseStepRmsDps")
            };
        }
        var eventHeadspeeds = events.map(function(event) { return event.headspeedRpm; });
        var headspeedRpm = quantile(eventHeadspeeds, 0.5);
        var crossEventHeadspeedVariationRatio = spanRatio(
            eventHeadspeeds,
            headspeedRpm
        );
        var allHeadspeeds = records.map(function(record) { return record.headspeed; });
        var selectionHeadspeedRpm = quantile(allHeadspeeds, 0.5);
        var allCollective = records.map(function(record) { return record.collective; });
        var allBattery = records.map(function(record) { return record.vbat; });
        return {
            stopCount: events.length,
            positiveStopCount: events.filter(function(event) {
                return event.commandSign === "positive";
            }).length,
            negativeStopCount: events.filter(function(event) {
                return event.commandSign === "negative";
            }).length,
            mixedAxisCandidateCount: detected.mixedAxisCandidates,
            incompleteCandidateCount: detected.incompleteCandidates,
            overlappingCandidateCount: detected.overlappingCandidates,
            invalidCommandCandidateCount: detected.invalidCommandCandidates,
            excessiveOffAxisGyroCandidateCount:
                detected.excessiveOffAxisGyroCandidates,
            invalidHeadspeedCandidateCount: detected.invalidHeadspeedCandidates,
            invalidCollectiveCandidateCount: detected.invalidCollectiveCandidates,
            invalidBatteryCandidateCount: detected.invalidBatteryCandidates,
            eventsCapped: detected.capped,
            commandAmplitudeDps: round(eventMedian("commandAmplitudeDps"), 4),
            commandDurationUs: round(eventMedian("commandDurationUs"), 1),
            trackingRmsDps: round(eventMedian("trackingRmsDps"), 4),
            fastRingingRmsDps: round(eventMedian("fastRingingRmsDps"), 4),
            slowOscillationRmsDps: round(eventMedian("slowOscillationRmsDps"), 4),
            rawNoiseStepRmsDps: round(eventMedian("rawNoiseStepRmsDps"), 4),
            selectedTermRms: round(eventMedian("selectedTermRms"), 4),
            offAxisGyroRmsDps: round(eventMedian("offAxisGyroRmsDps"), 4),
            offAxisGyroPeakDps: round(eventMaximum("offAxisGyroPeakDps"), 4),
            headspeedRpm: round(headspeedRpm, 2),
            headspeedMinimumRpm: round(minimum(events.map(function(event) {
                return event.headspeedMinimumRpm;
            })), 2),
            headspeedMaximumRpm: round(eventMaximum("headspeedMaximumRpm"), 2),
            headspeedVariationRatio: round(eventMaximum("headspeedVariationRatio"), 5),
            crossEventHeadspeedVariationRatio: round(
                crossEventHeadspeedVariationRatio,
                5
            ),
            selectionHeadspeedRpm: round(selectionHeadspeedRpm, 2),
            selectionHeadspeedMinimumRpm: round(minimum(allHeadspeeds), 2),
            selectionHeadspeedMaximumRpm: round(maximum(allHeadspeeds), 2),
            selectionHeadspeedVariationRatio: round(
                spanRatio(allHeadspeeds, selectionHeadspeedRpm),
                5
            ),
            collectiveMedian: round(eventMedian("collectiveMedian"), 4),
            collectiveMinimum: round(minimum(events.map(function(event) {
                return event.collectiveMinimum;
            })), 4),
            collectiveMaximum: round(eventMaximum("collectiveMaximum"), 4),
            selectionCollectiveMedian: round(quantile(allCollective, 0.5), 4),
            selectionCollectiveMinimum: round(minimum(allCollective), 4),
            selectionCollectiveMaximum: round(maximum(allCollective), 4),
            batteryMedian: round(eventMedian("batteryMedian"), 4),
            batteryMinimum: round(minimum(events.map(function(event) {
                return event.batteryMinimum;
            })), 4),
            batteryMaximum: round(eventMaximum("batteryMaximum"), 4),
            batteryVariationRatio: round(eventMaximum("batteryVariationRatio"), 5),
            selectionBatteryMedian: round(quantile(allBattery, 0.5), 4),
            selectionBatteryMinimum: round(minimum(allBattery), 4),
            selectionBatteryMaximum: round(maximum(allBattery), 4),
            selectionBatteryVariationRatio: round(
                spanRatio(allBattery, quantile(allBattery, 0.5)),
                5
            ),
            signMetrics: {
                positive: summarizeSign("positive"),
                negative: summarizeSign("negative")
            },
            stopTimesUs: events.map(function(event) { return event.stopTimeUs; })
        };
    }

    function timingQuality(records, range) {
        var intervals = [];
        var maximumIntervalUs = null;
        var nonMonotonicCount = 0;
        for (var index = 1; index < records.length; index++) {
            var interval = records[index].timeUs - records[index - 1].timeUs;
            if (interval <= 0) {
                nonMonotonicCount++;
            } else {
                intervals.push(interval);
                maximumIntervalUs = maximumIntervalUs === null
                    ? interval : Math.max(maximumIntervalUs, interval);
            }
        }
        var medianIntervalUs = quantile(intervals, 0.5);
        var spanUs = records.length > 1
            ? records[records.length - 1].timeUs - records[0].timeUs : 0;
        return {
            sampleCount: records.length,
            firstSampleTimeUs: records.length ? records[0].timeUs : null,
            lastSampleTimeUs: records.length
                ? records[records.length - 1].timeUs : null,
            measuredSampleRateHz: spanUs > 0
                ? round((records.length - 1) * 1000000 / spanUs, 3) : null,
            medianIntervalUs: round(medianIntervalUs, 3),
            p99IntervalUs: round(quantile(intervals, 0.99), 3),
            maximumIntervalUs: round(maximumIntervalUs, 3),
            selectedSpanCoverageRatio: range.durationUs > 0
                ? round(spanUs / range.durationUs, 5) : 0,
            nonMonotonicCount: nonMonotonicCount
        };
    }

    function addQualityCodes(quality, counters, codes) {
        if (quality.sampleCount === 0) {
            addCode(codes, "NO_SAMPLES_IN_SELECTION");
            return;
        }
        if (counters.inputLimitExceeded) {
            addCode(codes, "INPUT_SAMPLE_LIMIT_EXCEEDED");
        }
        if (counters.nonfiniteSamples > 0 || counters.invalidRequiredSamples > 0) {
            addCode(codes, "NONFINITE_SAMPLE_IN_SELECTION");
        }
        if (counters.invalidTimestampSamples > 0) {
            addCode(codes, "INVALID_TIMESTAMP_IN_CANDIDATE_CHUNK");
        }
        if (quality.nonMonotonicCount > 0) {
            addCode(codes, "NON_MONOTONIC_TIMESTAMP_IN_SELECTION");
        }
        if (!Number.isFinite(quality.measuredSampleRateHz)
                || quality.measuredSampleRateHz < MIN_SAMPLE_RATE_HZ) {
            addCode(codes, "SAMPLE_RATE_BELOW_900_HZ");
        }
        if (!Number.isFinite(quality.p99IntervalUs)
                || quality.p99IntervalUs > MAX_P99_INTERVAL_US) {
            addCode(codes, "TIMING_P99_TOO_HIGH");
        }
        if (!Number.isFinite(quality.maximumIntervalUs)
                || quality.maximumIntervalUs > MAX_FRAME_INTERVAL_US
                || counters.chunkGapCount > 0) {
            addCode(codes, "FRAME_GAP_IN_SELECTION");
        }
        if (quality.selectedSpanCoverageRatio < MIN_RANGE_COVERAGE_RATIO) {
            addCode(codes, "SELECTED_RANGE_COVERAGE_INSUFFICIENT");
        }
        var poweredCoverage = quality.sampleCount > 0
            ? counters.poweredSamples / quality.sampleCount : 0;
        if (poweredCoverage < MIN_POWERED_COVERAGE_RATIO) {
            addCode(codes, "POWERED_COVERAGE_INSUFFICIENT");
        }
        if (counters.invalidHeadspeedSamples > 0) {
            addCode(codes, "HEADSPEED_SAMPLE_IMPLAUSIBLE");
        }
        if (counters.invalidBatterySamples > 0) {
            addCode(codes, "BATTERY_SAMPLE_INVALID");
        }
        if (counters.invalidSafetySamples > 0) {
            addCode(codes, "SAFETY_SAMPLE_INVALID");
        }
        if (counters.unarmedSamples > 0) {
            addCode(codes, "UNARMED_SAMPLE_IN_SELECTION");
        }
        if (counters.unsafeModeSamples > 0) {
            addCode(codes, "UNSAFE_FLIGHT_MODE_IN_SELECTION");
        }
        if (counters.failsafeSamples > 0) {
            addCode(codes, "FAILSAFE_IN_SELECTION");
        }
        if (counters.rxFaultSamples > 0) {
            addCode(codes, "RX_HEALTH_FAULT_IN_SELECTION");
        }
    }

    function firmwareIdentity(sysConfig, codes) {
        var revision = hasOwn(sysConfig, "Firmware revision")
                && typeof sysConfig["Firmware revision"] === "string"
                && sysConfig["Firmware revision"].length > 0
                && sysConfig["Firmware revision"].length <= 160
            ? sysConfig["Firmware revision"] : null;
        var version = hasOwn(sysConfig, "firmwareVersion")
                && typeof sysConfig.firmwareVersion === "string"
                && sysConfig.firmwareVersion.length > 0
                && sysConfig.firmwareVersion.length <= 32
            ? sysConfig.firmwareVersion : null;
        var type = hasOwn(sysConfig, "firmwareType")
                && Number.isInteger(sysConfig.firmwareType)
            ? sysConfig.firmwareType : null;
        if (type === null || version === null || revision === null) {
            addCode(codes, "FIRMWARE_IDENTITY_MISSING");
        } else if (type !== SUPPORTED_FIRMWARE_TYPE
                || version !== SUPPORTED_FIRMWARE_VERSION
                || !SUPPORTED_FIRMWARE_REVISION.test(revision)) {
            addCode(codes, "FIRMWARE_BUILD_UNSUPPORTED");
        }
        return { type: type, version: version, revision: revision };
    }

    async function captureFlightLogRange(flightLog, options) {
        var settings = options || {};
        checkCancelled(settings);
        requireFlightLog(flightLog);
        var selection = requireAxisTerm(settings);
        var range = requireRange(flightLog, settings);
        var axisIndex = AXES.indexOf(selection.axis);
        var termIndex = TERMS.indexOf(selection.term);
        var codes = [];
        var sysConfig = flightLog.getSysConfig() || {};
        var firmware = firmwareIdentity(sysConfig, codes);
        var configuration = collectConfiguration(sysConfig, codes);
        var indexes = collectIndexes(flightLog, axisIndex);
        var availability = fieldAvailability(indexes);
        validateFieldAvailability(availability, codes);
        var counters = {
            nonfiniteSamples: 0,
            invalidTimestampSamples: 0,
            invalidRequiredSamples: 0,
            inputLimitExceeded: false,
            chunkGapCount: 0,
            poweredSamples: 0,
            invalidSafetySamples: 0,
            unarmedSamples: 0,
            unsafeModeSamples: 0,
            failsafeSamples: 0,
            rxFaultSamples: 0,
            invalidHeadspeedSamples: 0,
            invalidBatterySamples: 0,
            airborneTransitions: 0
        };
        var records = [];
        var seenFrames = Object.create(null);
        var seenInvalidFrames = Object.create(null);
        var seenEvents = Object.create(null);
        var seenGaps = Object.create(null);
        var windowCount = Math.max(1, Math.ceil(range.durationUs / LOG_WINDOW_US));
        scanPreselectionEvents(
            flightLog,
            range,
            seenEvents,
            codes,
            counters,
            settings
        );
        reportProgress(settings, "capture", 0, windowCount);

        for (var windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            checkCancelled(settings);
            var windowStartUs = range.startTimeUs + windowIndex * LOG_WINDOW_US;
            var windowEndUs = Math.min(range.endTimeUs, windowStartUs + LOG_WINDOW_US);
            var finalWindow = windowIndex === windowCount - 1;
            var chunks = flightLog.getChunksInTimeRange(windowStartUs, windowEndUs) || [];
            eventCodes(chunks, range, seenEvents, codes, counters);
            chunks.forEach(function(chunk, chunkPosition) {
                Object.keys(chunk.gapStartsHere || {}).forEach(function(frameKey) {
                    var frame = (chunk.frames || [])[Number(frameKey)];
                    var timeUs = frameValue(frame || [], indexes.time);
                    var gapKey = [
                        chunk.index === undefined ? chunkPosition : chunk.index,
                        frameKey,
                        timeUs
                    ].join(":");
                    if (timeUs !== null && timeUs > range.startTimeUs
                            && timeUs <= range.endTimeUs && !seenGaps[gapKey]) {
                        seenGaps[gapKey] = true;
                        counters.chunkGapCount++;
                    }
                });
                var chunkFrames = chunk.frames || [];
                chunkFrames.forEach(function(frame, framePosition) {
                    var timeUs = frameValue(frame, indexes.time);
                    if (timeUs === null) {
                        if (!invalidTimestampCouldOverlapRange(
                            chunkFrames,
                            framePosition,
                            indexes.time,
                            range
                        )) {
                            return;
                        }
                        var invalidKey = [
                            chunk.index === undefined ? chunkPosition : chunk.index,
                            framePosition
                        ].join(":");
                        if (!seenInvalidFrames[invalidKey]) {
                            seenInvalidFrames[invalidKey] = true;
                            counters.invalidTimestampSamples++;
                        }
                        return;
                    }
                    if (timeUs < windowStartUs
                            || (!finalWindow && timeUs >= windowEndUs)
                            || timeUs > range.endTimeUs) {
                        return;
                    }
                    var key = [chunk.index === undefined ? chunkPosition : chunk.index,
                        framePosition, timeUs].join(":");
                    if (seenFrames[key]) {
                        return;
                    }
                    seenFrames[key] = true;
                    if (records.length >= MAX_INPUT_SAMPLES) {
                        counters.inputLimitExceeded = true;
                        return;
                    }
                    var record = recordFromFrame(frame, indexes, counters);
                    if (!requiredRecordFinite(record)) {
                        counters.invalidRequiredSamples++;
                    }
                    updateSafety(record, counters);
                    records.push(record);
                    if (records.length % 1024 === 0) {
                        checkCancelled(settings);
                    }
                });
            });
            reportProgress(settings, "capture", windowIndex + 1, windowCount);
            await yieldToEventLoop();
        }

        var quality = timingQuality(records, range);
        addQualityCodes(quality, counters, codes);
        var medianIntervalUs = quality.medianIntervalUs;
        var detected = detectStops(
            records,
            axisIndex,
            termIndex,
            medianIntervalUs,
            range
        );
        var maneuver = aggregateEvents(detected, records);
        if (maneuver.stopCount < MIN_STOP_EVENTS) {
            addCode(codes, "INSUFFICIENT_ISOLATED_STOPS");
        }
        if (maneuver.mixedAxisCandidateCount > 0) {
            addCode(codes, "MIXED_AXIS_MANEUVER_IN_SELECTION");
        }
        if (maneuver.invalidCommandCandidateCount > 0) {
            addCode(codes, "COMMAND_RELEASE_NOT_SUSTAINED");
        }
        if (maneuver.excessiveOffAxisGyroCandidateCount > 0) {
            addCode(codes, "OFF_AXIS_GYRO_RESPONSE_EXCESSIVE");
        }
        if (maneuver.invalidCollectiveCandidateCount > 0) {
            addCode(codes, "COLLECTIVE_EVIDENCE_INVALID");
        }
        if (maneuver.invalidBatteryCandidateCount > 0) {
            addCode(codes, "BATTERY_EVIDENCE_INVALID");
        }
        if (maneuver.positiveStopCount === 0 || maneuver.negativeStopCount === 0) {
            addCode(codes, "BIDIRECTIONAL_STOPS_REQUIRED");
        } else if (Math.min(maneuver.positiveStopCount, maneuver.negativeStopCount)
                / Math.max(maneuver.positiveStopCount, maneuver.negativeStopCount) <= 0.5) {
            addCode(codes, "STOP_DIRECTION_IMBALANCE");
        }
        if (maneuver.eventsCapped) {
            addCode(codes, "STOP_EVENT_LIMIT_REACHED");
        }
        if (!Number.isFinite(maneuver.headspeedRpm)) {
            addCode(codes, "HEADSPEED_EVIDENCE_MISSING");
        } else if (maneuver.headspeedRpm < MIN_PLAUSIBLE_HEADSPEED_RPM
                || maneuver.headspeedRpm > MAX_PLAUSIBLE_HEADSPEED_RPM) {
            addCode(codes, "HEADSPEED_SAMPLE_IMPLAUSIBLE");
        }
        if ([maneuver.headspeedVariationRatio,
            maneuver.crossEventHeadspeedVariationRatio,
            maneuver.selectionHeadspeedVariationRatio].some(function(value) {
            return !Number.isFinite(value)
                || value > MAX_HEADSPEED_VARIATION_RATIO;
        })) {
            addCode(codes, "HEADSPEED_UNSTABLE_IN_SELECTION");
        }
        var collectiveRange = configuration.context.collectiveRange;
        if (!Array.isArray(collectiveRange) || collectiveRange.length !== 2
                || !collectiveRange.every(Number.isFinite)
                || collectiveRange[0] >= collectiveRange[1]) {
            addCode(codes, "COLLECTIVE_RANGE_CONFIGURATION_INVALID");
        } else if (!Number.isFinite(maneuver.selectionCollectiveMinimum)
                || !Number.isFinite(maneuver.selectionCollectiveMaximum)
                || maneuver.selectionCollectiveMinimum < collectiveRange[0]
                || maneuver.selectionCollectiveMaximum > collectiveRange[1]) {
            addCode(codes, "COLLECTIVE_SAMPLE_OUT_OF_RANGE");
        }
        if (Array.isArray(collectiveRange) && collectiveRange.length === 2
                && collectiveRange.every(Number.isFinite)
                && collectiveRange[1] > collectiveRange[0]) {
            // Normalize load spread by configured collective travel so a
            // near-zero collective median cannot hide a large load change.
            var collectiveSpan = collectiveRange[1] - collectiveRange[0];
            maneuver.collectiveLoadVariationRatio = round(
                (maneuver.selectionCollectiveMaximum
                    - maneuver.selectionCollectiveMinimum) / collectiveSpan,
                5
            );
            if (!Number.isFinite(maneuver.collectiveLoadVariationRatio)
                    || maneuver.collectiveLoadVariationRatio
                        > MAX_COLLECTIVE_VARIATION_RANGE_RATIO) {
                addCode(codes, "COLLECTIVE_LOAD_UNSTABLE_IN_SELECTION");
            }
        } else {
            maneuver.collectiveLoadVariationRatio = null;
        }
        if (!Number.isFinite(maneuver.batteryVariationRatio)
                || !Number.isFinite(maneuver.selectionBatteryVariationRatio)
                || maneuver.batteryVariationRatio > MAX_BATTERY_VARIATION_RATIO
                || maneuver.selectionBatteryVariationRatio
                    > MAX_BATTERY_VARIATION_RATIO) {
            addCode(codes, "BATTERY_EVIDENCE_INVALID");
        }
        if (selection.term === "I") {
            addCode(codes, "I_TERM_HOLD_EVIDENCE_UNSUPPORTED");
        }
        if (selection.axis === "yaw") {
            addCode(codes, "YAW_DIRECTIONAL_EVIDENCE_UNSUPPORTED");
        }
        var pidForAxis = configuration.pid[selection.axis];
        var gainValue = pidForAxis ? pidForAxis[termIndex] : null;
        var result = {
            schemaVersion: SCHEMA_VERSION,
            kind: CAPTURE_KIND,
            status: codes.length === 0 ? "captured" : "inconclusive",
            codes: codes,
            axis: selection.axis,
            term: selection.term,
            range: range,
            firmware: firmware,
            gainValue: Number.isFinite(gainValue) ? gainValue : null,
            configuration: configuration,
            availability: availability,
            quality: {
                sampleCount: quality.sampleCount,
                firstSampleTimeUs: quality.firstSampleTimeUs,
                lastSampleTimeUs: quality.lastSampleTimeUs,
                measuredSampleRateHz: quality.measuredSampleRateHz,
                medianIntervalUs: quality.medianIntervalUs,
                p99IntervalUs: quality.p99IntervalUs,
                maximumIntervalUs: quality.maximumIntervalUs,
                selectedSpanCoverageRatio: quality.selectedSpanCoverageRatio,
                nonMonotonicCount: quality.nonMonotonicCount,
                poweredCoverageRatio: quality.sampleCount > 0
                    ? round(counters.poweredSamples / quality.sampleCount, 5) : 0,
                nonfiniteSampleCount: counters.nonfiniteSamples,
                invalidTimestampSampleCount: counters.invalidTimestampSamples,
                invalidRequiredSampleCount: counters.invalidRequiredSamples,
                invalidHeadspeedSampleCount: counters.invalidHeadspeedSamples,
                invalidBatterySampleCount: counters.invalidBatterySamples,
                invalidSafetySampleCount: counters.invalidSafetySamples,
                chunkGapCount: counters.chunkGapCount,
                airborneTransitionCount: counters.airborneTransitions
            },
            maneuver: maneuver,
            selectedFingerprint: selectedFingerprint(records),
            integrityKey: null
        };
        result.integrityKey = captureIntegrityKey(result);
        reportProgress(settings, "evidence", 1, 1);
        return seal(result);
    }

    function captureValid(capture) {
        return capture && typeof capture === "object"
            && capture.schemaVersion === SCHEMA_VERSION
            && capture.kind === CAPTURE_KIND
            && ["captured", "inconclusive"].indexOf(capture.status) !== -1
            && AXES.indexOf(capture.axis) !== -1
            && TERMS.indexOf(capture.term) !== -1
            && capture.range && capture.firmware && capture.configuration
            && capture.quality && capture.maneuver
            && typeof capture.selectedFingerprint === "string"
            && typeof capture.integrityKey === "string"
            && capture.integrityKey === captureIntegrityKey(capture);
    }

    function sameJson(left, right) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function comparePidConfiguration(baseline, test, codes) {
        var changes = [];
        AXES.forEach(function(axis) {
            var baselineValues = baseline.configuration.pid[axis];
            var testValues = test.configuration.pid[axis];
            if (!Array.isArray(baselineValues) || !Array.isArray(testValues)
                    || baselineValues.length !== testValues.length) {
                addCode(codes, "PID_CONFIGURATION_SHAPE_MISMATCH");
                return;
            }
            baselineValues.forEach(function(value, index) {
                if (value !== testValues[index]) {
                    changes.push({ axis: axis, index: index });
                }
            });
        });
        if (changes.length === 0) {
            addCode(codes, "SELECTED_GAIN_UNCHANGED");
        } else if (changes.length > 1) {
            addCode(codes, "MULTIPLE_GAIN_CHANGES");
        } else {
            var expectedIndex = TERMS.indexOf(baseline.term);
            if (changes[0].axis !== baseline.axis || changes[0].index !== expectedIndex) {
                addCode(codes, "CHANGED_GAIN_NOT_SELECTED");
            }
        }
        if (!sameJson(baseline.configuration.context, test.configuration.context)) {
            addCode(codes, "CONFIGURATION_CONTEXT_MISMATCH");
        }
    }

    function compareCompatibility(baseline, test, codes) {
        if (baseline.firmware.type === null || baseline.firmware.version === null
                || baseline.firmware.revision === null
                || test.firmware.type === null || test.firmware.version === null
                || test.firmware.revision === null) {
            addCode(codes, "FIRMWARE_IDENTITY_MISSING");
        } else if (!sameJson(baseline.firmware, test.firmware)) {
            addCode(codes, "FIRMWARE_BUILD_MISMATCH");
        }
        if (baseline.axis !== test.axis) {
            addCode(codes, "AXIS_MISMATCH");
        }
        if (baseline.term !== test.term) {
            addCode(codes, "TERM_MISMATCH");
        }
        if (baseline.selectedFingerprint === test.selectedFingerprint) {
            addCode(codes, "IDENTICAL_SELECTED_EVIDENCE");
        }
        if (!sameJson(baseline.availability.rawGyroSources,
            test.availability.rawGyroSources)) {
            addCode(codes, "RAW_GYRO_SOURCE_MISMATCH");
        }
        if (baseline.availability.collectiveSource
                !== test.availability.collectiveSource) {
            addCode(codes, "COLLECTIVE_SOURCE_MISMATCH");
        }
        var sampleRateDifference = relativeDifference(
            baseline.quality.measuredSampleRateHz,
            test.quality.measuredSampleRateHz
        );
        if (sampleRateDifference === null
                || sampleRateDifference > SAMPLE_RATE_MATCH_RATIO) {
            addCode(codes, "SAMPLE_RATE_MISMATCH");
        }
        var durationDifference = relativeDifference(
            baseline.range.durationUs,
            test.range.durationUs
        );
        if (durationDifference === null
                || durationDifference > RANGE_DURATION_MATCH_RATIO) {
            addCode(codes, "RANGE_DURATION_MISMATCH");
        }
        var amplitudeDifference = relativeDifference(
            baseline.maneuver.commandAmplitudeDps,
            test.maneuver.commandAmplitudeDps
        );
        if (amplitudeDifference === null
                || amplitudeDifference > MANEUVER_AMPLITUDE_MATCH_RATIO) {
            addCode(codes, "MANEUVER_AMPLITUDE_MISMATCH");
        }
        var commandDurationDifference = relativeDifference(
            baseline.maneuver.commandDurationUs,
            test.maneuver.commandDurationUs
        );
        if (commandDurationDifference === null
                || commandDurationDifference > COMMAND_DURATION_MATCH_RATIO) {
            addCode(codes, "COMMAND_DURATION_MISMATCH");
        }
        if (baseline.maneuver.stopCount < MIN_STOP_EVENTS
                || test.maneuver.stopCount < MIN_STOP_EVENTS) {
            addCode(codes, "INSUFFICIENT_ISOLATED_STOPS");
        }
        if (baseline.maneuver.stopCount !== test.maneuver.stopCount) {
            addCode(codes, "STOP_COUNT_MISMATCH");
        }
        if (baseline.maneuver.positiveStopCount
                !== test.maneuver.positiveStopCount
                || baseline.maneuver.negativeStopCount
                !== test.maneuver.negativeStopCount) {
            addCode(codes, "MANEUVER_SIGN_COUNT_MISMATCH");
        }
        var headspeedDifference = relativeDifference(
            baseline.maneuver.headspeedRpm,
            test.maneuver.headspeedRpm
        );
        if (headspeedDifference === null) {
            addCode(codes, "HEADSPEED_EVIDENCE_MISSING");
        } else if (headspeedDifference > HEADSPEED_MATCH_RATIO) {
            addCode(codes, "HEADSPEED_MISMATCH");
        }
        var selectionHeadspeedDifference = relativeDifference(
            baseline.maneuver.selectionHeadspeedRpm,
            test.maneuver.selectionHeadspeedRpm
        );
        if (selectionHeadspeedDifference === null
                || selectionHeadspeedDifference > HEADSPEED_MATCH_RATIO) {
            addCode(codes, "HEADSPEED_MISMATCH");
        }
        var collectiveRange = baseline.configuration.context.collectiveRange;
        var collectiveSpan = Array.isArray(collectiveRange)
                && collectiveRange.length === 2
                && collectiveRange.every(Number.isFinite)
            ? collectiveRange[1] - collectiveRange[0] : null;
        var collectivePairs = [
            [baseline.maneuver.collectiveMedian, test.maneuver.collectiveMedian],
            [baseline.maneuver.selectionCollectiveMedian,
                test.maneuver.selectionCollectiveMedian],
            [baseline.maneuver.selectionCollectiveMinimum,
                test.maneuver.selectionCollectiveMinimum],
            [baseline.maneuver.selectionCollectiveMaximum,
                test.maneuver.selectionCollectiveMaximum]
        ];
        if (!Number.isFinite(collectiveSpan) || collectiveSpan <= 0
                || collectivePairs.some(function(pair) {
                    return !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])
                        || Math.abs(pair[0] - pair[1]) / collectiveSpan
                            > COLLECTIVE_MATCH_RANGE_RATIO;
                })) {
            addCode(codes, "COLLECTIVE_LOAD_MISMATCH");
        }
        var batteryPairs = [
            [baseline.maneuver.batteryMedian, test.maneuver.batteryMedian],
            [baseline.maneuver.batteryMinimum, test.maneuver.batteryMinimum],
            [baseline.maneuver.batteryMaximum, test.maneuver.batteryMaximum],
            [baseline.maneuver.selectionBatteryMedian,
                test.maneuver.selectionBatteryMedian],
            [baseline.maneuver.selectionBatteryMinimum,
                test.maneuver.selectionBatteryMinimum],
            [baseline.maneuver.selectionBatteryMaximum,
                test.maneuver.selectionBatteryMaximum]
        ];
        var batteryVariationPairs = [
            [baseline.maneuver.batteryVariationRatio,
                test.maneuver.batteryVariationRatio],
            [baseline.maneuver.selectionBatteryVariationRatio,
                test.maneuver.selectionBatteryVariationRatio]
        ];
        if (batteryPairs.some(function(pair) {
            var difference = relativeDifference(pair[0], pair[1]);
            return difference === null || difference > BATTERY_MATCH_RATIO;
        }) || batteryVariationPairs.some(function(pair) {
            return !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])
                || Math.abs(pair[0] - pair[1])
                    > BATTERY_VARIATION_MATCH_RATIO;
        })) {
            addCode(codes, "BATTERY_LOAD_MISMATCH");
        }
        if (!Number.isFinite(baseline.maneuver.selectedTermRms)
                || !Number.isFinite(test.maneuver.selectedTermRms)
                || baseline.maneuver.selectedTermRms
                    === test.maneuver.selectedTermRms) {
            addCode(codes, "SELECTED_TERM_EVIDENCE_UNCHANGED");
        }
        var offAxisGyroDifference = relativeDifference(
            baseline.maneuver.offAxisGyroRmsDps,
            test.maneuver.offAxisGyroRmsDps
        );
        if (Number.isFinite(test.maneuver.offAxisGyroRmsDps)
                && Number.isFinite(baseline.maneuver.offAxisGyroRmsDps)
                && test.maneuver.offAxisGyroRmsDps
                    > baseline.maneuver.offAxisGyroRmsDps
                        + OFF_AXIS_GYRO_ABSOLUTE_TOLERANCE_DPS
                && offAxisGyroDifference > OFF_AXIS_GYRO_MATCH_RATIO) {
            addCode(codes, "OFF_AXIS_GYRO_RESPONSE_EXCESSIVE");
        }
        compareDirectionalResponses(baseline, test, codes);
    }

    function compareDirectionalResponses(baseline, test, codes) {
        var metricNames = [
            "trackingRmsDps",
            "fastRingingRmsDps",
            "slowOscillationRmsDps",
            "rawNoiseStepRmsDps"
        ];
        var baselineSigns = baseline.maneuver.signMetrics;
        var testSigns = test.maneuver.signMetrics;
        if (!baselineSigns || !testSigns
                || !baselineSigns.positive || !baselineSigns.negative
                || !testSigns.positive || !testSigns.negative
                || [baselineSigns.positive, baselineSigns.negative,
                    testSigns.positive, testSigns.negative].some(function(sign) {
                    return !Number.isInteger(sign.stopCount) || sign.stopCount < 2
                        || metricNames.some(function(metric) {
                            return !Number.isFinite(sign[metric]);
                        });
                })) {
            addCode(codes, "MANEUVER_SIGN_MISMATCH");
            return;
        }
        if (metricNames.some(function(metric) {
            var positiveState = metricComparison(
                metric,
                baselineSigns.positive[metric],
                testSigns.positive[metric]
            ).state;
            var negativeState = metricComparison(
                metric,
                baselineSigns.negative[metric],
                testSigns.negative[metric]
            ).state;
            return (positiveState === "improved" && negativeState === "worse")
                || (positiveState === "worse" && negativeState === "improved");
        })) {
            addCode(codes, "MANEUVER_SIGN_MISMATCH");
        }
    }

    function metricComparison(name, baselineValue, testValue) {
        var state = "stable";
        var ratio = null;
        if (!Number.isFinite(baselineValue) || !Number.isFinite(testValue)) {
            state = "unavailable";
        } else if (Math.abs(baselineValue) < 1e-9) {
            state = Math.abs(testValue) < 1e-9 ? "stable" : "worse";
        } else {
            ratio = testValue / baselineValue;
            if (ratio < 1 - COMPARISON_TOLERANCE_RATIO) {
                state = "improved";
            } else if (ratio > 1 + COMPARISON_TOLERANCE_RATIO) {
                state = "worse";
            }
        }
        return {
            metric: name,
            baselineValue: baselineValue,
            testValue: testValue,
            testToBaselineRatio: round(ratio, 5),
            state: state
        };
    }

    function inconclusiveComparison(codes, baseline, test) {
        return seal({
            schemaVersion: SCHEMA_VERSION,
            kind: COMPARISON_KIND,
            status: "inconclusive",
            codes: codes,
            axis: captureValid(baseline) ? baseline.axis : null,
            term: captureValid(baseline) ? baseline.term : null,
            gainValues: captureValid(baseline) && captureValid(test)
                ? { baseline: baseline.gainValue, test: test.gainValue } : null,
            evidence: []
        });
    }

    var nodeTestMixerEvidenceCapability = {};

    function compareCapturesInternal(baseline, test, capability) {
        var codes = [];
        if (!captureValid(baseline) || !captureValid(test)) {
            addCode(codes, "CAPTURE_SCHEMA_INVALID");
            return inconclusiveComparison(codes, baseline, test);
        }
        if (baseline.status !== "captured") {
            addCode(codes, "BASELINE_CAPTURE_INCONCLUSIVE");
        }
        if (test.status !== "captured") {
            addCode(codes, "TEST_CAPTURE_INCONCLUSIVE");
        }
        if (capability !== nodeTestMixerEvidenceCapability) {
            // RF4.6 BBLs do not log mixer saturation state or the complete
            // mixer/servo limits needed to derive it. Never classify a real
            // pair from component sums or guessed limits.
            addCode(codes, "MIXER_SATURATION_EVIDENCE_UNAVAILABLE");
        }
        compareCompatibility(baseline, test, codes);
        comparePidConfiguration(baseline, test, codes);
        if (codes.length > 0) {
            return inconclusiveComparison(codes, baseline, test);
        }
        var evidence = [
            metricComparison("trackingRmsDps", baseline.maneuver.trackingRmsDps,
                test.maneuver.trackingRmsDps),
            metricComparison("fastRingingRmsDps", baseline.maneuver.fastRingingRmsDps,
                test.maneuver.fastRingingRmsDps),
            metricComparison("slowOscillationRmsDps",
                baseline.maneuver.slowOscillationRmsDps,
                test.maneuver.slowOscillationRmsDps),
            metricComparison("rawNoiseStepRmsDps",
                baseline.maneuver.rawNoiseStepRmsDps,
                test.maneuver.rawNoiseStepRmsDps)
        ];
        if (evidence.some(function(item) { return item.state === "unavailable"; })) {
            addCode(codes, "COMPARISON_METRIC_MISSING");
            return inconclusiveComparison(codes, baseline, test);
        }
        var improved = evidence.some(function(item) { return item.state === "improved"; });
        var worse = evidence.some(function(item) { return item.state === "worse"; });
        var status = improved && worse ? "mixed"
            : (improved ? "improved" : (worse ? "worse" : "comparable"));
        return seal({
            schemaVersion: SCHEMA_VERSION,
            kind: COMPARISON_KIND,
            status: status,
            codes: [],
            axis: baseline.axis,
            term: baseline.term,
            gainValues: {
                baseline: baseline.gainValue,
                test: test.gainValue
            },
            evidence: evidence
        });
    }

    function compareCaptures(baseline, test) {
        return compareCapturesInternal(baseline, test, null);
    }

    var api = {
        captureFlightLogRange: captureFlightLogRange,
        compareCaptures: compareCaptures,
        constants: Object.freeze({
            schemaVersion: SCHEMA_VERSION,
            captureKind: CAPTURE_KIND,
            comparisonKind: COMPARISON_KIND,
            maximumSelectionDurationUs: MAX_SELECTION_DURATION_US,
            maximumInputSamples: MAX_INPUT_SAMPLES,
            maximumStopEvents: MAX_STOP_EVENTS,
            minimumStopEvents: MIN_STOP_EVENTS,
            minimumSampleRateHz: MIN_SAMPLE_RATE_HZ
        })
    };
    if (enableNodeTestSeam) {
        // This capability exists only in the CommonJS unit-test build. It is
        // absent from the browser API and cannot be enabled by capture data.
        api._testOnlyCompareCapturesWithMixerEvidence = function(baseline, test) {
            return compareCapturesInternal(
                baseline,
                test,
                nodeTestMixerEvidenceCapability
            );
        };
    }
    return Object.freeze(api);
}));
