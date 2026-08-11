"use strict";

(function(root, factory) {
    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RotorLensAIContract = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function() {
    var SCHEMA_VERSION = 1;
    var ADVISOR_SCHEMA_VERSION = 3;
    var MAX_REQUEST_BYTES = 32768;
    var MAX_RESPONSE_BYTES = 8192;
    var MAX_FACTS = 64;
    var MAX_FINDINGS = 40;
    var MAX_ADVISOR_REASONS = 96;
    var MAX_MECHANICAL_REASONS = 16;
    var MAX_MECHANICAL_PEAKS = 15;
    var MAX_RESPONSE_CARDS = 12;
    var MAX_CARD_REFERENCES = 8;
    var MAX_NEXT_STEPS = 7;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var SAFE_BINDING = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
    var SAFE_CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
    var SAFE_REFERENCE = /^[a-z][a-z0-9.-]{1,95}$/;

    function AIContractError(code, message) {
        this.name = "AIContractError";
        this.code = code;
        this.message = message;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AIContractError);
        }
    }
    AIContractError.prototype = Object.create(Error.prototype);
    AIContractError.prototype.constructor = AIContractError;

    function fail(code, message) {
        throw new AIContractError(code, message);
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

    function hasOwn(value, key) {
        return Object.prototype.hasOwnProperty.call(value, key);
    }

    function makeRegistry(entries) {
        var registry = Object.create(null);
        Object.keys(entries).forEach(function(key) {
            var entry = entries[key];
            if (plainObject(entry)) {
                var definition = Object.create(null);
                Object.keys(entry).forEach(function(field) {
                    definition[field] = entry[field];
                });
                registry[key] = definition;
            } else {
                registry[key] = entry;
            }
        });
        return deepFreeze(registry);
    }

    function plainObject(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return false;
        }
        var prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    function requireObject(value, code, label) {
        if (!plainObject(value)) {
            fail(code, label + " must be a plain object");
        }
        return value;
    }

    function exactKeys(value, keys, code, label) {
        requireObject(value, code, label);
        var expected = Object.create(null);
        keys.forEach(function(key) { expected[key] = true; });
        var actual = Object.keys(value);
        if (actual.length !== keys.length || actual.some(function(key) {
            return !expected[key];
        })) {
            fail(code, label + " has missing or unsupported fields");
        }
    }

    function finiteNumber(value, minimum, maximum, code, label) {
        if (typeof value !== "number" || !Number.isFinite(value)
                || value < minimum || value > maximum) {
            fail(code, label + " is outside its allowed numeric range");
        }
        return value;
    }

    function finiteInteger(value, minimum, maximum, code, label) {
        finiteNumber(value, minimum, maximum, code, label);
        if (!Number.isInteger(value)) {
            fail(code, label + " must be an integer");
        }
        return value;
    }

    function enumValue(value, allowed, code, label) {
        if (typeof value !== "string" || allowed.indexOf(value) === -1) {
            fail(code, label + " is not an allowed value");
        }
        return value;
    }

    function safeBinding(value, code, label) {
        if (typeof value !== "string" || !SAFE_BINDING.test(value)) {
            fail(code, label + " must be a bounded ASCII identifier");
        }
        return value;
    }

    function byteLength(value) {
        var count = 0;
        for (var index = 0; index < value.length; index++) {
            var code = value.charCodeAt(index);
            if (code <= 0x7f) {
                count += 1;
            } else if (code <= 0x7ff) {
                count += 2;
            } else if (code >= 0xd800 && code <= 0xdbff) {
                if (index + 1 >= value.length) {
                    count += 3;
                    continue;
                }
                var next = value.charCodeAt(index + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    count += 4;
                    index++;
                } else {
                    count += 3;
                }
            } else {
                count += 3;
            }
        }
        return count;
    }

    function serializedSize(value, code, label) {
        var serialized;
        try {
            serialized = JSON.stringify(value);
        } catch (error) {
            fail(code, label + " could not be serialized");
        }
        if (typeof serialized !== "string") {
            fail(code, label + " could not be serialized");
        }
        return byteLength(serialized);
    }

    function fact(label, unit, scope, type, minimum, maximum, integer) {
        return {
            label: label,
            unit: unit,
            scope: scope,
            type: type,
            minimum: minimum,
            maximum: maximum,
            integer: integer === true
        };
    }

    var FACT_REGISTRY = makeRegistry({
        "quality.duration": fact("Selected range duration", "seconds", "selected-range", "number", 0, 86400),
        "quality.sample-rate": fact("Measured logging rate", "hertz", "selected-range", "number", 0, 100000),
        "quality.effective-sample-rate": fact("Effective logging rate", "hertz", "selected-range", "number", 0, 100000),
        "quality.p99-frame-interval": fact("Frame interval p99", "microseconds", "selected-range", "number", 0, 1000000000),
        "quality.powered-duration": fact("Powered-flight duration", "seconds", "selected-range", "number", 0, 86400),
        "quality.corrupt-frames": fact("Corrupt frames", "frames", "selected-range", "number", 0, 1000000000, true),
        "quality.discontinuities": fact("Detected discontinuities", "events", "selected-range", "number", 0, 1000000000, true),
        "safety.rx-health": fact("Powered samples with receiver or failsafe evidence", "samples", "selected-range", "number", 0, 1000000000, true),
        "tracking.roll.rmse": fact("Roll tracking error RMS", "degrees-per-second", "selected-range", "number", 0, 100000),
        "tracking.roll.p95": fact("Roll tracking error p95", "degrees-per-second", "selected-range", "number", 0, 100000),
        "tracking.pitch.rmse": fact("Pitch tracking error RMS", "degrees-per-second", "selected-range", "number", 0, 100000),
        "tracking.pitch.p95": fact("Pitch tracking error p95", "degrees-per-second", "selected-range", "number", 0, 100000),
        "tracking.yaw.rmse": fact("Yaw tracking error RMS", "degrees-per-second", "selected-range", "number", 0, 100000),
        "tracking.yaw.p95": fact("Yaw tracking error p95", "degrees-per-second", "selected-range", "number", 0, 100000),
        "battery.minimum-voltage": fact("Minimum powered battery voltage", "volts", "selected-range", "number", 0, 1000),
        "battery.minimum-cell-voltage": fact("Minimum powered voltage per cell", "volts-per-cell", "selected-range", "number", 0, 100),
        "governor.target-rpm": fact("Median active target headspeed", "rpm", "selected-range", "number", 0, 1000000),
        "governor.rmse": fact("Active headspeed tracking RMSE", "rpm", "selected-range", "number", 0, 1000000),
        "governor.maximum-droop": fact("Maximum active headspeed droop", "rpm", "selected-range", "number", 0, 1000000),
        "governor.maximum-overshoot": fact("Maximum active headspeed overshoot", "rpm", "selected-range", "number", 0, 1000000),
        "governor.motor-p95": fact("Governor-active motor output p95", "percent", "selected-range", "number", 0, 100),
        "governor.active-event-in-selection": fact("Governor ACTIVE event inside selection", "boolean", "selected-range", "boolean"),
        "governor.full-rate-records": fact("Governor records retained at full rate", "boolean", "selected-range", "boolean"),
        "governor.pitch-pump-consistency.candidates": fact("Pitch-pump candidates", "count", "selected-range", "number", 0, 1000, true),
        "governor.pitch-pump-consistency.eligible": fact("Eligible pitch pumps", "count", "selected-range", "number", 0, 1000, true),
        "governor.pitch-pump-consistency.droop": fact("Pitch pumps classified as droop", "count", "selected-range", "number", 0, 1000, true),
        "governor.pitch-pump-consistency.overshoot": fact("Pitch pumps classified as overshoot", "count", "selected-range", "number", 0, 1000, true),
        "governor.pitch-pump-consistency.sufficient": fact("Pitch-pump consistency gate", "boolean", "selected-range", "boolean")
    });

    function message(section, severity, text, evidencePrefixes, reasonKind) {
        return {
            section: section,
            severity: severity,
            text: text,
            evidencePrefixes: evidencePrefixes || [],
            reasonKind: reasonKind || "any"
        };
    }

    var MESSAGE_REGISTRY = makeRegistry({
        SCOPE_SELECTED_RANGE: message(
            "scope",
            "info",
            "This explanation covers only the graph's selected In-to-Out range."
        ),
        EVIDENCE_SUPPORTED: message(
            "overview",
            "info",
            "The deterministic evidence package is supported for this exact selected range."
        ),
        EVIDENCE_LIMITED: message(
            "overview",
            "caution",
            "Deterministic evidence is limited for this selected range; unavailable facts were not inferred."
        ),
        EVIDENCE_BLOCKED: message(
            "overview",
            "stop",
            "Deterministic safety or quality checks blocked tuning guidance for this selected range."
        ),
        QUALITY_PASS: message(
            "quality",
            "info",
            "The selected-range quality gate passed.",
            ["quality.", "safety."]
        ),
        QUALITY_CAUTION: message(
            "quality",
            "caution",
            "The selected-range quality gate found limitations that should be reviewed.",
            ["quality.", "safety."]
        ),
        QUALITY_BLOCKED: message(
            "quality",
            "stop",
            "The selected-range quality gate blocked tuning guidance.",
            ["quality.", "safety."]
        ),
        TRACKING_AVAILABLE: message(
            "tracking",
            "info",
            "Control-tracking measurements are available for the selected range.",
            ["tracking."]
        ),
        TRACKING_LIMITED: message(
            "tracking",
            "caution",
            "Control-tracking evidence is incomplete for the selected range.",
            ["tracking."]
        ),
        TRACKING_UNSUPPORTED: message(
            "tracking",
            "caution",
            "Control-tracking evidence was unavailable and was not inferred.",
            ["tracking."]
        ),
        BATTERY_AVAILABLE: message(
            "battery",
            "info",
            "Battery evidence was available for the selected range.",
            ["battery."]
        ),
        BATTERY_LIMITED: message(
            "battery",
            "caution",
            "Battery safety evidence was incomplete for the selected range.",
            ["battery."]
        ),
        BATTERY_WARNING: message(
            "battery",
            "stop",
            "The deterministic battery gate reported a warning in the selected range.",
            ["battery."]
        ),
        BATTERY_UNSUPPORTED: message(
            "battery",
            "caution",
            "Battery evidence was unavailable and was not inferred.",
            ["battery."]
        ),
        GOVERNOR_AVAILABLE: message(
            "governor",
            "info",
            "Governor response measurements are available for the selected range.",
            ["governor."]
        ),
        GOVERNOR_LIMITED: message(
            "governor",
            "caution",
            "Governor response was measured, but deterministic prerequisites withheld directional guidance.",
            ["governor."],
            "advisor"
        ),
        GOVERNOR_UNSUPPORTED: message(
            "governor",
            "caution",
            "Governor response evidence was unavailable and was not inferred.",
            ["governor."],
            "advisor"
        ),
        MECHANICAL_CLEAR: message(
            "mechanical",
            "info",
            "No qualified dominant vibration peak was flagged in this selected range; this is not a mechanical-health certification.",
            ["mechanical."],
            "mechanical"
        ),
        MECHANICAL_CLEAR_BELOW_ATTENTION: message(
            "mechanical",
            "info",
            "Persistent frequency evidence remained below the experimental attention gate; this is a comparison clue, not a health certification.",
            ["mechanical."],
            "mechanical"
        ),
        MECHANICAL_ATTENTION_MAIN: message(
            "mechanical",
            "caution",
            "A persistent peak correlated with a logged main-rotor harmonic; this is a correlation clue, not a component diagnosis.",
            ["mechanical."],
            "mechanical"
        ),
        MECHANICAL_ATTENTION_TAIL: message(
            "mechanical",
            "caution",
            "A persistent peak correlated with a logged tail-rotor harmonic; this is a correlation clue, not a component diagnosis.",
            ["mechanical."],
            "mechanical"
        ),
        MECHANICAL_ATTENTION_UNMATCHED: message(
            "mechanical",
            "caution",
            "Persistent narrow-band energy crossed the experimental attention gate without a trustworthy rotor-harmonic match; this is not a diagnosis.",
            ["mechanical."],
            "mechanical"
        ),
        MECHANICAL_INSUFFICIENT: message(
            "mechanical",
            "caution",
            "The selected range did not provide enough mechanical evidence for a conclusion.",
            ["mechanical."],
            "mechanical"
        ),
        MECHANICAL_UNAVAILABLE: message(
            "mechanical",
            "caution",
            "Mechanical evidence was unavailable and no mechanical conclusion was inferred.",
            ["mechanical."],
            "mechanical"
        ),
        PROPOSAL_READY: message(
            "proposal",
            "caution",
            "The deterministic safety contract produced one next-test proposal; the AI did not calculate its value.",
            ["governor."]
        ),
        PROPOSAL_WITHHELD: message(
            "proposal",
            "info",
            "The deterministic recommendation gate withheld a next-test proposal.",
            ["governor."],
            "advisor"
        )
    });

    var NEXT_STEP_REGISTRY = makeRegistry({
        VIEW_CITED_EVIDENCE: {
            text: "Review the cited deterministic evidence in the selected range."
        },
        SELECT_CLEANER_RANGE: {
            text: "Choose a clean, continuous selected range and run the deterministic analysis again."
        },
        CAPTURE_TARGETED_GOVERNOR_LOG: {
            text: "Capture the targeted governor maneuver requested by Tune Advisor."
        },
        REVIEW_WITHHELD_PREREQUISITES: {
            text: "Review the deterministic prerequisite codes before another controlled test."
        },
        INSPECT_MECHANICS_FIRST: {
            text: "Inspect the mechanics first, then repeat the same operating condition in a new selected range."
        },
        KEEP_COMPARISON_BASELINE: {
            text: "Keep this selected range as a comparison baseline; it is not a health certification."
        },
        REVIEW_VALIDATED_NEXT_TEST: {
            text: "Manually review the deterministic next-test proposal and rollback plan; no setting was written."
        }
    });

    var LIMITATION_CODES = Object.freeze([
        "SELECTED_RANGE_ONLY",
        "EXPLANATION_ONLY",
        "NOT_DIAGNOSIS",
        "NO_SETTING_WRITE",
        "NO_FLIGHTWORTHINESS_CLAIM"
    ]);

    var KNOWN_FINDING_IDS = Object.freeze([
        "unsupported-firmware",
        "log-too-short",
        "log-integrity-blocker",
        "log-integrity-caution",
        "missing-end-marker",
        "invalid-values",
        "logging-header-warning",
        "rx-safety-blocker",
        "rx-safety-unknown",
        "tracking-coverage-limited",
        "battery-warning-blocker",
        "battery-safety-unknown",
        "governor-targeted-log-needed",
        "governor-prerequisites-required",
        "governor-f-next-controlled-test",
        "mechanical-analysis-insufficient",
        "mechanical-unfiltered-gyro-required-for-clear-gate",
        "mechanical-no-persistent-narrowband-peak",
        "mechanical-persistent-peak-below-attention-threshold",
        "mechanical-persistent-main-rotor-harmonic",
        "mechanical-persistent-tail-rotor-harmonic",
        "mechanical-persistent-unmatched-narrowband-peak"
    ]);

    var FINDING_SEVERITY_REGISTRY = makeRegistry({
        "unsupported-firmware": "stop",
        "log-too-short": "stop",
        "log-integrity-blocker": "stop",
        "log-integrity-caution": "caution",
        "missing-end-marker": "caution",
        "invalid-values": "caution",
        "logging-header-warning": "caution",
        "rx-safety-blocker": "stop",
        "rx-safety-unknown": "caution",
        "tracking-coverage-limited": "caution",
        "battery-warning-blocker": "stop",
        "battery-safety-unknown": "caution",
        "governor-targeted-log-needed": "info",
        "governor-prerequisites-required": "info",
        "governor-f-next-controlled-test": "caution",
        "mechanical-analysis-insufficient": "caution",
        "mechanical-unfiltered-gyro-required-for-clear-gate": "caution",
        "mechanical-no-persistent-narrowband-peak": "info",
        "mechanical-persistent-peak-below-attention-threshold": "info",
        "mechanical-persistent-main-rotor-harmonic": "caution",
        "mechanical-persistent-tail-rotor-harmonic": "caution",
        "mechanical-persistent-unmatched-narrowband-peak": "caution"
    });

    var KNOWN_ADVISOR_REASON_CODES = Object.freeze([
        "ACTIVE_EVENT_MISSING_IN_SELECTION",
        "ARM_EVIDENCE_INCOMPLETE",
        "BATTERY_CONFIGURATION_HEADER_MISSING",
        "BATTERY_CONFIGURATION_INVALID",
        "BATTERY_FIELD_MISSING",
        "BATTERY_SAFETY_BLOCKER",
        "BATTERY_SAFETY_UNKNOWN",
        "BATTERY_SAMPLES_INCOMPLETE",
        "COLLECTIVE_FIELD_MISSING",
        "COLLECTIVE_RANGE_HEADER_MISSING",
        "CONFIRMATION_CONTEXT_MISMATCH",
        "CONFIRMATION_CONTEXT_REQUIRED",
        "CONFIRMATION_CORRECT_PROFILE_REQUIRED",
        "CONFIRMATION_MECHANICAL_INSPECTION_REQUIRED",
        "CONFIRMATION_OFFICIAL_TEST_SETUP_REQUIRED",
        "CONFIRMATION_POWER_SYSTEM_HEALTHY_REQUIRED",
        "CONFIRMATION_RPM_AND_GEARING_REQUIRED",
        "CONFIRMATION_SAFE_PITCH_PUMPS_REQUIRED",
        "CONFIRMATION_SESSION_REQUIRED",
        "CONSERVATIVE_F_TEST_PID_BASELINE_REQUIRED",
        "CONSISTENT_DROOP",
        "CONSISTENT_OVERSHOOT",
        "CROSS_PUMP_HEADSPEED_INCONSISTENT",
        "DISARM_IN_SELECTION",
        "EFFECTIVE_SAMPLE_RATE_BELOW_900_HZ",
        "FAILSAFE_FIELD_MISSING",
        "FAILSAFE_SAMPLES_INCOMPLETE",
        "FLIGHT_MODE_FIELD_MISSING",
        "FLIGHT_MODE_SAMPLES_INCOMPLETE",
        "GOVERNOR_ACTIVE_DATA_INSUFFICIENT",
        "GOVERNOR_EVENTS_TRUNCATED",
        "GOVERNOR_F_FULL_STEP_OUT_OF_RANGE",
        "GOVERNOR_MAX_THROTTLE_INVALID",
        "GOVERNOR_MAX_THROTTLE_REQUIRED",
        "GOVERNOR_NUMERIC_VALUES_IMPLAUSIBLE",
        "GOVERNOR_RECORDS_NOT_FULL_RATE",
        "GOVERNOR_REQUEST_EVIDENCE_INCOMPLETE",
        "GOVERNOR_REQUEST_UNSTABLE",
        "GOVERNOR_SETTINGS_MISSING_OR_INVALID",
        "GOVERNOR_STATE_SEQUENCE_UNSAFE",
        "GOVERNOR_TARGET_UNSTABLE",
        "GOVERNOR_TTA_MISSING_OR_INVALID",
        "GOVERNOR_TTA_MUST_BE_ZERO",
        "GOVERNOR_VALUES_INVALID_IN_SELECTION",
        "INCONSISTENT_PITCH_PUMPS",
        "INFLIGHT_ADJUSTMENT_IN_SELECTION",
        "INSUFFICIENT_PITCH_PUMPS",
        "LOGGING_HEADER_INCOMPLETE",
        "LOGGING_RESUME_IN_SELECTION",
        "MAIN_MOTOR_FIELD_MISSING",
        "MAX_FRAME_INTERVAL_TOO_HIGH",
        "MECHANICAL_ANALYSIS_INSUFFICIENT",
        "MECHANICAL_ANALYSIS_REQUIRED",
        "MECHANICAL_ANALYSIS_UNAVAILABLE",
        "MECHANICAL_ATTENTION_IN_SELECTION",
        "MOTOR_HEADROOM_INSUFFICIENT",
        "NON_MONOTONIC_TIMESTAMP_IN_SELECTION",
        "OFFICIAL_F_TEST_PID_BASELINE_REQUIRED",
        "OVERLAPPING_PUMP_WINDOWS",
        "POWERED_DURATION_TOO_SHORT",
        "PUMP_WINDOW_EVALUATION_LIMIT_REACHED",
        "REQUIRED_GOVERNOR_FIELDS_MISSING",
        "RESCUE_EVENT_IN_SELECTION",
        "RX_CHANNEL_SAMPLES_INCOMPLETE",
        "RX_FIELDS_MISSING",
        "RX_SAFETY_BLOCKER",
        "RX_SAFETY_UNKNOWN",
        "RX_SIGNAL_SAMPLES_INCOMPLETE",
        "SAMPLE_RATE_BELOW_900_HZ",
        "SAMPLE_RATE_UNAVAILABLE",
        "SELECTED_RANGE_NOT_CLEAN",
        "TAIL_EVIDENCE_INCOMPLETE",
        "TAIL_FIELDS_MISSING",
        "TAIL_RESPONSE_DEGRADED",
        "TAIL_TEST_NOT_CONTROLLED",
        "TIMING_COVERAGE_INCOMPLETE",
        "TIMING_JITTER_TOO_HIGH",
        "TIMING_P99_TOO_HIGH",
        "TRUNCATED_PUMP_WINDOW_IN_SELECTION",
        "UNARMED_PUMP_WINDOW",
        "UNSAFE_FLIGHT_MODE_IN_SELECTION",
        "UNSUPPORTED_FIRMWARE",
        "UNVERIFIED_FIRMWARE_BUILD"
    ]);

    var KNOWN_MECHANICAL_REASON_CODES = Object.freeze([
        "ANALYSIS_CANCELLED",
        "ANALYSIS_RANGE_INVALID",
        "ANALYSIS_RANGE_REQUIRED",
        "FIELD_MISSING",
        "FILTERED_GYRO_SOURCE_USED",
        "FINITE_GYRO_SAMPLE_COVERAGE_INSUFFICIENT",
        "FINITE_GYRO_TIME_SPAN_COVERAGE_INSUFFICIENT",
        "GYRO_COVERAGE_INSUFFICIENT",
        "GYRO_FIELDS_MISSING",
        "INSUFFICIENT_CONTIGUOUS_GYRO_DATA",
        "INSUFFICIENT_COVERAGE",
        "INSUFFICIENT_TIMESTAMPED_SAMPLES",
        "MAIN_ROTOR_HARMONIC_CORRELATION",
        "MECHANICAL_ANALYSIS_UNAVAILABLE",
        "NON_MONOTONIC_TIMESTAMPS",
        "PERSISTENT_NARROWBAND_ENERGY",
        "PERSISTENT_NARROWBAND_ENERGY_BELOW_ATTENTION_THRESHOLD",
        "RESAMPLED_SAMPLE_LIMIT_EXCEEDED",
        "RPM_OUT_OF_RANGE",
        "RPM_UNSTABLE_IN_SELECTION",
        "SAMPLE_RATE_LIMIT_EXCEEDED",
        "SAMPLE_RATE_UNAVAILABLE",
        "SELECTED_TIMESTAMP_SPAN_COVERAGE_INSUFFICIENT",
        "SELECTION_DURATION_LIMIT_EXCEEDED",
        "SELECTION_SAMPLE_LIMIT_EXCEEDED",
        "TAIL_ROTOR_HARMONIC_CORRELATION",
        "TIMING_GAPS_EXCESSIVE",
        "UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE",
        "VALID_WINDOW_COVERAGE_INSUFFICIENT"
    ]);

    function lookup(values) {
        var result = Object.create(null);
        values.forEach(function(value) { result[value] = true; });
        return result;
    }

    var KNOWN_FINDINGS = lookup(KNOWN_FINDING_IDS);
    var KNOWN_ADVISOR_REASONS = lookup(KNOWN_ADVISOR_REASON_CODES);
    var KNOWN_MECHANICAL_REASONS = lookup(KNOWN_MECHANICAL_REASON_CODES);
    var PROPOSAL_CONTRADICTORY_FINDINGS = lookup([
        "unsupported-firmware",
        "log-too-short",
        "log-integrity-blocker",
        "rx-safety-blocker",
        "battery-warning-blocker",
        "governor-targeted-log-needed",
        "governor-prerequisites-required",
        "mechanical-analysis-insufficient",
        "mechanical-unfiltered-gyro-required-for-clear-gate",
        "mechanical-persistent-main-rotor-harmonic",
        "mechanical-persistent-tail-rotor-harmonic",
        "mechanical-persistent-unmatched-narrowband-peak"
    ]);
    var APPROVED_PROPOSAL_EVIDENCE_IDS = lookup([
        "governor.target-rpm",
        "governor.rmse",
        "governor.maximum-droop",
        "governor.maximum-overshoot",
        "governor.motor-p95",
        "governor.active-event-in-selection",
        "governor.full-rate-records",
        "governor.pitch-pump-consistency"
    ]);

    function approvedProposalEvidenceId(id) {
        return hasOwn(APPROVED_PROPOSAL_EVIDENCE_IDS, id)
            || /^governor\.pitch-pump\.[1-9][0-9]?$/.test(id)
            || /^governor\.setting\.(p|i|d|f|master|tta|max-throttle)$/.test(id);
    }

    function normalizeProposalEvidenceIds(values, label) {
        if (!Array.isArray(values) || values.length === 0 || values.length > 96) {
            fail("AI_RECOMMENDATION_INVALID", label + " must be a bounded non-empty array");
        }
        var seen = Object.create(null);
        return values.map(function(id) {
            if (typeof id !== "string" || !SAFE_REFERENCE.test(id) || hasOwn(seen, id)) {
                fail("AI_RECOMMENDATION_INVALID", label + " contains an invalid or duplicate id");
            }
            seen[id] = true;
            return id;
        }).sort();
    }

    function uniqueKnownCodes(values, known, maximum, code, label) {
        if (!Array.isArray(values) || values.length > maximum) {
            fail(code, label + " must be a bounded array");
        }
        var seen = Object.create(null);
        return values.map(function(value) {
            if (typeof value !== "string" || !SAFE_CODE.test(value)
                    || !hasOwn(known, value) || hasOwn(seen, value)) {
                fail(code, label + " contains an unknown or duplicate code");
            }
            seen[value] = true;
            return value;
        }).sort();
    }

    function selectionRange(options, advisorPackage) {
        var selected = requireObject(
            options.selectedRange,
            "AI_RANGE_REQUIRED",
            "Selected range"
        );
        var startTimeUs = finiteInteger(
            selected.startTimeUs,
            0,
            MAX_SAFE_INTEGER,
            "AI_RANGE_INVALID",
            "Selected range start"
        );
        var endTimeUs = finiteInteger(
            selected.endTimeUs,
            1,
            MAX_SAFE_INTEGER,
            "AI_RANGE_INVALID",
            "Selected range end"
        );
        if (startTimeUs >= endTimeUs) {
            fail("AI_RANGE_INVALID", "Selected range must have a positive duration");
        }

        var range = requireObject(
            advisorPackage.range,
            "AI_PACKAGE_RANGE_INVALID",
            "Advisor package range"
        );
        if (range.startTimeUs !== startTimeUs || range.endTimeUs !== endTimeUs) {
            fail("AI_PACKAGE_RANGE_MISMATCH", "Advisor evidence is bound to a different range");
        }
        var durationUs = endTimeUs - startTimeUs;
        if (range.durationUs !== durationUs) {
            fail("AI_PACKAGE_RANGE_INVALID", "Advisor range duration is inconsistent");
        }
        var startOffsetUs = finiteInteger(
            range.startOffsetUs,
            0,
            MAX_SAFE_INTEGER,
            "AI_PACKAGE_RANGE_INVALID",
            "Advisor range start offset"
        );
        var endOffsetUs = finiteInteger(
            range.endOffsetUs,
            1,
            MAX_SAFE_INTEGER,
            "AI_PACKAGE_RANGE_INVALID",
            "Advisor range end offset"
        );
        if (endOffsetUs - startOffsetUs !== durationUs) {
            fail("AI_PACKAGE_RANGE_INVALID", "Advisor range offsets are inconsistent");
        }
        return {
            startTimeUs: startTimeUs,
            endTimeUs: endTimeUs,
            startOffsetUs: startOffsetUs,
            endOffsetUs: endOffsetUs,
            durationUs: durationUs
        };
    }

    function validateEvidenceRange(value, selection, code) {
        if (value === undefined) {
            return;
        }
        if (!Array.isArray(value) || value.length !== 2
                || typeof value[0] !== "number" || !Number.isFinite(value[0])
                || typeof value[1] !== "number" || !Number.isFinite(value[1])
                || value[0] < selection.startTimeUs
                || value[1] > selection.endTimeUs
                || value[0] > value[1]) {
            fail(code, "Evidence escaped the selected In/Out range");
        }
    }

    function sanitizeFact(id, rawValue) {
        if (!hasOwn(FACT_REGISTRY, id)) {
            fail("AI_FACT_UNKNOWN", "Evidence fact is not registered");
        }
        var definition = FACT_REGISTRY[id];
        if (rawValue === null || rawValue === undefined) {
            return null;
        }
        if (definition.type === "boolean") {
            if (typeof rawValue !== "boolean") {
                fail("AI_FACT_INVALID", "Boolean evidence fact has an invalid value");
            }
        } else {
            finiteNumber(
                rawValue,
                definition.minimum,
                definition.maximum,
                "AI_FACT_INVALID",
                "Evidence fact"
            );
            if (definition.integer && !Number.isInteger(rawValue)) {
                fail("AI_FACT_INVALID", "Count evidence fact must be an integer");
            }
        }
        return {
            id: id,
            value: rawValue,
            unit: definition.unit,
            scope: definition.scope
        };
    }

    function collectFacts(advisorPackage, selection) {
        var evidence = advisorPackage.evidence;
        if (!Array.isArray(evidence) || evidence.length > 96) {
            fail("AI_EVIDENCE_INVALID", "Advisor evidence must be a bounded array");
        }
        var seenEvidence = Object.create(null);
        var facts = [];
        var sourceToFacts = Object.create(null);

        function add(sourceId, id, value) {
            var item = sanitizeFact(id, value);
            if (!item) {
                return;
            }
            facts.push(item);
            if (!hasOwn(sourceToFacts, sourceId)) {
                sourceToFacts[sourceId] = [];
            }
            sourceToFacts[sourceId].push(id);
        }

        evidence.forEach(function(item) {
            requireObject(item, "AI_EVIDENCE_INVALID", "Advisor evidence item");
            var id = item.id;
            if (typeof id !== "string" || !SAFE_REFERENCE.test(id) || seenEvidence[id]) {
                fail("AI_EVIDENCE_INVALID", "Advisor evidence has an invalid or duplicate id");
            }
            seenEvidence[id] = true;
            validateEvidenceRange(item.timeRangeUs, selection, "AI_EVIDENCE_RANGE_INVALID");

            if (hasOwn(FACT_REGISTRY, id)) {
                add(id, id, item.value);
                return;
            }
            if (id === "governor.pitch-pump-consistency") {
                var value = requireObject(
                    item.value,
                    "AI_FACT_INVALID",
                    "Pitch-pump consistency evidence"
                );
                add(id, id + ".candidates", value.candidates);
                add(id, id + ".eligible", value.eligible);
                add(id, id + ".droop", value.droop);
                add(id, id + ".overshoot", value.overshoot);
                add(id, id + ".sufficient", value.sufficient);
                return;
            }
            if (/^governor\.pitch-pump\.[1-9][0-9]?$/.test(id)) {
                // Individual pump objects contain only deterministic evidence,
                // but are intentionally not exposed to the model in v1.
                return;
            }
            if (/^governor\.setting\.(p|i|d|f|master|tta|max-throttle)$/.test(id)) {
                // Settings stay in the deterministic proposal UI, never the AI input.
                return;
            }
            fail("AI_EVIDENCE_UNKNOWN", "Advisor evidence contains an unregistered id");
        });

        facts.sort(function(left, right) { return left.id.localeCompare(right.id); });
        if (facts.length > MAX_FACTS) {
            fail("AI_FACT_LIMIT", "Sanitized evidence exceeded the fact limit");
        }
        return { facts: facts, sourceToFacts: sourceToFacts };
    }

    function sanitizeFindings(advisorPackage, mechanicalResult, selection) {
        var combined = [];
        if (!Array.isArray(advisorPackage.findings)
                || advisorPackage.findings.length > 32) {
            fail("AI_FINDINGS_INVALID", "Advisor findings must be a bounded array");
        }
        combined = combined.concat(advisorPackage.findings);
        if (mechanicalResult && mechanicalResult.findings !== undefined) {
            if (!Array.isArray(mechanicalResult.findings)
                    || mechanicalResult.findings.length > 8) {
                fail("AI_FINDINGS_INVALID", "Mechanical findings must be a bounded array");
            }
            combined = combined.concat(mechanicalResult.findings);
        }
        if (combined.length > MAX_FINDINGS) {
            fail("AI_FINDINGS_INVALID", "Finding count exceeded the coach limit");
        }
        var seen = Object.create(null);
        var items = combined.map(function(finding) {
            requireObject(finding, "AI_FINDINGS_INVALID", "Finding");
            var id = finding.id;
            if (typeof id !== "string" || !hasOwn(KNOWN_FINDINGS, id)
                    || hasOwn(seen, id)) {
                fail("AI_FINDING_UNKNOWN", "Finding id is unknown or duplicated");
            }
            if (!hasOwn(FINDING_SEVERITY_REGISTRY, id)
                    || finding.severity !== FINDING_SEVERITY_REGISTRY[id]) {
                fail("AI_FINDINGS_INVALID", "Finding severity is inconsistent with its id");
            }
            seen[id] = true;
            validateEvidenceRange(finding.timeRangeUs, selection, "AI_FINDING_RANGE_INVALID");
            return { id: id, severity: finding.severity };
        });
        items.sort(function(left, right) { return left.id.localeCompare(right.id); });
        return {
            ids: items.map(function(item) { return item.id; }),
            items: items
        };
    }

    function sanitizeHarmonicMatch(value) {
        if (value === null || value === undefined) {
            return null;
        }
        requireObject(value, "AI_MECHANICAL_INVALID", "Mechanical harmonic match");
        var rotor = enumValue(
            value.rotor,
            ["main", "tail"],
            "AI_MECHANICAL_INVALID",
            "Harmonic rotor"
        );
        var maximumOrder = rotor === "main" ? 8 : 6;
        var order = finiteInteger(
            value.order,
            1,
            maximumOrder,
            "AI_MECHANICAL_INVALID",
            "Harmonic order"
        );
        var predictedHz = finiteNumber(
            value.predictedHz,
            0,
            10000,
            "AI_MECHANICAL_INVALID",
            "Predicted harmonic frequency"
        );
        var deltaHz = finiteNumber(
            value.deltaHz,
            0,
            10000,
            "AI_MECHANICAL_INVALID",
            "Harmonic frequency difference"
        );
        var toleranceHz = finiteNumber(
            value.toleranceHz,
            0.001,
            10000,
            "AI_MECHANICAL_INVALID",
            "Harmonic tolerance"
        );
        if (deltaHz > toleranceHz) {
            fail("AI_MECHANICAL_INVALID", "Mechanical harmonic match exceeded tolerance");
        }
        return {
            rotor: rotor,
            order: order,
            predictedHz: predictedHz,
            deltaHz: deltaHz,
            toleranceHz: toleranceHz
        };
    }

    function sanitizeMechanical(mechanicalResult, selection) {
        if (mechanicalResult === null || mechanicalResult === undefined) {
            return {
                status: "unavailable",
                reasonCodes: [],
                peaks: []
            };
        }
        requireObject(mechanicalResult, "AI_MECHANICAL_INVALID", "Mechanical result");
        var status = enumValue(
            mechanicalResult.status,
            ["clear", "attention", "insufficient", "unavailable"],
            "AI_MECHANICAL_INVALID",
            "Mechanical status"
        );
        var range = requireObject(
            mechanicalResult.range,
            "AI_MECHANICAL_INVALID",
            "Mechanical range"
        );
        if (range.startTimeUs !== selection.startTimeUs
                || range.endTimeUs !== selection.endTimeUs) {
            fail("AI_MECHANICAL_RANGE_MISMATCH", "Mechanical evidence is bound to another range");
        }
        var reasonCodes = uniqueKnownCodes(
            mechanicalResult.reasonCodes || [],
            KNOWN_MECHANICAL_REASONS,
            MAX_MECHANICAL_REASONS,
            "AI_MECHANICAL_REASON_INVALID",
            "Mechanical reason codes"
        );
        if (status === "unavailable") {
            return { status: status, reasonCodes: reasonCodes, peaks: [] };
        }
        if (!Array.isArray(mechanicalResult.axes) || mechanicalResult.axes.length > 3) {
            fail("AI_MECHANICAL_INVALID", "Mechanical axes must be a bounded array");
        }
        var axesSeen = Object.create(null);
        var sourceByAxis = Object.create(null);
        var peaks = [];
        mechanicalResult.axes.forEach(function(axisItem) {
            requireObject(axisItem, "AI_MECHANICAL_INVALID", "Mechanical axis");
            var axis = enumValue(
                axisItem.axis,
                ["roll", "pitch", "yaw"],
                "AI_MECHANICAL_INVALID",
                "Mechanical axis name"
            );
            if (hasOwn(axesSeen, axis)) {
                fail("AI_MECHANICAL_INVALID", "Mechanical axis is duplicated");
            }
            axesSeen[axis] = true;
            var source = enumValue(
                axisItem.source,
                ["gyroRAW", "gyroUnfilt", "gyroADC-filtered"],
                "AI_MECHANICAL_INVALID",
                "Mechanical gyro source"
            );
            sourceByAxis[axis] = source;
            if (!Array.isArray(axisItem.peaks) || axisItem.peaks.length > 5) {
                fail("AI_MECHANICAL_INVALID", "Mechanical peak list is invalid");
            }
            axisItem.peaks.forEach(function(peak, index) {
                requireObject(peak, "AI_MECHANICAL_INVALID", "Mechanical peak");
                if (peaks.length >= MAX_MECHANICAL_PEAKS) {
                    fail("AI_MECHANICAL_LIMIT", "Mechanical peak limit was exceeded");
                }
                if (typeof peak.attentionEligible !== "boolean") {
                    fail("AI_MECHANICAL_INVALID", "Mechanical attention gate is invalid");
                }
                peaks.push({
                    ref: "mechanical." + axis + ".peak." + (index + 1),
                    axis: axis,
                    source: source,
                    frequencyHz: finiteNumber(peak.frequencyHz, 5, 1000, "AI_MECHANICAL_INVALID", "Peak frequency"),
                    bandRmsDps: finiteNumber(peak.bandRmsDps, 0, 100000, "AI_MECHANICAL_INVALID", "Peak band RMS"),
                    prominenceDb: finiteNumber(peak.prominenceDb, 8, 1000, "AI_MECHANICAL_INVALID", "Peak prominence"),
                    persistenceRatio: finiteNumber(peak.persistenceRatio, 0.25, 1, "AI_MECHANICAL_INVALID", "Peak persistence"),
                    attentionEligible: peak.attentionEligible,
                    harmonicMatch: sanitizeHarmonicMatch(peak.harmonicMatch)
                });
            });
        });

        var attentionPeaks = peaks.filter(function(peak) {
            return peak.attentionEligible;
        });
        if (status === "attention"
                && (attentionPeaks.length === 0
                    || reasonCodes.indexOf("PERSISTENT_NARROWBAND_ENERGY") === -1)) {
            fail("AI_MECHANICAL_INVALID", "Mechanical attention status failed its evidence gate");
        }
        if (status === "clear") {
            if (attentionPeaks.length > 0 || Object.keys(axesSeen).length !== 3
                    || Object.keys(sourceByAxis).some(function(axis) {
                        return !hasOwn(sourceByAxis, axis)
                            || sourceByAxis[axis] !== "gyroRAW"
                            && sourceByAxis[axis] !== "gyroUnfilt";
                    })
                    || reasonCodes.some(function(reason) {
                        return reason
                            !== "PERSISTENT_NARROWBAND_ENERGY_BELOW_ATTENTION_THRESHOLD";
                    })) {
                fail("AI_MECHANICAL_INVALID", "Mechanical clear status failed its fail-closed gate");
            }
        }
        if (status === "insufficient") {
            if (reasonCodes.length === 0) {
                fail("AI_MECHANICAL_INVALID", "Mechanical insufficient status needs a reason");
            }
            peaks = [];
        }
        return {
            status: status,
            reasonCodes: reasonCodes,
            peaks: peaks
        };
    }

    function packageStatus(advisorPackage, mechanicalStatus) {
        var grade = requireObject(advisorPackage.grade, "AI_PACKAGE_INVALID", "Advisor grade");
        var quality = requireObject(advisorPackage.quality, "AI_PACKAGE_INVALID", "Advisor quality");
        var tracking = requireObject(advisorPackage.tracking, "AI_PACKAGE_INVALID", "Advisor tracking");
        var battery = requireObject(advisorPackage.battery, "AI_PACKAGE_INVALID", "Advisor battery");
        var governor = requireObject(advisorPackage.governor, "AI_PACKAGE_INVALID", "Advisor governor");
        return {
            overall: enumValue(grade.overall, ["supported", "limited", "blocked"], "AI_PACKAGE_INVALID", "Overall grade"),
            quality: enumValue(quality.status, ["pass", "caution", "blocked"], "AI_PACKAGE_INVALID", "Quality status"),
            tracking: enumValue(tracking.status, ["available", "limited", "unsupported"], "AI_PACKAGE_INVALID", "Tracking status"),
            battery: enumValue(battery.status, ["available", "limited", "warning", "unsupported"], "AI_PACKAGE_INVALID", "Battery status"),
            governor: enumValue(governor.status, ["available", "limited", "unsupported"], "AI_PACKAGE_INVALID", "Governor status"),
            mechanical: mechanicalStatus
        };
    }

    function sanitizeProposal(
        advisorPackage,
        validation,
        mechanical,
        sourceToFacts,
        status,
        findingState
    ) {
        requireObject(validation, "AI_RECOMMENDATION_STATE_INVALID", "Recommendation validation");
        var state = enumValue(
            validation.state,
            ["none", "valid", "mechanical-withhold"],
            "AI_RECOMMENDATION_STATE_INVALID",
            "Recommendation validation state"
        );
        var governor = requireObject(advisorPackage.governor, "AI_PACKAGE_INVALID", "Advisor governor");
        var gate = requireObject(
            governor.recommendationGate,
            "AI_RECOMMENDATION_GATE_INVALID",
            "Recommendation gate"
        );
        enumValue(
            gate.status,
            ["eligible", "withheld"],
            "AI_RECOMMENDATION_GATE_INVALID",
            "Recommendation gate status"
        );
        var advisorReasons = uniqueKnownCodes(
            gate.reasonCodes || [],
            KNOWN_ADVISOR_REASONS,
            MAX_ADVISOR_REASONS,
            "AI_ADVISOR_REASON_INVALID",
            "Advisor reason codes"
        );

        if (state !== "valid") {
            if (state === "none" && governor.recommendation !== null
                    && governor.recommendation !== undefined) {
                fail("AI_RECOMMENDATION_STATE_MISMATCH", "An unvalidated proposal cannot enter AI Coach");
            }
            return { proposal: null, advisorReasons: advisorReasons };
        }
        var grade = requireObject(advisorPackage.grade, "AI_PACKAGE_INVALID", "Advisor grade");
        var hasReadyFinding = findingState.ids.indexOf(
            "governor-f-next-controlled-test"
        ) >= 0;
        var hasContradictoryFinding = findingState.items.some(function(finding) {
            return finding.severity === "stop"
                || hasOwn(PROPOSAL_CONTRADICTORY_FINDINGS, finding.id);
        });
        if (mechanical.status !== "clear" || gate.status !== "eligible"
                || gate.firmwareBuildVerified !== true
                || advisorReasons.length !== 0
                || status.overall !== "supported"
                || status.quality !== "pass"
                || status.tracking !== "available"
                || status.battery !== "available"
                || status.governor !== "available"
                || grade.quality !== "supported"
                || grade.tracking !== "supported"
                || grade.governor !== "supported"
                || !hasReadyFinding
                || hasContradictoryFinding) {
            fail("AI_RECOMMENDATION_GATE_INVALID", "Validated proposal failed the exact-range safety gate");
        }
        var recommendation = requireObject(
            validation.recommendation,
            "AI_RECOMMENDATION_INVALID",
            "Validated recommendation"
        );
        var packaged = requireObject(
            governor.recommendation,
            "AI_RECOMMENDATION_INVALID",
            "Packaged recommendation"
        );
        var keysToMatch = [
            "kind", "setting", "currentValue", "proposedValue", "rollbackValue",
            "delta", "direction", "reasonCode", "directWriteAllowed",
            "validationRequired", "finalTuneClaim"
        ];
        if (keysToMatch.some(function(key) { return recommendation[key] !== packaged[key]; })) {
            fail("AI_RECOMMENDATION_STATE_MISMATCH", "Validated recommendation changed after validation");
        }
        if (recommendation.kind !== "next-controlled-test"
                || recommendation.setting !== "gov_f_gain"
                || recommendation.directWriteAllowed !== false
                || recommendation.validationRequired !== true
                || recommendation.finalTuneClaim !== false
                || (recommendation.delta !== 10 && recommendation.delta !== -10)
                || recommendation.direction !== (recommendation.delta === 10 ? "increase" : "decrease")) {
            fail("AI_RECOMMENDATION_INVALID", "Recommendation is outside the approved deterministic contract");
        }
        var expectedReason = recommendation.delta === 10
            ? "CONSISTENT_DROOP" : "CONSISTENT_OVERSHOOT";
        if (recommendation.reasonCode !== expectedReason) {
            fail("AI_RECOMMENDATION_INVALID", "Recommendation reason is inconsistent");
        }
        ["currentValue", "proposedValue", "rollbackValue"].forEach(function(key) {
            finiteInteger(
                recommendation[key],
                0,
                250,
                "AI_RECOMMENDATION_INVALID",
                "Recommendation value"
            );
        });
        if (recommendation.proposedValue - recommendation.currentValue !== recommendation.delta
                || recommendation.rollbackValue !== recommendation.currentValue) {
            fail("AI_RECOMMENDATION_INVALID", "Recommendation values are inconsistent");
        }
        var recommendationEvidenceIds = normalizeProposalEvidenceIds(
            recommendation.evidenceIds,
            "Validated recommendation evidence"
        );
        var packagedEvidenceIds = normalizeProposalEvidenceIds(
            packaged.evidenceIds,
            "Packaged recommendation evidence"
        );
        if (recommendationEvidenceIds.length !== packagedEvidenceIds.length
                || recommendationEvidenceIds.some(function(id, index) {
                    return id !== packagedEvidenceIds[index];
                })) {
            fail(
                "AI_RECOMMENDATION_STATE_MISMATCH",
                "Validated recommendation evidence changed after validation"
            );
        }
        if (recommendationEvidenceIds.some(function(id) {
            return !approvedProposalEvidenceId(id);
        })) {
            fail(
                "AI_RECOMMENDATION_INVALID",
                "Recommendation cited evidence outside the approved governor sources"
            );
        }
        var evidenceRefs = [];
        recommendationEvidenceIds.forEach(function(id) {
            (hasOwn(sourceToFacts, id) ? sourceToFacts[id] : []).forEach(function(factId) {
                if (evidenceRefs.indexOf(factId) === -1) {
                    evidenceRefs.push(factId);
                }
            });
        });
        if (evidenceRefs.length === 0) {
            fail("AI_RECOMMENDATION_INVALID", "Recommendation has no safe explanatory evidence");
        }
        return {
            proposal: {
                ref: "validated-governor-f-next-test",
                reasonCode: expectedReason,
                evidenceRefs: evidenceRefs.sort().slice(0, MAX_CARD_REFERENCES)
            },
            advisorReasons: advisorReasons
        };
    }

    function overallMessageCode(value) {
        if (value === "supported") { return "EVIDENCE_SUPPORTED"; }
        if (value === "limited") { return "EVIDENCE_LIMITED"; }
        return "EVIDENCE_BLOCKED";
    }

    function qualityMessageCode(value) {
        if (value === "pass") { return "QUALITY_PASS"; }
        if (value === "caution") { return "QUALITY_CAUTION"; }
        return "QUALITY_BLOCKED";
    }

    function trackingMessageCode(value) {
        if (value === "available") { return "TRACKING_AVAILABLE"; }
        if (value === "limited") { return "TRACKING_LIMITED"; }
        return "TRACKING_UNSUPPORTED";
    }

    function batteryMessageCode(value) {
        if (value === "available") { return "BATTERY_AVAILABLE"; }
        if (value === "limited") { return "BATTERY_LIMITED"; }
        if (value === "warning") { return "BATTERY_WARNING"; }
        return "BATTERY_UNSUPPORTED";
    }

    function governorMessageCode(value) {
        if (value === "available") { return "GOVERNOR_AVAILABLE"; }
        if (value === "limited") { return "GOVERNOR_LIMITED"; }
        return "GOVERNOR_UNSUPPORTED";
    }

    function pushUnique(values, value) {
        if (values.indexOf(value) === -1) {
            values.push(value);
        }
    }

    function allowedMessageCodes(status, mechanical, proposal, advisorGate) {
        var values = ["SCOPE_SELECTED_RANGE"];
        values.push(overallMessageCode(status.overall));
        values.push(qualityMessageCode(status.quality));
        values.push(trackingMessageCode(status.tracking));
        values.push(batteryMessageCode(status.battery));
        values.push(governorMessageCode(status.governor));
        if (mechanical.status === "clear") {
            values.push(mechanical.reasonCodes.indexOf(
                "PERSISTENT_NARROWBAND_ENERGY_BELOW_ATTENTION_THRESHOLD"
            ) >= 0 ? "MECHANICAL_CLEAR_BELOW_ATTENTION" : "MECHANICAL_CLEAR");
        } else if (mechanical.status === "attention") {
            var attention = mechanical.peaks.filter(function(peak) { return peak.attentionEligible; });
            var main = attention.some(function(peak) {
                return peak.harmonicMatch && peak.harmonicMatch.rotor === "main";
            });
            var tail = attention.some(function(peak) {
                return peak.harmonicMatch && peak.harmonicMatch.rotor === "tail";
            });
            var unmatched = attention.some(function(peak) { return !peak.harmonicMatch; });
            if (main) { values.push("MECHANICAL_ATTENTION_MAIN"); }
            if (tail) { values.push("MECHANICAL_ATTENTION_TAIL"); }
            if (unmatched || (!main && !tail)) { values.push("MECHANICAL_ATTENTION_UNMATCHED"); }
        } else if (mechanical.status === "insufficient") {
            values.push("MECHANICAL_INSUFFICIENT");
        } else {
            values.push("MECHANICAL_UNAVAILABLE");
        }
        if (proposal) {
            values.push("PROPOSAL_READY");
        } else if (advisorGate.status === "withheld") {
            values.push("PROPOSAL_WITHHELD");
        }
        return values;
    }

    function requiredMessageCodes(status, mechanical, proposal, advisorGate, allowed) {
        var values = ["SCOPE_SELECTED_RANGE"];
        if (status.overall !== "supported") {
            pushUnique(values, overallMessageCode(status.overall));
        }
        if (status.quality !== "pass") {
            pushUnique(values, qualityMessageCode(status.quality));
        }
        if (status.tracking !== "available") {
            pushUnique(values, trackingMessageCode(status.tracking));
        }
        if (status.battery !== "available") {
            pushUnique(values, batteryMessageCode(status.battery));
        }
        if (status.governor !== "available") {
            pushUnique(values, governorMessageCode(status.governor));
        }
        if (mechanical.status === "attention") {
            allowed.forEach(function(code) {
                if (code.indexOf("MECHANICAL_ATTENTION_") === 0) {
                    pushUnique(values, code);
                }
            });
        } else if (mechanical.status === "insufficient") {
            pushUnique(values, "MECHANICAL_INSUFFICIENT");
        } else if (mechanical.status === "unavailable") {
            pushUnique(values, "MECHANICAL_UNAVAILABLE");
        }
        if (proposal) {
            pushUnique(values, "PROPOSAL_READY");
        } else if (advisorGate.status === "withheld") {
            pushUnique(values, "PROPOSAL_WITHHELD");
        }
        if (values.length > MAX_RESPONSE_CARDS) {
            fail("AI_REQUIRED_CARD_LIMIT", "Required AI explanation exceeded the card limit");
        }
        return values;
    }

    function allowedNextStepCodes(status, mechanical, proposal, findingIds, advisorGate) {
        var values = ["VIEW_CITED_EVIDENCE"];
        if (status.quality !== "pass" || mechanical.status === "insufficient"
                || mechanical.status === "unavailable") {
            values.push("SELECT_CLEANER_RANGE");
        }
        if (mechanical.status === "attention") {
            values.push("INSPECT_MECHANICS_FIRST");
        }
        if (mechanical.status === "clear") {
            values.push("KEEP_COMPARISON_BASELINE");
        }
        if (findingIds.indexOf("governor-targeted-log-needed") >= 0) {
            values.push("CAPTURE_TARGETED_GOVERNOR_LOG");
        }
        if (advisorGate.status === "withheld") {
            values.push("REVIEW_WITHHELD_PREREQUISITES");
        }
        if (proposal) {
            values.push("REVIEW_VALIDATED_NEXT_TEST");
        }
        if (values.length > MAX_NEXT_STEPS) {
            fail("AI_REQUIRED_NEXT_STEP_LIMIT", "Allowed AI next steps exceeded the limit");
        }
        return values;
    }

    function requiredNextStepCodes(mechanical, proposal, findingIds, advisorGate) {
        var values = ["VIEW_CITED_EVIDENCE"];
        if (mechanical.status === "attention") {
            pushUnique(values, "INSPECT_MECHANICS_FIRST");
        }
        if (mechanical.status === "insufficient" || mechanical.status === "unavailable") {
            pushUnique(values, "SELECT_CLEANER_RANGE");
        }
        if (findingIds.indexOf("governor-targeted-log-needed") >= 0) {
            pushUnique(values, "CAPTURE_TARGETED_GOVERNOR_LOG");
        }
        if (advisorGate.status === "withheld") {
            pushUnique(values, "REVIEW_WITHHELD_PREREQUISITES");
        }
        if (proposal) {
            pushUnique(values, "REVIEW_VALIDATED_NEXT_TEST");
        }
        if (values.length > MAX_NEXT_STEPS) {
            fail("AI_REQUIRED_NEXT_STEP_LIMIT", "Required AI next steps exceeded the limit");
        }
        return values;
    }

    function buildCoachEnvelope(options) {
        requireObject(options, "AI_OPTIONS_INVALID", "AI Coach options");
        var advisorPackage = requireObject(
            options.advisorPackage,
            "AI_PACKAGE_INVALID",
            "Advisor package"
        );
        if (advisorPackage.schemaVersion !== ADVISOR_SCHEMA_VERSION
                || advisorPackage.analysisMode !== "deterministic-local") {
            fail("AI_PACKAGE_UNSUPPORTED", "Advisor package contract is unsupported");
        }
        var capabilities = requireObject(
            advisorPackage.capabilities,
            "AI_PACKAGE_INVALID",
            "Advisor capabilities"
        );
        if (capabilities.selectedRangeRequired !== true
                || capabilities.rawLogIncluded !== false
                || capabilities.directSettingWrites !== false) {
            fail("AI_PACKAGE_UNSAFE", "Advisor package capabilities are unsafe for AI Coach");
        }
        var policy = requireObject(
            advisorPackage.recommendationPolicy,
            "AI_PACKAGE_INVALID",
            "Recommendation policy"
        );
        if (policy.directSettingWrites !== false || policy.finalTuneClaims !== false) {
            fail("AI_PACKAGE_UNSAFE", "Recommendation policy is unsafe for AI Coach");
        }

        var requestId = safeBinding(options.requestId, "AI_REQUEST_ID_INVALID", "Request id");
        var rangeBinding = safeBinding(
            options.rangeBinding,
            "AI_RANGE_BINDING_INVALID",
            "Range binding"
        );
        var generation = finiteInteger(
            options.generation,
            0,
            2147483647,
            "AI_GENERATION_INVALID",
            "Analysis generation"
        );
        var selection = selectionRange(options, advisorPackage);
        var mechanical = sanitizeMechanical(options.mechanicalResult, selection);
        var status = packageStatus(advisorPackage, mechanical.status);
        var collected = collectFacts(advisorPackage, selection);
        var findings = sanitizeFindings(
            advisorPackage,
            options.mechanicalResult,
            selection
        );
        var proposalState = sanitizeProposal(
            advisorPackage,
            options.recommendationValidation,
            mechanical,
            collected.sourceToFacts,
            status,
            findings
        );
        var governorGate = advisorPackage.governor.recommendationGate;
        var allowedMessages = allowedMessageCodes(
            status,
            mechanical,
            proposalState.proposal,
            governorGate
        );
        var allowedNextSteps = allowedNextStepCodes(
            status,
            mechanical,
            proposalState.proposal,
            findings.ids,
            governorGate
        );
        var envelope = {
            schemaVersion: SCHEMA_VERSION,
            requestId: requestId,
            rangeBinding: rangeBinding,
            generation: generation,
            selection: selection,
            status: status,
            facts: collected.facts,
            reasons: {
                advisor: proposalState.advisorReasons,
                mechanical: mechanical.reasonCodes
            },
            findingIds: findings.ids,
            mechanical: {
                status: mechanical.status,
                peaks: mechanical.peaks
            },
            validatedProposal: proposalState.proposal,
            allowedMessageCodes: allowedMessages,
            requiredMessageCodes: requiredMessageCodes(
                status,
                mechanical,
                proposalState.proposal,
                governorGate,
                allowedMessages
            ),
            allowedNextStepCodes: allowedNextSteps,
            requiredNextStepCodes: requiredNextStepCodes(
                mechanical,
                proposalState.proposal,
                findings.ids,
                governorGate
            )
        };
        if (serializedSize(envelope, "AI_REQUEST_SERIALIZATION_FAILED", "AI request")
                > MAX_REQUEST_BYTES) {
            fail("AI_REQUEST_TOO_LARGE", "Sanitized AI request exceeded its byte limit");
        }
        return deepFreeze(envelope);
    }

    function responseContext(context) {
        var envelope = context && context.envelope ? context.envelope : context;
        requireObject(envelope, "AI_RESPONSE_CONTEXT_INVALID", "AI response context");
        if (envelope.schemaVersion !== SCHEMA_VERSION
                || !Array.isArray(envelope.allowedMessageCodes)
                || !Array.isArray(envelope.requiredMessageCodes)
                || !Array.isArray(envelope.allowedNextStepCodes)
                || !Array.isArray(envelope.requiredNextStepCodes)) {
            fail("AI_RESPONSE_CONTEXT_INVALID", "AI response context is not a coach envelope");
        }
        if (context && context.envelope) {
            if (context.requestId !== undefined && context.requestId !== envelope.requestId) {
                fail("AI_RESPONSE_STALE", "AI request id changed while the model was running");
            }
            if (context.rangeBinding !== undefined
                    && context.rangeBinding !== envelope.rangeBinding) {
                fail("AI_RESPONSE_STALE", "AI range binding changed while the model was running");
            }
            if (context.generation !== undefined && context.generation !== envelope.generation) {
                fail("AI_RESPONSE_STALE", "AI analysis generation changed while the model was running");
            }
            if (context.selectedRange !== undefined) {
                var range = requireObject(
                    context.selectedRange,
                    "AI_RESPONSE_CONTEXT_INVALID",
                    "Current selected range"
                );
                if (range.startTimeUs !== envelope.selection.startTimeUs
                        || range.endTimeUs !== envelope.selection.endTimeUs) {
                    fail("AI_RESPONSE_STALE", "Selected In/Out range changed while the model was running");
                }
            }
        }
        return envelope;
    }

    function parseResponse(response) {
        if (typeof response === "string") {
            if (byteLength(response) > MAX_RESPONSE_BYTES) {
                fail("AI_RESPONSE_TOO_LARGE", "AI response exceeded its byte limit");
            }
            try {
                return JSON.parse(response);
            } catch (error) {
                fail("AI_RESPONSE_MALFORMED", "AI response was not strict JSON");
            }
        }
        if (serializedSize(response, "AI_RESPONSE_MALFORMED", "AI response")
                > MAX_RESPONSE_BYTES) {
            fail("AI_RESPONSE_TOO_LARGE", "AI response exceeded its byte limit");
        }
        return response;
    }

    function exactStringArray(values, maximum, validator, code, label) {
        if (!Array.isArray(values) || values.length > maximum) {
            fail(code, label + " must be a bounded array");
        }
        var seen = Object.create(null);
        return values.map(function(value) {
            if (typeof value !== "string" || !validator(value) || hasOwn(seen, value)) {
                fail(code, label + " contains an unknown or duplicate value");
            }
            seen[value] = true;
            return value;
        });
    }

    function startsWithAny(value, prefixes) {
        return prefixes.some(function(prefix) {
            return value.indexOf(prefix) === 0;
        });
    }

    function validateCoachResponse(response, context) {
        var envelope = responseContext(context);
        var value = parseResponse(response);
        exactKeys(value, [
            "schemaVersion",
            "requestId",
            "rangeBinding",
            "generation",
            "cards",
            "proposalRef",
            "nextStepCodes",
            "limitationCodes"
        ], "AI_RESPONSE_SCHEMA_INVALID", "AI response");
        if (value.schemaVersion !== SCHEMA_VERSION
                || value.requestId !== envelope.requestId
                || value.rangeBinding !== envelope.rangeBinding
                || value.generation !== envelope.generation) {
            fail("AI_RESPONSE_STALE", "AI response binding does not match the current request");
        }

        var evidenceSet = Object.create(null);
        envelope.facts.forEach(function(item) {
            exactKeys(
                item,
                ["id", "value", "unit", "scope"],
                "AI_RESPONSE_CONTEXT_INVALID",
                "AI context fact"
            );
            var normalizedFact = sanitizeFact(item.id, item.value);
            if (!normalizedFact || item.unit !== normalizedFact.unit
                    || item.scope !== normalizedFact.scope || hasOwn(evidenceSet, item.id)) {
                fail("AI_RESPONSE_CONTEXT_INVALID", "AI context fact is invalid or duplicated");
            }
            evidenceSet[item.id] = true;
        });
        var peaksByRef = Object.create(null);
        envelope.mechanical.peaks.forEach(function(item) {
            evidenceSet[item.ref] = true;
            peaksByRef[item.ref] = item;
        });
        var advisorReasonSet = lookup(envelope.reasons.advisor);
        var mechanicalReasonSet = lookup(envelope.reasons.mechanical);
        var allowedMessages = lookup(envelope.allowedMessageCodes);
        if (!Array.isArray(value.cards) || value.cards.length === 0
                || value.cards.length > MAX_RESPONSE_CARDS) {
            fail("AI_RESPONSE_CARDS_INVALID", "AI response cards must be a bounded non-empty array");
        }
        var cardsSeen = Object.create(null);
        var normalizedCards = value.cards.map(function(card) {
            exactKeys(
                card,
                ["messageCode", "evidenceRefs", "reasonRefs"],
                "AI_RESPONSE_CARD_INVALID",
                "AI response card"
            );
            if (typeof card.messageCode !== "string"
                    || !hasOwn(MESSAGE_REGISTRY, card.messageCode)
                    || !hasOwn(allowedMessages, card.messageCode)
                    || hasOwn(cardsSeen, card.messageCode)) {
                fail("AI_RESPONSE_MESSAGE_UNSAFE", "AI response selected an unavailable message code");
            }
            cardsSeen[card.messageCode] = true;
            var definition = MESSAGE_REGISTRY[card.messageCode];
            var evidenceRefs = exactStringArray(
                card.evidenceRefs,
                MAX_CARD_REFERENCES,
                function(reference) {
                    return SAFE_REFERENCE.test(reference) && hasOwn(evidenceSet, reference);
                },
                "AI_RESPONSE_EVIDENCE_INVALID",
                "AI evidence references"
            );
            if (definition.evidencePrefixes.length > 0
                    && evidenceRefs.some(function(reference) {
                        return !startsWithAny(reference, definition.evidencePrefixes);
                    })) {
                fail("AI_RESPONSE_EVIDENCE_INVALID", "AI card cited unrelated evidence");
            }
            var reasonRefs = exactStringArray(
                card.reasonRefs,
                MAX_CARD_REFERENCES,
                function(reference) {
                    return SAFE_CODE.test(reference)
                        && (hasOwn(advisorReasonSet, reference)
                            || hasOwn(mechanicalReasonSet, reference));
                },
                "AI_RESPONSE_REASON_INVALID",
                "AI reason references"
            );
            if (definition.reasonKind === "advisor"
                    && reasonRefs.some(function(reference) {
                        return !hasOwn(advisorReasonSet, reference);
                    })) {
                fail("AI_RESPONSE_REASON_INVALID", "AI card cited a non-advisor reason");
            }
            if (definition.reasonKind === "mechanical"
                    && reasonRefs.some(function(reference) {
                        return !hasOwn(mechanicalReasonSet, reference);
                    })) {
                fail("AI_RESPONSE_REASON_INVALID", "AI card cited a non-mechanical reason");
            }
            if (card.messageCode === "PROPOSAL_READY") {
                if (!envelope.validatedProposal
                        || evidenceRefs.length === 0
                        || evidenceRefs.some(function(reference) {
                            return envelope.validatedProposal.evidenceRefs.indexOf(reference) === -1;
                        })) {
                    fail("AI_RESPONSE_PROPOSAL_INVALID", "AI proposal card is not grounded in the validated proposal");
                }
            }
            if (card.messageCode === "MECHANICAL_ATTENTION_MAIN"
                    && !evidenceRefs.some(function(reference) {
                        var peak = hasOwn(peaksByRef, reference) ? peaksByRef[reference] : null;
                        return peak && peak.attentionEligible && peak.harmonicMatch
                            && peak.harmonicMatch.rotor === "main";
                    })) {
                fail("AI_RESPONSE_EVIDENCE_INVALID", "Main-harmonic explanation lacks its exact peak evidence");
            }
            if (card.messageCode === "MECHANICAL_ATTENTION_TAIL"
                    && !evidenceRefs.some(function(reference) {
                        var peak = hasOwn(peaksByRef, reference) ? peaksByRef[reference] : null;
                        return peak && peak.attentionEligible && peak.harmonicMatch
                            && peak.harmonicMatch.rotor === "tail";
                    })) {
                fail("AI_RESPONSE_EVIDENCE_INVALID", "Tail-harmonic explanation lacks its exact peak evidence");
            }
            if (card.messageCode === "MECHANICAL_ATTENTION_UNMATCHED"
                    && !evidenceRefs.some(function(reference) {
                        var peak = hasOwn(peaksByRef, reference) ? peaksByRef[reference] : null;
                        return peak && peak.attentionEligible && !peak.harmonicMatch;
                    })) {
                fail("AI_RESPONSE_EVIDENCE_INVALID", "Unmatched-peak explanation lacks its exact peak evidence");
            }
            return {
                messageCode: card.messageCode,
                evidenceRefs: evidenceRefs.slice(),
                reasonRefs: reasonRefs.slice()
            };
        });
        if (!hasOwn(cardsSeen, "SCOPE_SELECTED_RANGE")) {
            fail("AI_RESPONSE_SCOPE_MISSING", "AI response omitted the selected-range scope card");
        }
        envelope.requiredMessageCodes.forEach(function(code) {
            if (!hasOwn(MESSAGE_REGISTRY, code)
                    || envelope.allowedMessageCodes.indexOf(code) === -1
                    || !hasOwn(cardsSeen, code)) {
                fail(
                    "AI_RESPONSE_REQUIRED_MESSAGE_MISSING",
                    "AI response omitted a required safety or limitation card"
                );
            }
        });

        var proposalRef = value.proposalRef;
        if (proposalRef !== null) {
            if (proposalRef !== "validated-governor-f-next-test"
                    || !envelope.validatedProposal
                    || envelope.mechanical.status !== "clear"
                    || !hasOwn(cardsSeen, "PROPOSAL_READY")) {
                fail("AI_RESPONSE_PROPOSAL_INVALID", "AI response referenced an unavailable proposal");
            }
        } else if (hasOwn(cardsSeen, "PROPOSAL_READY")) {
            fail("AI_RESPONSE_PROPOSAL_INVALID", "AI proposal card omitted its validated proposal reference");
        }

        var allowedNextSteps = lookup(envelope.allowedNextStepCodes);
        var nextStepCodes = exactStringArray(
            value.nextStepCodes,
            MAX_NEXT_STEPS,
            function(code) {
                return SAFE_CODE.test(code)
                    && hasOwn(NEXT_STEP_REGISTRY, code)
                    && hasOwn(allowedNextSteps, code);
            },
            "AI_RESPONSE_NEXT_STEP_INVALID",
            "AI next-step codes"
        );
        envelope.requiredNextStepCodes.forEach(function(code) {
            if (!hasOwn(NEXT_STEP_REGISTRY, code)
                    || envelope.allowedNextStepCodes.indexOf(code) === -1
                    || nextStepCodes.indexOf(code) === -1) {
                fail(
                    "AI_RESPONSE_REQUIRED_NEXT_STEP_MISSING",
                    "AI response omitted a required safety next step"
                );
            }
        });
        var limitations = exactStringArray(
            value.limitationCodes,
            LIMITATION_CODES.length,
            function(code) { return LIMITATION_CODES.indexOf(code) >= 0; },
            "AI_RESPONSE_LIMITATIONS_INVALID",
            "AI limitation codes"
        );
        if (limitations.length !== LIMITATION_CODES.length
                || LIMITATION_CODES.some(function(code) {
                    return limitations.indexOf(code) === -1;
                })) {
            fail("AI_RESPONSE_LIMITATIONS_INVALID", "AI response omitted a required limitation");
        }

        return deepFreeze({
            schemaVersion: SCHEMA_VERSION,
            requestId: envelope.requestId,
            rangeBinding: envelope.rangeBinding,
            generation: envelope.generation,
            cards: normalizedCards,
            proposalRef: proposalRef,
            nextStepCodes: nextStepCodes.slice(),
            limitationCodes: LIMITATION_CODES.slice()
        });
    }

    return deepFreeze({
        SCHEMA_VERSION: SCHEMA_VERSION,
        ADVISOR_SCHEMA_VERSION: ADVISOR_SCHEMA_VERSION,
        MAX_REQUEST_BYTES: MAX_REQUEST_BYTES,
        MAX_RESPONSE_BYTES: MAX_RESPONSE_BYTES,
        MAX_RESPONSE_CARDS: MAX_RESPONSE_CARDS,
        MAX_CARD_REFERENCES: MAX_CARD_REFERENCES,
        MAX_NEXT_STEPS: MAX_NEXT_STEPS,
        FACT_REGISTRY: FACT_REGISTRY,
        MESSAGE_REGISTRY: MESSAGE_REGISTRY,
        NEXT_STEP_REGISTRY: NEXT_STEP_REGISTRY,
        LIMITATION_CODES: LIMITATION_CODES,
        AIContractError: AIContractError,
        buildCoachEnvelope: buildCoachEnvelope,
        validateCoachResponse: validateCoachResponse
    });
}));
