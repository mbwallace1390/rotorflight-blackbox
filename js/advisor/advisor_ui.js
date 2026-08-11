"use strict";

(function(window, document, $) {
    var PHASES = ["quality", "tracking", "governor", "findings"];
    var PHASE_LABELS = {
        quality: "Checking log quality",
        tracking: "Measuring control tracking",
        gyro: "Measuring control tracking",
        governor: "Measuring governor response",
        findings: "Building evidence-backed findings"
    };
    var MECHANICAL_PHASES = ["collect", "resample", "spectrum", "findings"];
    var MECHANICAL_PHASE_LABELS = {
        collect: "Collecting selected-range gyro evidence",
        resample: "Aligning selected-range gyro samples",
        spectrum: "Measuring selected-range vibration spectrum",
        findings: "Checking spectrum evidence"
    };
    var AI_PROTOCOL_VERSION = 1;
    var AI_MAX_REQUEST_BYTES = 32768;
    var AI_MAX_RESPONSE_BYTES = 9 * 1024;
    // Native bounds the full model SHA scan at 120s; leave reply-delivery headroom.
    var AI_STATUS_TIMEOUT_MS = 125000;
    // Native bounds inference at 120s; leave reply-delivery headroom on slower phones.
    var AI_REQUEST_TIMEOUT_MS = 125000;
    var AI_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
    var TUNE_CENTER_VIEWS = Object.freeze(["home", "cyclic", "governor", "mechanical", "report"]);
    var CYCLIC_AXES = Object.freeze(["roll", "pitch", "yaw"]);
    var CYCLIC_TERMS = Object.freeze(["P", "I", "D"]);
    var CYCLIC_CAPTURE_SLOTS = Object.freeze(["baseline", "test"]);
    var CYCLIC_COMPARISON_METRICS = Object.freeze([
        "trackingRmsDps",
        "fastRingingRmsDps",
        "slowOscillationRmsDps",
        "rawNoiseStepRmsDps"
    ]);
    var CYCLIC_METRIC_LABELS = Object.freeze({
        trackingRmsDps: "Tracking error",
        fastRingingRmsDps: "Fast post-stop ringing",
        slowOscillationRmsDps: "Slow post-stop oscillation",
        rawNoiseStepRmsDps: "Raw-gyro step noise"
    });
    var CYCLIC_REASON_MESSAGES = Object.freeze({
        UNSUPPORTED_FIRMWARE: "Use an exact supported Rotorflight 4.6.0 stable-build log.",
        UNVERIFIED_FIRMWARE_BUILD: "The exact supported Rotorflight 4.6.0 stable build could not be verified.",
        FIRMWARE_BUILD_UNSUPPORTED: "Use an exact Rotorflight 4.6.0 stable build 118e912 log.",
        FIRMWARE_IDENTITY_MISSING: "Firmware identity is incomplete in this capture.",
        FIRMWARE_BUILD_MISMATCH: "Baseline and test use different firmware builds.",
        CONFIGURATION_STATE_UNVERIFIED: "The active profile and gain state cannot be proven for this range.",
        COMMAND_OR_GYRO_FIELDS_MISSING: "Setpoint or filtered-gyro fields are missing.",
        RAW_GYRO_FIELDS_MISSING: "Unfiltered gyro evidence is required.",
        RAW_GYRO_SOURCE_MISMATCH: "Baseline and test use different unfiltered-gyro sources.",
        PID_TERM_FIELDS_MISSING: "Full logged P/I/D/F/B/O term evidence is required.",
        PID_CONFIGURATION_MISSING_OR_INVALID: "The logged axis gains are missing or invalid.",
        PID_CONFIGURATION_SHAPE_MISMATCH: "Baseline and test logged gain arrays are not comparable.",
        MIXER_SATURATION_EVIDENCE_UNAVAILABLE: "Rotorflight 4.6 Blackbox does not include enough mixer and servo-limit configuration to rule out control saturation. Importing a matching configuration snapshot will be required before an outcome can be classified.",
        PID_OUTPUT_SATURATION_IN_SELECTION: "PID output saturation was detected inside the selected maneuver.",
        CONFIGURATION_CONTEXT_INVALID: "Required profile, rate, or filter context is missing or invalid.",
        SAFETY_FIELDS_MISSING: "Required armed, flight-mode, failsafe, or receiver evidence is missing.",
        SAFETY_SAMPLE_INVALID: "Safety-state samples are incomplete or invalid inside the selection.",
        POWER_FIELDS_MISSING: "Required power or load evidence is missing.",
        POWERED_COVERAGE_INSUFFICIENT: "The range does not contain enough continuously powered flight.",
        BATTERY_SAMPLE_INVALID: "Battery evidence is missing or invalid inside the selection.",
        BATTERY_FIELD_MISSING: "Battery-voltage evidence is missing.",
        BATTERY_EVIDENCE_INVALID: "Battery evidence is incomplete or implausible inside the selection.",
        HEADSPEED_FIELD_MISSING: "Head-speed evidence is missing.",
        NO_SAMPLES_IN_SELECTION: "No samples were found inside the exact In/Out range.",
        SAMPLE_RATE_BELOW_900_HZ: "Cyclic comparison requires at least 900 Hz measured logging.",
        SELECTED_RANGE_COVERAGE_INSUFFICIENT: "Timestamp coverage is incomplete for the selected range.",
        TIMING_P99_TOO_HIGH: "Logging timing is too irregular for a controlled comparison.",
        FRAME_GAP_IN_SELECTION: "The selected range contains a logging gap.",
        NON_MONOTONIC_TIMESTAMP_IN_SELECTION: "Timestamps are not strictly ordered in the selection.",
        INVALID_TIMESTAMP_IN_CANDIDATE_CHUNK: "A candidate frame has an invalid timestamp.",
        NONFINITE_SAMPLE_IN_SELECTION: "The selected evidence contains invalid numeric samples.",
        INPUT_SAMPLE_LIMIT_EXCEEDED: "Select a shorter range; the bounded sample limit was reached.",
        INSUFFICIENT_ISOLATED_STOPS: "Capture at least four clean, isolated stops: two in each axis direction.",
        BIDIRECTIONAL_STOPS_REQUIRED: "Include controlled stops in both axis directions.",
        STOP_DIRECTION_IMBALANCE: "Positive and negative stop counts are too imbalanced.",
        STOP_EVENT_LIMIT_REACHED: "Too many stop candidates were found; select a shorter controlled range.",
        COMMAND_RELEASE_NOT_SUSTAINED: "The command did not release cleanly enough to form a stop event.",
        MIXED_AXIS_MANEUVER_IN_SELECTION: "Other-axis commands overlap the selected maneuver.",
        OFF_AXIS_GYRO_RESPONSE_EXCESSIVE: "Off-axis response is too large for an isolated-axis comparison.",
        HEADSPEED_EVIDENCE_MISSING: "Valid head-speed evidence is required.",
        HEADSPEED_IMPLAUSIBLE_IN_SELECTION: "Head speed is outside the supported powered-flight range.",
        HEADSPEED_SAMPLE_IMPLAUSIBLE: "Head-speed samples are outside the supported powered-flight range.",
        HEADSPEED_UNSTABLE_IN_SELECTION: "Head speed varied too much during this capture.",
        COLLECTIVE_LOAD_UNSTABLE_IN_SELECTION: "Collective or load varied too much during this capture.",
        COLLECTIVE_FIELD_MISSING: "Collective/load evidence is missing.",
        COLLECTIVE_EVIDENCE_INVALID: "Collective/load evidence is incomplete or implausible.",
        COLLECTIVE_RANGE_CONFIGURATION_INVALID: "The logged collective-range configuration is missing or invalid.",
        COLLECTIVE_SAMPLE_OUT_OF_RANGE: "Collective samples are outside the logged configured range.",
        FAILSAFE_IN_SELECTION: "Failsafe evidence is present in the selection.",
        RX_HEALTH_FAULT_IN_SELECTION: "Receiver-health evidence failed inside the selection.",
        UNSAFE_FLIGHT_MODE_IN_SELECTION: "A self-level, rescue, fallback, or other unsupported mode is present.",
        UNARMED_SAMPLE_IN_SELECTION: "Unarmed samples are present in the selected maneuver.",
        DISARM_IN_SELECTION: "A disarm event occurred inside the selection.",
        RESCUE_EVENT_IN_SELECTION: "A rescue event occurred inside the selection.",
        INFLIGHT_ADJUSTMENT_IN_SELECTION: "A setting adjustment occurred inside the selection.",
        PRESELECTION_INFLIGHT_ADJUSTMENT: "A setting or profile changed before In, so the log-start configuration cannot be trusted.",
        PID_PROFILE_CHANGE_IN_SELECTION: "The PID profile changed inside the selection.",
        LOGGING_RESUME_IN_SELECTION: "Logging resumed inside the selection.",
        AIRBORNE_TRANSITION_IN_SELECTION: "Airborne state changed inside the selection.",
        BASELINE_CAPTURE_INCONCLUSIVE: "The baseline capture did not pass every evidence gate.",
        TEST_CAPTURE_INCONCLUSIVE: "The test capture did not pass every evidence gate.",
        IDENTICAL_SELECTED_EVIDENCE: "Baseline and test are the same selected evidence.",
        SELECTED_GAIN_UNCHANGED: "The selected axis gain did not change between captures.",
        MULTIPLE_GAIN_CHANGES: "More than one logged gain changed between captures.",
        CHANGED_GAIN_NOT_SELECTED: "The changed logged gain is not the selected axis and PID term.",
        CONFIGURATION_CONTEXT_MISMATCH: "Profile, rate, filter, or other fixed context differs.",
        AXIS_MISMATCH: "Baseline and test use different axes.",
        TERM_MISMATCH: "Baseline and test use different PID terms.",
        SAMPLE_RATE_MISMATCH: "Baseline and test logging rates are not comparable.",
        RANGE_DURATION_MISMATCH: "Baseline and test range durations are not comparable.",
        MANEUVER_AMPLITUDE_MISMATCH: "Command amplitudes differ too much between captures.",
        MANEUVER_SIGN_MISMATCH: "Positive and negative stop evidence is missing, mismatched, or disagrees on the comparison outcome.",
        MANEUVER_SIGN_COUNT_MISMATCH: "Positive and negative stop counts do not match between captures.",
        STOP_COUNT_MISMATCH: "Baseline and test stop counts are not comparable.",
        COMMAND_DURATION_MISMATCH: "Baseline and test command durations are not comparable.",
        HEADSPEED_MISMATCH: "Baseline and test head speeds are not comparable.",
        COLLECTIVE_LOAD_MISMATCH: "Baseline and test collective/load conditions are not comparable.",
        COLLECTIVE_SOURCE_MISMATCH: "Baseline and test use different collective/load sources.",
        BATTERY_LOAD_MISMATCH: "Baseline and test battery/load conditions are not comparable.",
        I_TERM_HOLD_EVIDENCE_UNSUPPORTED: "I-term comparison needs a dedicated sustained-hold maneuver and is withheld in this release.",
        YAW_DIRECTIONAL_EVIDENCE_UNSUPPORTED: "Yaw comparison needs separately validated clockwise and counter-clockwise evidence and is withheld in this release.",
        SELECTED_TERM_EVIDENCE_UNCHANGED: "The selected logged PID-term evidence did not change measurably between captures.",
        COMPARISON_METRIC_MISSING: "A required comparison metric is unavailable.",
        CAPTURE_SCHEMA_INVALID: "Captured evidence failed its integrity check. Capture it again."
    });
    var CYCLIC_STOP_CODES = Object.freeze([
        "FAILSAFE_IN_SELECTION",
        "RX_HEALTH_FAULT_IN_SELECTION",
        "UNSAFE_FLIGHT_MODE_IN_SELECTION",
        "UNARMED_SAMPLE_IN_SELECTION",
        "DISARM_IN_SELECTION",
        "RESCUE_EVENT_IN_SELECTION",
        "INFLIGHT_ADJUSTMENT_IN_SELECTION",
        "PRESELECTION_INFLIGHT_ADJUSTMENT",
        "PID_OUTPUT_SATURATION_IN_SELECTION",
        "PID_PROFILE_CHANGE_IN_SELECTION"
    ]);
    var CYCLIC_CAUTION_CODES = Object.freeze([
        "FIRMWARE_BUILD_UNSUPPORTED",
        "UNSUPPORTED_FIRMWARE",
        "UNVERIFIED_FIRMWARE_BUILD",
        "CONFIGURATION_STATE_UNVERIFIED",
        "COMMAND_OR_GYRO_FIELDS_MISSING",
        "RAW_GYRO_FIELDS_MISSING",
        "RAW_GYRO_SOURCE_MISMATCH",
        "PID_TERM_FIELDS_MISSING",
        "PID_CONFIGURATION_MISSING_OR_INVALID",
        "MIXER_SATURATION_EVIDENCE_UNAVAILABLE",
        "CONFIGURATION_CONTEXT_INVALID",
        "SAFETY_FIELDS_MISSING",
        "SAFETY_SAMPLE_INVALID",
        "POWER_FIELDS_MISSING",
        "POWERED_COVERAGE_INSUFFICIENT",
        "BATTERY_SAMPLE_INVALID",
        "BATTERY_FIELD_MISSING",
        "BATTERY_EVIDENCE_INVALID",
        "BATTERY_LOAD_MISMATCH",
        "COLLECTIVE_FIELD_MISSING",
        "COLLECTIVE_EVIDENCE_INVALID",
        "COLLECTIVE_RANGE_CONFIGURATION_INVALID",
        "COLLECTIVE_SAMPLE_OUT_OF_RANGE",
        "COLLECTIVE_SOURCE_MISMATCH",
        "HEADSPEED_EVIDENCE_MISSING",
        "HEADSPEED_IMPLAUSIBLE_IN_SELECTION",
        "HEADSPEED_SAMPLE_IMPLAUSIBLE",
        "HEADSPEED_UNSTABLE_IN_SELECTION",
        "OFF_AXIS_GYRO_RESPONSE_EXCESSIVE",
        "AIRBORNE_TRANSITION_IN_SELECTION",
        "NO_SAMPLES_IN_SELECTION",
        "SAMPLE_RATE_BELOW_900_HZ",
        "SELECTED_RANGE_COVERAGE_INSUFFICIENT",
        "TIMING_P99_TOO_HIGH",
        "FRAME_GAP_IN_SELECTION",
        "NON_MONOTONIC_TIMESTAMP_IN_SELECTION",
        "INVALID_TIMESTAMP_IN_CANDIDATE_CHUNK",
        "NONFINITE_SAMPLE_IN_SELECTION",
        "INPUT_SAMPLE_LIMIT_EXCEEDED",
        "LOGGING_RESUME_IN_SELECTION"
    ]);
    var AI_BINDING_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
    var AI_RESPONSE_TYPES = Object.freeze([
        "advisor.status.result",
        "advisor.download.progress",
        "advisor.download.result",
        "advisor.explain.result",
        "advisor.error"
    ]);
    var AI_ERROR_MESSAGES = Object.freeze({
        AI_UNAVAILABLE: "On-device AI is unavailable on this phone or app build.",
        MODEL_NOT_INSTALLED: "The on-device model has not been installed yet.",
        DOWNLOAD_FAILED: "The model download did not finish. Check the connection and try again.",
        REQUEST_INVALID: "AI Coach rejected an invalid selected-range request.",
        REQUEST_TOO_LARGE: "The validated fact package was too large for AI Coach.",
        TIMEOUT: "AI Coach took too long and stopped safely.",
        CANCELLED: "AI Coach was cancelled.",
        BUSY: "On-device AI is busy. Wait a moment and try again.",
        INTERNAL: "AI Coach could not finish this explanation."
    });
    var CONFIRMATION_DEFINITIONS = Object.freeze([
        { key: "mechanicalInspection" },
        { key: "powerSystemHealthy" },
        { key: "rpmAndGearingVerified" },
        { key: "correctProfileVerified" },
        { key: "officialTestSetup" },
        { key: "safePitchPumps" }
    ]);
    var RECOMMENDATION_REASONS = Object.freeze({
        CONSISTENT_DROOP: "Repeated controlled pitch-pump evidence showed consistent headspeed droop. The measured and user-confirmed gates support evaluating one small Governor F increase.",
        CONSISTENT_OVERSHOOT: "Repeated controlled pitch-pump evidence showed consistent headspeed overshoot. The measured and user-confirmed gates support evaluating one small Governor F decrease."
    });
    var WITHHELD_REASON_MESSAGES = Object.freeze({
        UNSUPPORTED_FIRMWARE: "Directional advice is limited to an exact stable Rotorflight 4.6.0 log.",
        UNVERIFIED_FIRMWARE_BUILD: "The firmware build could not be verified as the supported stable Rotorflight 4.6.0 release.",
        SAMPLE_RATE_UNAVAILABLE: "The selected range does not provide a measurable logging rate.",
        SAMPLE_RATE_BELOW_900_HZ: "Governor F evaluation requires a measured logging rate of at least 900 Hz.",
        EFFECTIVE_SAMPLE_RATE_BELOW_900_HZ: "Timestamp-derived effective sampling rate must be at least 900 Hz.",
        TIMING_COVERAGE_INCOMPLETE: "Timestamp coverage is incomplete for the selected range.",
        TIMING_JITTER_TOO_HIGH: "Logging-interval jitter is too high for a controlled Governor F comparison.",
        TIMING_P99_TOO_HIGH: "The slowest one percent of logging intervals are too long for this evaluation.",
        MAX_FRAME_INTERVAL_TOO_HIGH: "At least one selected logging interval exceeds 5 ms; use a dense, uninterrupted log.",
        POWERED_DURATION_TOO_SHORT: "The selected range needs at least five seconds of powered flight.",
        SELECTED_RANGE_NOT_CLEAN: "The selected range contains invalid samples or discontinuities; capture or select a clean interval.",
        LOGGING_HEADER_INCOMPLETE: "Required Blackbox logging-header information is incomplete.",
        REQUIRED_GOVERNOR_FIELDS_MISSING: "Governor request, target, or actual-headspeed fields are missing.",
        COLLECTIVE_FIELD_MISSING: "The collective input field is missing.",
        COLLECTIVE_RANGE_HEADER_MISSING: "The logged collective-range header is missing or invalid.",
        MAIN_MOTOR_FIELD_MISSING: "The main-motor output field is missing.",
        FAILSAFE_FIELD_MISSING: "The failsafe-state field is missing.",
        FAILSAFE_SAMPLES_INCOMPLETE: "Failsafe-state samples are incomplete inside the selected range.",
        FLIGHT_MODE_FIELD_MISSING: "The flight-mode field needed for safety screening is missing.",
        FLIGHT_MODE_SAMPLES_INCOMPLETE: "Flight-mode samples are incomplete inside the selected range.",
        RX_FIELDS_MISSING: "Receiver-health fields needed for safety screening are missing.",
        RX_SIGNAL_SAMPLES_INCOMPLETE: "Receiver-signal samples are incomplete inside the selected range.",
        RX_CHANNEL_SAMPLES_INCOMPLETE: "Receiver channel-validity samples are incomplete inside the selected range.",
        BATTERY_FIELD_MISSING: "Battery data needed for safety screening is missing.",
        BATTERY_SAMPLES_INCOMPLETE: "Battery samples are incomplete inside the selected range.",
        BATTERY_CONFIGURATION_HEADER_MISSING: "The battery configuration header needed for safety screening is missing.",
        BATTERY_CONFIGURATION_INVALID: "The logged battery configuration contains invalid values.",
        TAIL_FIELDS_MISSING: "Yaw setpoint or gyro fields needed to evaluate tail response are missing.",
        RX_SAFETY_UNKNOWN: "Receiver safety could not be evaluated from this range.",
        RX_SAFETY_BLOCKER: "A receiver-safety problem was detected in the selected range.",
        ARM_EVIDENCE_INCOMPLETE: "Arming-state evidence is incomplete for one or more controlled pump windows.",
        UNARMED_PUMP_WINDOW: "At least one evaluated pitch-pump window was not continuously armed.",
        BATTERY_SAFETY_UNKNOWN: "Battery safety could not be evaluated from this range.",
        BATTERY_SAFETY_BLOCKER: "Battery voltage crossed the configured warning threshold.",
        INFLIGHT_ADJUSTMENT_IN_SELECTION: "An in-flight adjustment occurred inside the selected range.",
        LOGGING_RESUME_IN_SELECTION: "A logging-resume event occurred inside the selected range.",
        DISARM_IN_SELECTION: "A disarm event occurred inside the selected range.",
        RESCUE_EVENT_IN_SELECTION: "A rescue event occurred inside the selected range.",
        UNSAFE_FLIGHT_MODE_IN_SELECTION: "A rescue, failsafe, fallback, suspend, bypass, or other unsafe mode was present in the selected range.",
        ACTIVE_EVENT_MISSING_IN_SELECTION: "Place In before an explicit Governor ACTIVE transition and Out after the controlled test.",
        GOVERNOR_STATE_SEQUENCE_UNSAFE: "The selected governor-state sequence is incomplete or unsafe for directional advice.",
        GOVERNOR_ACTIVE_DATA_INSUFFICIENT: "There is not enough valid Governor ACTIVE data in the selected range.",
        GOVERNOR_RECORDS_NOT_FULL_RATE: "Governor records were not retained at the full measured rate.",
        GOVERNOR_EVENTS_TRUNCATED: "The governor event list was truncated; use a shorter clean selection.",
        GOVERNOR_SETTINGS_MISSING_OR_INVALID: "Logged Governor P, I, D, F, or Master settings are missing or invalid.",
        CONSERVATIVE_F_TEST_PID_BASELINE_REQUIRED: "This experimental gate requires the logged conservative test tuple P 10, I 20, D 0.",
        OFFICIAL_F_TEST_PID_BASELINE_REQUIRED: "This experimental gate requires the logged conservative test tuple P 10, I 20, D 0.",
        GOVERNOR_TTA_MISSING_OR_INVALID: "The logged Governor TTA setting is missing or invalid.",
        GOVERNOR_TTA_MUST_BE_ZERO: "This experimental Governor F gate requires TTA to be 0.",
        GOVERNOR_MAX_THROTTLE_REQUIRED: "Enter the active profile's configured Governor Maximum Throttle.",
        GOVERNOR_MAX_THROTTLE_INVALID: "Governor Maximum Throttle must be a whole-number value from 10% through 100%.",
        GOVERNOR_REQUEST_EVIDENCE_INCOMPLETE: "Governor request evidence is incomplete for one or more pump windows.",
        GOVERNOR_REQUEST_UNSTABLE: "Governor request changed too much during a pump window.",
        GOVERNOR_TARGET_UNSTABLE: "Governor target RPM changed too much during the selected controlled test.",
        GOVERNOR_VALUES_INVALID_IN_SELECTION: "The selected range contains invalid governor values.",
        GOVERNOR_NUMERIC_VALUES_IMPLAUSIBLE: "Governor RPM, collective, or motor values are outside plausible numeric limits.",
        NON_MONOTONIC_TIMESTAMP_IN_SELECTION: "Timestamps do not increase monotonically throughout the selected range.",
        TRUNCATED_PUMP_WINDOW_IN_SELECTION: "A pitch-pump evaluation window crosses the selected In or Out boundary.",
        OVERLAPPING_PUMP_WINDOWS: "Pitch-pump evaluation windows overlap; repeat separated, independently measurable pumps.",
        CROSS_PUMP_HEADSPEED_INCONSISTENT: "Baseline headspeed is not consistent enough across the evaluated pumps.",
        PUMP_WINDOW_EVALUATION_LIMIT_REACHED: "Too many pump candidates were found; use a shorter controlled selection.",
        INSUFFICIENT_PITCH_PUMPS: "At least three eligible controlled pitch pumps are required.",
        INCONSISTENT_PITCH_PUMPS: "The eligible pitch-pump responses are not directionally consistent.",
        MOTOR_HEADROOM_INSUFFICIENT: "Measured main-motor output does not leave enough headroom below the entered governor throttle ceiling.",
        TAIL_EVIDENCE_INCOMPLETE: "Tail-response evidence is incomplete for the pump windows.",
        TAIL_RESPONSE_DEGRADED: "Tail response degraded during the controlled pump windows.",
        TAIL_TEST_NOT_CONTROLLED: "Yaw command or tail response indicates the pump test was not controlled.",
        GOVERNOR_F_FULL_STEP_OUT_OF_RANGE: "A full 10-point Governor F test step would exceed the supported 0–250 range.",
        CONFIRMATION_CONTEXT_REQUIRED: "Analyze this exact range once before recording its user confirmations.",
        CONFIRMATION_CONTEXT_MISMATCH: "The confirmations belong to a different range or configuration and were cleared.",
        CONFIRMATION_SESSION_REQUIRED: "The session-only confirmation binding is missing; verify the checks again in this app session.",
        CONFIRMATION_MECHANICAL_INSPECTION_REQUIRED: "Confirm the flight-readiness acknowledgment above.",
        CONFIRMATION_POWER_SYSTEM_HEALTHY_REQUIRED: "Confirm the flight-readiness acknowledgment above.",
        CONFIRMATION_RPM_AND_GEARING_REQUIRED: "Confirm the flight-readiness acknowledgment above.",
        CONFIRMATION_CORRECT_PROFILE_REQUIRED: "Confirm the flight-readiness acknowledgment above.",
        CONFIRMATION_OFFICIAL_TEST_SETUP_REQUIRED: "Confirm the flight-readiness acknowledgment above.",
        CONFIRMATION_SAFE_PITCH_PUMPS_REQUIRED: "Confirm the flight-readiness acknowledgment above.",
        MECHANICAL_ANALYSIS_REQUIRED: "Complete exact-range mechanical analysis before Governor F direction can be evaluated.",
        MECHANICAL_ANALYSIS_INSUFFICIENT: "The selected range did not provide enough mechanical evidence, so Governor F direction remains withheld.",
        MECHANICAL_ATTENTION_IN_SELECTION: "Selected-range vibration evidence requires a mechanics-first inspection before Governor F advice.",
        MECHANICAL_ANALYSIS_UNAVAILABLE: "Selected-range mechanical analysis was unavailable, so Governor F direction remains withheld."
    });

    var currentLog = null;
    var currentContext = {};
    var currentPackage = null;
    var currentPackageRange = null;
    var currentMechanicalState = null;
    var activeJob = null;
    var generation = 0;
    var isBound = false;
    var confirmationValues = emptyConfirmationValues();
    var confirmationSessionId = createConfirmationSessionId();
    var confirmationContextKey = null;
    var confirmationHasBoundKey = false;
    var confirmationBusy = false;
    var confirmationNotice = "";
    var governorMaxThrottleRaw = "";
    var governorMaxThrottleTouched = false;
    var aiCoachBinding = null;
    var aiCoachRequest = null;
    var aiCoachState = "unavailable";
    var aiBridgeBound = false;
    var aiModelReady = false;
    var aiCoachRetryKind = null;
    var activeTuneCenterView = "home";
    var cyclicSelection = { axis: "pitch", term: "P" };
    // Presentation stores metadata only. Raw captures remain owned by the
    // deterministic comparison engine and are never persisted here.
    var cyclicCaptureMetadata = { baseline: null, test: null };
    var cyclicCaptures = { baseline: null, test: null };
    var cyclicComparisonState = null;
    var activeCyclicCapture = null;
    var tuneCenterAnalysisState = {
        governor: null,
        mechanical: null,
        report: null
    };
    var cyclicIntegrationReady = false;
    var analysisGlobalBlocker = null;
    var cyclicGlobalBlocker = null;

    var modal;
    var logSummary;
    var progressContainer;
    var progressLabel;
    var progressBar;
    var errorBox;
    var results;
    var findingsContainer;
    var measurementsContainer;
    var overallStatus;
    var rerunButton;
    var confirmationFieldset;
    var flightReadyConfirmationInput;
    var confirmationCountLabel;
    var confirmationStatus;
    var governorMaxThrottleInput;
    var withheldSection;
    var withheldReasonsContainer;
    var recommendationSection;
    var recommendationContainer;
    var mechanicalSection;
    var mechanicalStatus;
    var mechanicalContainer;
    var aiCoachSection;
    var aiCoachStatus;
    var aiCoachResult;
    var aiCoachAction;
    var tuneCenterViews;
    var tuneCenterModuleStatuses;
    var tuneCenterEmptyStates;
    var cyclicAxisInputs;
    var cyclicTermInputs;
    var cyclicCaptureButtons;
    var cyclicClearButton;
    var cyclicStatus;
    var cyclicSlotStatuses;
    var cyclicSlotSummaries;
    var cyclicComparisonEvidence;
    var cyclicComparisonStatus;
    var cyclicComparisonSummary;
    var cyclicComparisonMetrics;
    var cyclicComparisonReasons;

    function cacheElements() {
        if (modal && modal.length) {
            return true;
        }

        modal = $("#dlgTuneAdvisor");
        if (!modal.length) {
            return false;
        }

        logSummary = modal.find(".tune-advisor-log-summary");
        progressContainer = modal.find(".tune-advisor-progress");
        progressLabel = modal.find(".tune-advisor-progress-label");
        progressBar = modal.find(".progress-bar");
        errorBox = modal.find(".tune-advisor-error");
        results = modal.find(".tune-advisor-results");
        findingsContainer = modal.find(".tune-advisor-findings");
        measurementsContainer = modal.find(".tune-advisor-measurements");
        overallStatus = modal.find(".tune-advisor-overall-status");
        rerunButton = modal.find(".tune-advisor-rerun");
        confirmationFieldset = modal.find(".tune-advisor-confirmation-list");
        flightReadyConfirmationInput = confirmationFieldset.find("[data-flight-ready-confirmation]");
        confirmationCountLabel = modal.find(".tune-advisor-confirmation-count");
        confirmationStatus = modal.find(".tune-advisor-confirmation-status");
        governorMaxThrottleInput = modal.find("[data-user-input='governorMaxThrottlePct']");
        withheldSection = modal.find(".tune-advisor-withheld-section");
        withheldReasonsContainer = modal.find(".tune-advisor-withheld-reasons");
        recommendationSection = modal.find(".tune-advisor-recommendation-section");
        recommendationContainer = modal.find(".tune-advisor-recommendation");
        mechanicalSection = modal.find(".tune-advisor-mechanical-section");
        mechanicalStatus = modal.find(".tune-advisor-mechanical-status");
        mechanicalContainer = modal.find(".tune-advisor-mechanical");
        aiCoachSection = modal.find(".tune-advisor-ai-section");
        aiCoachStatus = modal.find(".tune-advisor-ai-status");
        aiCoachResult = modal.find(".tune-advisor-ai-result");
        aiCoachAction = modal.find(".tune-advisor-ai-action");
        tuneCenterViews = modal.find("[data-tune-center-view]");
        tuneCenterModuleStatuses = modal.find("[data-tune-center-status]");
        tuneCenterEmptyStates = modal.find("[data-tune-center-empty]");
        cyclicAxisInputs = modal.find("input[name='tune-center-cyclic-axis']");
        cyclicTermInputs = modal.find("input[name='tune-center-cyclic-term']");
        cyclicCaptureButtons = modal.find("[data-cyclic-capture]");
        cyclicClearButton = modal.find("[data-cyclic-clear]");
        cyclicStatus = modal.find(".tune-center-cyclic-status");
        cyclicSlotStatuses = modal.find("[data-cyclic-slot-status]");
        cyclicSlotSummaries = modal.find("[data-cyclic-slot-summary]");
        cyclicComparisonEvidence = modal.find("[data-cyclic-comparison-evidence]");
        cyclicComparisonStatus = modal.find("[data-cyclic-comparison-status]");
        cyclicComparisonSummary = modal.find("[data-cyclic-comparison-summary]");
        cyclicComparisonMetrics = modal.find("[data-cyclic-comparison-metrics]");
        cyclicComparisonReasons = modal.find("[data-cyclic-comparison-reasons]");
        return true;
    }

    function emptyConfirmationValues() {
        var values = {};
        CONFIRMATION_DEFINITIONS.forEach(function(definition) {
            values[definition.key] = false;
        });
        return values;
    }

    function groupedConfirmationValues(confirmed) {
        var values = emptyConfirmationValues();
        if (confirmed === true) {
            CONFIRMATION_DEFINITIONS.forEach(function(definition) {
                values[definition.key] = true;
            });
        }
        return values;
    }

    function hasConfirmationKey(key) {
        return CONFIRMATION_DEFINITIONS.some(function(definition) {
            return definition.key === key;
        });
    }

    function createConfirmationSessionId() {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID();
            }
        } catch (error) {
            // A non-persistent identifier is sufficient when WebView crypto is unavailable.
        }
        return "advisor-" + Date.now().toString(36) + "-"
            + Math.random().toString(36).slice(2, 12);
    }

    function confirmationCount() {
        return CONFIRMATION_DEFINITIONS.filter(function(definition) {
            return confirmationValues[definition.key] === true;
        }).length;
    }

    function allConfirmationsChecked() {
        return confirmationCount() === CONFIRMATION_DEFINITIONS.length;
    }

    function governorMaxThrottleValue() {
        var text = String(governorMaxThrottleRaw || "").trim();
        if (!text) {
            return null;
        }
        var value = Number(text);
        return isFiniteNumber(value)
            && Number.isInteger(value)
            && value >= 10
            && value <= 100
            ? value
            : null;
    }

    function updateConfirmationUi() {
        if (!cacheElements()) {
            return;
        }

        flightReadyConfirmationInput.prop("checked", allConfirmationsChecked());
        if (governorMaxThrottleInput.length
                && document.activeElement !== governorMaxThrottleInput[0]) {
            governorMaxThrottleInput.val(governorMaxThrottleRaw);
        }
        governorMaxThrottleInput.attr(
            "aria-invalid",
            governorMaxThrottleTouched && governorMaxThrottleValue() === null ? "true" : "false"
        );

        confirmationCountLabel.text(allConfirmationsChecked()
            ? "Flight-ready confirmed"
            : "Not confirmed");

        var confirmationsEnabled = Boolean(
            currentLog
            && confirmationContextKey
            && governorMaxThrottleValue() !== null
            && !confirmationBusy
        );
        confirmationFieldset.prop("disabled", false);
        flightReadyConfirmationInput.prop("disabled", !confirmationsEnabled);
        flightReadyConfirmationInput.closest(".tune-advisor-confirmation-item")
            .toggleClass("is-disabled", !confirmationsEnabled);
        governorMaxThrottleInput.prop("disabled", !(currentLog && !confirmationBusy));

        if (confirmationNotice) {
            confirmationStatus.text(confirmationNotice);
        } else if (!currentLog) {
            confirmationStatus.text("Open a Blackbox log before recording flight readiness.");
        } else if (confirmationBusy) {
            confirmationStatus.text("Measured analysis is running. The flight-readiness acknowledgment is temporarily locked.");
        } else if (governorMaxThrottleValue() === null) {
            confirmationStatus.text("Enter the active profile's configured Governor Maximum Throttle as a whole number from 10% through 100%. This user-entered value is required and is not measured from the log.");
        } else if (!confirmationContextKey) {
            confirmationStatus.text("Analyze the selected range once to bind the entered value to its exact logged configuration before confirming flight readiness.");
        } else if (allConfirmationsChecked()) {
            confirmationStatus.text(
                "Flight readiness and Governor Maximum Throttle "
                + formatNumber(governorMaxThrottleValue(), 0)
                + "% are recorded for this selected range. Analyze again to apply them; no setting will be written."
            );
        } else {
            confirmationStatus.text(
                "Confirm flight readiness before requesting Governor F direction. Measured safety gates must also pass."
            );
        }
    }

    function resetConfirmationSession(notice) {
        confirmationValues = emptyConfirmationValues();
        confirmationSessionId = createConfirmationSessionId();
        confirmationContextKey = null;
        confirmationHasBoundKey = false;
        confirmationBusy = false;
        confirmationNotice = notice || "";
        governorMaxThrottleRaw = "";
        governorMaxThrottleTouched = false;
        updateConfirmationUi();
    }

    function confirmationOptions() {
        if (!confirmationContextKey) {
            return null;
        }

        var payload = {
            sessionId: confirmationSessionId,
            configurationKey: confirmationContextKey
        };
        CONFIRMATION_DEFINITIONS.forEach(function(definition) {
            payload[definition.key] = confirmationValues[definition.key] === true;
        });
        return payload;
    }

    function userInputOptions() {
        var governorMaxThrottlePct = governorMaxThrottleValue();
        if (governorMaxThrottlePct === null) {
            return null;
        }
        return {
            governorMaxThrottlePct: governorMaxThrottlePct
        };
    }

    function element(tagName, className, text) {
        var node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = String(text);
        }
        return node;
    }

    function append(parent, child) {
        if (child) {
            parent.appendChild(child);
        }
        return child;
    }

    function isFiniteNumber(value) {
        return typeof value === "number" && Number.isFinite(value);
    }

    function formatNumber(value, digits) {
        if (!isFiniteNumber(value)) {
            return "—";
        }

        var precision = digits === undefined ? 1 : digits;
        return value.toLocaleString(undefined, {
            maximumFractionDigits: precision,
            minimumFractionDigits: 0
        });
    }

    function formatDuration(microseconds) {
        if (!isFiniteNumber(microseconds)) {
            return "—";
        }

        var seconds = microseconds / 1000000;
        if (seconds < 60) {
            return formatNumber(seconds, 1) + " s";
        }

        var minutes = Math.floor(seconds / 60);
        return minutes + " min " + formatNumber(seconds % 60, 0) + " s";
    }

    function readSelectedRange() {
        if (!currentContext || typeof currentContext.getSelectedRange !== "function") {
            return null;
        }

        var range = currentContext.getSelectedRange();
        if (!range
                || !Number.isSafeInteger(range.startTimeUs)
                || !Number.isSafeInteger(range.endTimeUs)
                || range.startTimeUs >= range.endTimeUs) {
            return null;
        }

        return {
            startTimeUs: range.startTimeUs,
            endTimeUs: range.endTimeUs
        };
    }

    function rangesEqual(left, right) {
        return Boolean(left && right
            && left.startTimeUs === right.startTimeUs
            && left.endTimeUs === right.endTimeUs);
    }

    function copyRange(range) {
        return {
            startTimeUs: range.startTimeUs,
            endTimeUs: range.endTimeUs
        };
    }

    function canonicalTuneCenterView(value) {
        return TUNE_CENTER_VIEWS.indexOf(value) >= 0 ? value : "home";
    }

    function canonicalCyclicSelection(axis, term) {
        var normalizedAxis = typeof axis === "string" ? axis.toLowerCase() : "";
        var normalizedTerm = typeof term === "string" ? term.toUpperCase() : "";
        if (CYCLIC_AXES.indexOf(normalizedAxis) < 0
                || CYCLIC_TERMS.indexOf(normalizedTerm) < 0) {
            return null;
        }
        return Object.freeze({ axis: normalizedAxis, term: normalizedTerm });
    }

    function canonicalCyclicSlot(value) {
        return CYCLIC_CAPTURE_SLOTS.indexOf(value) >= 0 ? value : null;
    }

    function cyclicSessionState() {
        return {
            selection: canonicalCyclicSelection(cyclicSelection.axis, cyclicSelection.term),
            baseline: cyclicCaptureMetadata.baseline,
            test: cyclicCaptureMetadata.test,
            comparison: cyclicComparisonState
        };
    }

    function cyclicSessionAfterLogChange(session) {
        var current = session || {};
        return {
            selection: current.selection || canonicalCyclicSelection("pitch", "P"),
            // Baseline metadata intentionally survives a new log so a pilot
            // can make a cross-file comparison in this app session.
            baseline: current.baseline || null,
            test: null,
            comparison: null
        };
    }

    function cyclicSessionAfterSelectionChange(session, selection) {
        var normalized = canonicalCyclicSelection(
            selection && selection.axis,
            selection && selection.term
        );
        if (!normalized) {
            return null;
        }
        return {
            selection: normalized,
            baseline: null,
            test: null,
            comparison: null
        };
    }

    function applyCyclicSessionState(session) {
        if (!session || !session.selection) {
            return false;
        }
        cyclicSelection = {
            axis: session.selection.axis,
            term: session.selection.term
        };
        cyclicCaptureMetadata = {
            baseline: session.baseline || null,
            test: session.test || null
        };
        cyclicComparisonState = session.comparison || null;
        return true;
    }

    function cyclicCaptureRequestPayload(slot, range, context, selection) {
        var normalizedSlot = canonicalCyclicSlot(slot);
        var normalizedSelection = canonicalCyclicSelection(
            selection && selection.axis,
            selection && selection.term
        );
        if (!normalizedSlot || !normalizedSelection || !range
                || !Number.isSafeInteger(range.startTimeUs)
                || !Number.isSafeInteger(range.endTimeUs)
                || range.startTimeUs >= range.endTimeUs) {
            return null;
        }

        var sourceContext = context || {};
        var fileName = typeof sourceContext.fileName === "string"
            ? sourceContext.fileName.slice(0, 240) : "Blackbox log";
        var logIndex = Number.isInteger(sourceContext.logIndex)
                && sourceContext.logIndex >= 0
            ? sourceContext.logIndex : null;
        var logStartTimeUs = Number.isSafeInteger(sourceContext.logStartTimeUs)
            ? sourceContext.logStartTimeUs : null;
        var rangeCopy = Object.freeze(copyRange(range));
        var source = Object.freeze({
            fileName: fileName,
            logIndex: logIndex,
            logStartTimeUs: logStartTimeUs
        });

        return Object.freeze({
            protocolVersion: 1,
            slot: normalizedSlot,
            axis: normalizedSelection.axis,
            term: normalizedSelection.term,
            range: rangeCopy,
            source: source,
            automatic: false,
            comparisonRequired: true
        });
    }

    function validCyclicCodeList(codes, maximum) {
        return Array.isArray(codes)
            && codes.length <= maximum
            && codes.every(function(code, index) {
                return typeof code === "string"
                    && /^[A-Z][A-Z0-9_]{0,79}$/.test(code)
                    && Object.prototype.hasOwnProperty.call(CYCLIC_REASON_MESSAGES, code)
                    && codes.indexOf(code) === index;
            });
    }

    function cyclicEngineApi() {
        var engine = window.RotorLensCyclicPidAnalysis;
        return engine
            && typeof engine.captureFlightLogRange === "function"
            && typeof engine.compareCaptures === "function"
            ? engine : null;
    }

    function cyclicPayloadContainsForbiddenKey(value, depth) {
        var forbidden = [
            "records", "frames", "samples", "rawFrames", "rawLog", "log",
            "advice", "recommendation", "direction", "delta", "proposal",
            "write", "setting", "currentValue", "proposedValue", "rollbackValue"
        ];
        var level = depth || 0;
        if (!value || typeof value !== "object") {
            return false;
        }
        if (level > 12 || Object.keys(value).length > 256) {
            return true;
        }
        return Object.keys(value).some(function(key) {
            return forbidden.indexOf(key) >= 0
                || cyclicPayloadContainsForbiddenKey(value[key], level + 1);
        });
    }

    function cyclicCaptureMatchesRequest(capture, request) {
        return Boolean(capture
            && typeof capture === "object"
            && !Array.isArray(capture)
            && hasExactObjectKeys(capture, [
                "schemaVersion", "kind", "status", "codes", "axis", "term",
                "range", "firmware", "gainValue", "configuration",
                "availability", "quality", "maneuver", "selectedFingerprint",
                "integrityKey"
            ])
            && !cyclicPayloadContainsForbiddenKey(capture, 0)
            && capture.schemaVersion === 1
            && capture.kind === "rotorlens-cyclic-pid-capture"
            && ["captured", "inconclusive"].indexOf(capture.status) >= 0
            && capture.axis === request.axis
            && capture.term === request.term
            && capture.range
            && capture.range.startTimeUs === request.range.startTimeUs
            && capture.range.endTimeUs === request.range.endTimeUs
            && hasExactObjectKeys(capture.range, [
                "startTimeUs", "endTimeUs", "durationUs"
            ])
            && Number.isSafeInteger(capture.range.durationUs)
            && capture.range.durationUs === request.range.endTimeUs - request.range.startTimeUs
            && validCyclicCodeList(capture.codes, 32)
            && typeof capture.integrityKey === "string"
            && /^cap-[a-f0-9]{8}$/.test(capture.integrityKey)
            && capture.maneuver && typeof capture.maneuver === "object"
            && capture.quality && typeof capture.quality === "object");
    }

    function cyclicCaptureMetadataFromResult(slot, capture, request) {
        if (!cyclicCaptureMatchesRequest(capture, request)) {
            return null;
        }
        var maneuver = capture.maneuver;
        var quality = capture.quality;
        return normalizeCyclicCaptureMetadata(slot, {
            captureId: capture.integrityKey,
            axis: capture.axis,
            term: capture.term,
            range: capture.range,
            source: request.source,
            captureStatus: capture.status,
            codes: capture.codes,
            gainValue: capture.gainValue,
            stopCount: maneuver.stopCount,
            positiveStopCount: maneuver.positiveStopCount,
            negativeStopCount: maneuver.negativeStopCount,
            measuredSampleRateHz: quality.measuredSampleRateHz
        });
    }

    function normalizeCyclicCaptureMetadata(slot, metadata) {
        var normalizedSlot = canonicalCyclicSlot(slot);
        if (!normalizedSlot || !metadata || typeof metadata !== "object"
                || Array.isArray(metadata)) {
            return null;
        }
        var selection = canonicalCyclicSelection(metadata.axis, metadata.term);
        var range = metadata.range;
        var source = metadata.source && typeof metadata.source === "object"
            ? metadata.source : metadata;
        var captureId = typeof metadata.captureId === "string"
            ? metadata.captureId.trim() : "";
        var fileName = typeof source.fileName === "string"
            ? source.fileName.trim().slice(0, 240) : "";
        var logIndex = Number.isInteger(source.logIndex) && source.logIndex >= 0
            ? source.logIndex : null;
        var logStartTimeUs = Number.isSafeInteger(source.logStartTimeUs)
            ? source.logStartTimeUs : null;
        var captureStatus = metadata.captureStatus;
        var codes = metadata.codes;
        var gainValue = metadata.gainValue;
        var stopCount = metadata.stopCount;
        var positiveStopCount = metadata.positiveStopCount;
        var negativeStopCount = metadata.negativeStopCount;
        var measuredSampleRateHz = metadata.measuredSampleRateHz;

        if (!selection || selection.axis !== cyclicSelection.axis
                || selection.term !== cyclicSelection.term
                || !captureId || captureId.length > 128
                || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(captureId)
                || !fileName || !range
                || !Number.isSafeInteger(range.startTimeUs)
                || !Number.isSafeInteger(range.endTimeUs)
                || range.startTimeUs >= range.endTimeUs
                || ["captured", "inconclusive"].indexOf(captureStatus) < 0
                || !validCyclicCodeList(codes, 32)
                || (captureStatus === "captured" && codes.length !== 0)
                || (captureStatus === "inconclusive" && codes.length === 0)
                || !(gainValue === null || isFiniteNumber(gainValue))
                || !Number.isInteger(stopCount) || stopCount < 0 || stopCount > 64
                || !Number.isInteger(positiveStopCount) || positiveStopCount < 0
                || !Number.isInteger(negativeStopCount) || negativeStopCount < 0
                || positiveStopCount + negativeStopCount !== stopCount
                || !(measuredSampleRateHz === null
                    || (isFiniteNumber(measuredSampleRateHz) && measuredSampleRateHz >= 0))) {
            return null;
        }

        return Object.freeze({
            captureId: captureId,
            slot: normalizedSlot,
            axis: selection.axis,
            term: selection.term,
            range: Object.freeze(copyRange(range)),
            captureStatus: captureStatus,
            codes: Object.freeze(codes.slice()),
            gainValue: gainValue,
            stopCount: stopCount,
            positiveStopCount: positiveStopCount,
            negativeStopCount: negativeStopCount,
            measuredSampleRateHz: measuredSampleRateHz,
            source: Object.freeze({
                fileName: fileName,
                logIndex: logIndex,
                logStartTimeUs: logStartTimeUs
            })
        });
    }

    function normalizeCyclicComparisonState(result) {
        var allowedStatuses = ["comparable", "inconclusive", "improved", "worse", "mixed"];
        if (!result || typeof result !== "object" || Array.isArray(result)
                || !hasExactObjectKeys(result, [
                    "schemaVersion", "kind", "status", "codes", "axis",
                    "term", "gainValues", "evidence"
                ])
                || result.schemaVersion !== 1
                || result.kind !== "rotorlens-cyclic-pid-comparison"
                || allowedStatuses.indexOf(result.status) < 0
                || result.axis !== cyclicSelection.axis
                || result.term !== cyclicSelection.term) {
            return null;
        }
        var codes = result.codes === undefined ? [] : result.codes;
        var inconclusive = result.status === "inconclusive";
        if (!validCyclicCodeList(codes, 32)
                || (inconclusive && codes.length === 0)
                || (!inconclusive && codes.length !== 0)) {
            return null;
        }
        var gainValues = result.gainValues;
        if (!gainValues || typeof gainValues !== "object" || Array.isArray(gainValues)
                || Object.keys(gainValues).length !== 2
                || !(gainValues.baseline === null || isFiniteNumber(gainValues.baseline))
                || !(gainValues.test === null || isFiniteNumber(gainValues.test))) {
            return null;
        }
        var evidence = result.evidence;
        if (!Array.isArray(evidence)
                || (inconclusive && evidence.length !== 0)
                || (!inconclusive && evidence.length !== CYCLIC_COMPARISON_METRICS.length)) {
            return null;
        }
        var normalizedEvidence = [];
        for (var index = 0; index < evidence.length; index++) {
            var item = evidence[index];
            if (!item || typeof item !== "object" || Array.isArray(item)
                    || !hasExactObjectKeys(item, [
                        "metric", "baselineValue", "testValue",
                        "testToBaselineRatio", "state"
                    ])
                    || CYCLIC_COMPARISON_METRICS[index] !== item.metric
                    || !isFiniteNumber(item.baselineValue)
                    || !isFiniteNumber(item.testValue)
                    || !(item.testToBaselineRatio === null
                        || isFiniteNumber(item.testToBaselineRatio))
                    || ["improved", "worse", "stable"].indexOf(item.state) < 0) {
                return null;
            }
            normalizedEvidence.push(Object.freeze({
                metric: item.metric,
                baselineValue: item.baselineValue,
                testValue: item.testValue,
                testToBaselineRatio: item.testToBaselineRatio,
                state: item.state
            }));
        }
        return Object.freeze({
            status: result.status,
            codes: Object.freeze(codes.slice()),
            axis: result.axis,
            term: result.term,
            gainValues: Object.freeze({
                baseline: gainValues.baseline,
                test: gainValues.test
            }),
            evidence: Object.freeze(normalizedEvidence)
        });
    }

    function createAIRequestId() {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID();
            }
        } catch (error) {
            // A request UUID is a stale-response key, not a security token.
        }

        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(marker) {
            var random = Math.floor(Math.random() * 16);
            var value = marker === "x" ? random : ((random & 3) | 8);
            return value.toString(16);
        });
    }

    function utf8ByteLength(value) {
        var text = String(value || "");
        var bytes = 0;
        for (var index = 0; index < text.length; index++) {
            var code = text.charCodeAt(index);
            if (code < 0x80) {
                bytes += 1;
            } else if (code < 0x800) {
                bytes += 2;
            } else if (code >= 0xD800 && code <= 0xDBFF
                    && index + 1 < text.length
                    && text.charCodeAt(index + 1) >= 0xDC00
                    && text.charCodeAt(index + 1) <= 0xDFFF) {
                bytes += 4;
                index++;
            } else {
                bytes += 3;
            }
        }
        return bytes;
    }

    function isObjectRecord(value) {
        return Boolean(value && typeof value === "object" && !Array.isArray(value));
    }

    function nativeAIBridge() {
        var bridge = window.advisorAI;
        return bridge && typeof bridge.postMessage === "function" ? bridge : null;
    }

    function aiBridgeAvailable() {
        return Boolean(nativeAIBridge());
    }

    function parseAIBridgeMessage(eventOrValue) {
        var value = eventOrValue && eventOrValue.data !== undefined
            ? eventOrValue.data : eventOrValue;
        if (typeof value === "string") {
            if (utf8ByteLength(value) > AI_MAX_RESPONSE_BYTES) {
                return null;
            }
            try {
                value = JSON.parse(value);
            } catch (error) {
                return null;
            }
        }

        if (!isObjectRecord(value)
                || Object.keys(value).length !== 4
                || !Object.prototype.hasOwnProperty.call(value, "v")
                || !Object.prototype.hasOwnProperty.call(value, "type")
                || !Object.prototype.hasOwnProperty.call(value, "requestId")
                || !Object.prototype.hasOwnProperty.call(value, "payload")
                || value.v !== AI_PROTOCOL_VERSION
                || AI_RESPONSE_TYPES.indexOf(value.type) < 0
                || typeof value.requestId !== "string"
                || !AI_BINDING_PATTERN.test(value.requestId)
                || !isObjectRecord(value.payload)) {
            return null;
        }
        return value;
    }

    function hasExactObjectKeys(value, keys) {
        if (!isObjectRecord(value) || Object.keys(value).length !== keys.length) {
            return false;
        }
        return keys.every(function(key) {
            return Object.prototype.hasOwnProperty.call(value, key);
        });
    }

    function responseTypeMatchesAIRequest(messageType, requestKind) {
        if (messageType === "advisor.error") {
            return true;
        }
        if (requestKind === "status") {
            return messageType === "advisor.status.result";
        }
        if (requestKind === "download") {
            return messageType === "advisor.download.progress"
                || messageType === "advisor.download.result";
        }
        if (requestKind === "explain") {
            return messageType === "advisor.explain.result";
        }
        return false;
    }

    function validAIBridgePayloadShape(message) {
        var payload = message && message.payload;
        if (!payload
                || typeof payload.rangeBinding !== "string"
                || !AI_BINDING_PATTERN.test(payload.rangeBinding)
                || !Number.isSafeInteger(payload.generation)
                || payload.generation < 0) {
            return false;
        }

        if (message.type === "advisor.explain.result") {
            // The safety contract performs the exact, code-only response check.
            return true;
        }
        if (message.type === "advisor.error") {
            return hasExactObjectKeys(payload, ["rangeBinding", "generation", "code"])
                && typeof payload.code === "string"
                && Object.prototype.hasOwnProperty.call(AI_ERROR_MESSAGES, payload.code);
        }
        if (message.type === "advisor.download.progress") {
            return hasExactObjectKeys(payload, [
                "rangeBinding",
                "generation",
                "state",
                "downloadedBytes",
                "totalBytes"
            ])
                && payload.state === "downloading"
                && Number.isSafeInteger(payload.downloadedBytes)
                && Number.isSafeInteger(payload.totalBytes)
                && payload.downloadedBytes >= 0
                && payload.totalBytes > 0
                && payload.downloadedBytes <= payload.totalBytes;
        }
        if (!hasExactObjectKeys(payload, ["rangeBinding", "generation", "state"])) {
            return false;
        }
        if (message.type === "advisor.status.result") {
            return ["unavailable", "not-installed", "downloading", "ready"]
                .indexOf(payload.state) >= 0;
        }
        if (message.type === "advisor.download.result") {
            return ["unavailable", "not-installed", "ready"].indexOf(payload.state) >= 0;
        }
        return false;
    }

    function responseMatchesAIRequest(message, request, liveGeneration, liveRange) {
        var payload = message && message.payload;
        return Boolean(
            request
            && message
            && payload
            && message.requestId === request.requestId
            && payload.rangeBinding === request.rangeBinding
            && payload.generation === request.generation
            && request.generation === liveGeneration
            && rangesEqual(request.range, liveRange)
        );
    }

    function makeAIBridgeEnvelope(type, requestId, payload) {
        return {
            v: AI_PROTOCOL_VERSION,
            type: type,
            requestId: requestId,
            payload: payload
        };
    }

    function makeAICancelEnvelope(request) {
        if (!request) {
            return null;
        }
        return makeAIBridgeEnvelope(
            "advisor.cancel",
            request.requestId,
            {
                rangeBinding: request.rangeBinding,
                generation: request.generation,
                operation: request.kind
            }
        );
    }

    function postAIBridgeEnvelope(envelope) {
        var bridge = nativeAIBridge();
        if (!bridge) {
            return false;
        }

        var serialized;
        try {
            serialized = JSON.stringify(envelope);
        } catch (error) {
            return false;
        }
        var contractLimit = window.RotorLensAIContract
            && window.RotorLensAIContract.MAX_REQUEST_BYTES;
        var maximumBytes = isFiniteNumber(contractLimit)
            ? Math.min(AI_MAX_REQUEST_BYTES, contractLimit)
            : AI_MAX_REQUEST_BYTES;
        if (utf8ByteLength(serialized) > maximumBytes) {
            return false;
        }

        try {
            bridge.postMessage(serialized);
            return true;
        } catch (error) {
            return false;
        }
    }

    function makeAIRequest(kind, range) {
        return {
            requestId: createAIRequestId(),
            rangeBinding: createAIRequestId(),
            generation: generation,
            range: copyRange(range),
            kind: kind,
            timeoutId: null,
            coachEnvelope: null
        };
    }

    // Keep this predicate pure so source-level smoke tests can exercise the
    // fail-closed recommendation boundary without constructing the modal.
    function evidenceRangeWithinSelection(evidence, selectedRange) {
        var timeRangeUs = evidence && evidence.timeRangeUs;
        return Boolean(
            selectedRange
            && isFiniteNumber(selectedRange.startTimeUs)
            && isFiniteNumber(selectedRange.endTimeUs)
            && selectedRange.startTimeUs < selectedRange.endTimeUs
            && Array.isArray(timeRangeUs)
            && timeRangeUs.length === 2
            && isFiniteNumber(timeRangeUs[0])
            && isFiniteNumber(timeRangeUs[1])
            && timeRangeUs[0] < timeRangeUs[1]
            && timeRangeUs[0] >= selectedRange.startTimeUs
            && timeRangeUs[1] <= selectedRange.endTimeUs
        );
    }

    function rangeLabel(range, logStartTimeUs) {
        if (!range
                || !isFiniteNumber(range.startTimeUs)
                || !isFiniteNumber(range.endTimeUs)
                || range.startTimeUs >= range.endTimeUs) {
            return "Set both graph In and Out markers";
        }

        var origin = isFiniteNumber(logStartTimeUs) ? logStartTimeUs : 0;
        var startSeconds = Math.max(0, range.startTimeUs - origin) / 1000000;
        var endSeconds = Math.max(0, range.endTimeUs - origin) / 1000000;
        return "Selected I " + formatNumber(startSeconds, 1)
            + " s → O " + formatNumber(endSeconds, 1)
            + " s (" + formatDuration(range.endTimeUs - range.startTimeUs) + ")";
    }

    function renderGlobalBlocker() {
        if (!cacheElements()) {
            return;
        }
        var blockers = [cyclicGlobalBlocker, analysisGlobalBlocker]
            .filter(Boolean)
            .sort(function(left, right) {
                return (right.level === "danger" ? 1 : 0)
                    - (left.level === "danger" ? 1 : 0);
            });
        errorBox.removeClass("alert-danger alert-warning");
        if (!blockers.length) {
            errorBox.attr("hidden", true).empty();
            return;
        }
        var danger = blockers.some(function(blocker) {
            return blocker.level === "danger";
        });
        errorBox
            .addClass(danger ? "alert-danger" : "alert-warning")
            .text(blockers.map(function(blocker) { return blocker.message; }).join(" "))
            .removeAttr("hidden");
    }

    function setGlobalBlocker(level, message) {
        analysisGlobalBlocker = message ? { level: level, message: message } : null;
        renderGlobalBlocker();
    }

    function setCyclicGlobalBlocker(level, message) {
        cyclicGlobalBlocker = message ? { level: level, message: message } : null;
        renderGlobalBlocker();
    }

    function cyclicSafetyBlockerForMetadata(metadataBySlot, comparison) {
        var codes = [];
        CYCLIC_CAPTURE_SLOTS.forEach(function(slot) {
            var metadata = metadataBySlot && metadataBySlot[slot];
            (metadata && metadata.codes || []).forEach(function(code) {
                if (codes.indexOf(code) < 0) {
                    codes.push(code);
                }
            });
        });
        (comparison && comparison.codes || []).forEach(function(code) {
            if (codes.indexOf(code) < 0) {
                codes.push(code);
            }
        });
        var stopCode = codes.find(function(code) {
            return CYCLIC_STOP_CODES.indexOf(code) >= 0;
        });
        if (stopCode) {
            return Object.freeze({
                level: "danger",
                message: "Cyclic capture stop / inspect: " + cyclicReasonText(stopCode)
            });
        }
        var cautionCode = codes.find(function(code) {
            return CYCLIC_CAUTION_CODES.indexOf(code) >= 0;
        });
        if (cautionCode) {
            return Object.freeze({
                level: "warning",
                message: "Cyclic comparison withheld: " + cyclicReasonText(cautionCode)
            });
        }
        return null;
    }

    function updateCyclicSafetyBlocker() {
        var blocker = cyclicSafetyBlockerForMetadata(
            cyclicCaptureMetadata,
            cyclicComparisonState
        );
        setCyclicGlobalBlocker(
            blocker && blocker.level,
            blocker && blocker.message
        );
    }

    function setModuleStatus(moduleName, label) {
        if (!tuneCenterModuleStatuses || !tuneCenterModuleStatuses.length) {
            return;
        }
        var status = tuneCenterModuleStatuses.filter(function() {
            return this.getAttribute("data-tune-center-status") === moduleName;
        });
        var statusClass = label === "Available" || label === "Evidence ready"
            ? "label-success"
            : (label === "Withheld" ? "label-warning"
                : (label === "Comparison required" ? "label-info" : "label-default"));
        status
            .removeClass("label-default label-info label-success label-warning label-danger")
            .addClass(statusClass)
            .attr("data-status", label.toLowerCase().replace(/\s+/g, "-"))
            .text(label);
    }

    function updateTuneCenterModuleStatuses() {
        if (!cacheElements()) {
            return;
        }
        var hasRange = Boolean(currentLog && readSelectedRange());
        if (!hasRange) {
            setModuleStatus(
                "cyclic",
                cyclicCaptureMetadata.baseline
                    && cyclicCaptureMetadata.baseline.captureStatus === "inconclusive"
                    ? "Withheld" : "Needs range"
            );
            ["governor", "mechanical", "report"].forEach(function(name) {
                setModuleStatus(name, "Needs range");
            });
        } else {
            var cyclicLabel = cyclicCaptureMetadata.baseline
                    && cyclicCaptureMetadata.baseline.captureStatus === "inconclusive"
                ? "Withheld"
                : (cyclicComparisonState
                    && cyclicCaptureMetadata.baseline
                    && cyclicCaptureMetadata.test
                ? (["inconclusive", "mixed"].indexOf(cyclicComparisonState.status) >= 0
                    ? "Withheld" : "Evidence ready")
                : "Comparison required");
            setModuleStatus("cyclic", cyclicLabel);
            setModuleStatus("governor", tuneCenterAnalysisState.governor || "Available");
            setModuleStatus("mechanical", tuneCenterAnalysisState.mechanical || "Available");
            setModuleStatus("report", tuneCenterAnalysisState.report || "Available");
        }
        if (tuneCenterEmptyStates && tuneCenterEmptyStates.length) {
            tuneCenterEmptyStates.prop("hidden", Boolean(currentPackage));
        }
    }

    function showTuneCenterView(viewName, focusHeading) {
        if (!cacheElements()) {
            return false;
        }
        var nextView = canonicalTuneCenterView(viewName);
        var previousView = activeTuneCenterView;
        activeTuneCenterView = nextView;
        tuneCenterViews.each(function() {
            var view = $(this);
            var active = this.getAttribute("data-tune-center-view") === nextView;
            view.prop("hidden", !active);
            view.attr("aria-hidden", active ? "false" : "true");
            view.toggleClass("is-active", active);
        });
        modal.attr("data-tune-center-active-view", nextView);
        modal.find(".modal-body").scrollTop(0);

        if (focusHeading !== false) {
            window.setTimeout(function() {
                var target;
                if (nextView === "home" && previousView !== "home") {
                    target = modal.find("[data-tune-center-target='" + previousView + "']").first();
                }
                if (!target || !target.length) {
                    target = modal.find("[data-tune-center-view='" + nextView
                        + "'] [data-tune-center-heading]").first();
                }
                if (target && target.length) {
                    target.trigger("focus");
                }
            }, 0);
        }
        return true;
    }

    function cyclicCaptureSummary(metadata) {
        if (!metadata) {
            return null;
        }
        var source = metadata.source || {};
        var label = source.fileName || "Blackbox log";
        if (Number.isInteger(source.logIndex)) {
            label += " · embedded log " + (source.logIndex + 1);
        }
        label += " · " + rangeLabel(metadata.range, source.logStartTimeUs);
        label += " · " + metadata.axis.charAt(0).toUpperCase()
            + metadata.axis.slice(1) + " " + metadata.term;
        if (isFiniteNumber(metadata.gainValue)) {
            label += " · logged gain " + formatNumber(metadata.gainValue, 2);
        }
        label += " · " + metadata.stopCount + " stops (+"
            + metadata.positiveStopCount + "/−" + metadata.negativeStopCount + ")";
        label += metadata.measuredSampleRateHz === null
            ? " · rate unavailable"
            : " · " + formatNumber(metadata.measuredSampleRateHz, 0) + " Hz";
        if (metadata.captureStatus === "inconclusive" && metadata.codes.length) {
            label += " · withheld: " + cyclicReasonText(metadata.codes[0]);
        }
        return label;
    }

    function cyclicReasonText(code) {
        return Object.prototype.hasOwnProperty.call(CYCLIC_REASON_MESSAGES, code)
            ? CYCLIC_REASON_MESSAGES[code]
            : humanizeMetric(code).toLowerCase() + ".";
    }

    function cyclicComparisonSummaryText(comparison) {
        if (!comparison) {
            return "";
        }
        if (comparison.status === "inconclusive") {
            return "The pair did not pass every matched-flight and evidence gate, so no outcome was classified.";
        }
        if (comparison.status === "improved") {
            return "One or more measured error/noise metrics decreased by more than the comparison tolerance and none increased beyond it.";
        }
        if (comparison.status === "worse") {
            return "One or more measured error/noise metrics increased by more than the comparison tolerance and none decreased beyond it.";
        }
        if (comparison.status === "mixed") {
            return "Some measured metrics decreased while others increased, so the evidence is mixed.";
        }
        return "All measured error/noise metrics stayed within the comparison tolerance.";
    }

    function renderCyclicComparisonEvidence() {
        if (!cyclicComparisonEvidence || !cyclicComparisonEvidence.length) {
            return;
        }
        cyclicComparisonMetrics.empty();
        cyclicComparisonReasons.empty();
        if (!cyclicComparisonState) {
            cyclicComparisonEvidence.attr("hidden", true);
            return;
        }

        var statusLabels = {
            comparable: "Comparable",
            inconclusive: "Withheld",
            improved: "Metrics decreased",
            worse: "Metrics increased",
            mixed: "Mixed"
        };
        var statusClass = cyclicComparisonState.status === "inconclusive"
                || cyclicComparisonState.status === "mixed"
            ? "label-warning"
            : (cyclicComparisonState.status === "worse" ? "label-danger" : "label-success");
        cyclicComparisonStatus
            .removeClass("label-default label-success label-warning label-danger")
            .addClass(statusClass)
            .text(statusLabels[cyclicComparisonState.status]);

        var gainValues = cyclicComparisonState.gainValues;
        var gainText = gainValues && isFiniteNumber(gainValues.baseline)
                && isFiniteNumber(gainValues.test)
            ? " Logged " + cyclicSelection.axis.charAt(0).toUpperCase()
                + cyclicSelection.axis.slice(1) + " " + cyclicSelection.term
                + " changed from " + formatNumber(gainValues.baseline, 2)
                + " to " + formatNumber(gainValues.test, 2) + "."
            : "";
        cyclicComparisonSummary.text(cyclicComparisonSummaryText(cyclicComparisonState) + gainText);

        cyclicComparisonState.evidence.forEach(function(item) {
            var card = element("div", "tune-center-cyclic-metric is-" + item.state);
            append(card, element("strong", null, CYCLIC_METRIC_LABELS[item.metric]));
            append(card, element(
                "span",
                null,
                formatNumber(item.baselineValue, 2) + " → "
                    + formatNumber(item.testValue, 2) + " °/s · " + item.state
            ));
            append(cyclicComparisonMetrics[0], card);
        });
        cyclicComparisonState.codes.forEach(function(code) {
            append(cyclicComparisonReasons[0], element("li", null, cyclicReasonText(code)));
        });
        cyclicComparisonReasons.prop("hidden", cyclicComparisonState.codes.length === 0);
        cyclicComparisonEvidence.removeAttr("hidden");
    }

    function cyclicComparisonStatusText() {
        if (!cyclicCaptureMetadata.baseline) {
            return cyclicIntegrationReady
                ? "Comparison required: save the current I/O range as a baseline."
                : "Comparison required: deterministic capture integration is not connected yet.";
        }
        if (!cyclicCaptureMetadata.test) {
            if (cyclicCaptureMetadata.baseline.captureStatus !== "captured") {
                return "Baseline withheld: replace it with a range that passes every capture gate before saving a test.";
            }
            return "Comparison required: the baseline is saved in this app session; load or select a test range and save it explicitly.";
        }
        if (!cyclicComparisonState) {
            return "Comparison required: both capture summaries are attached, but no validated deterministic comparison is available.";
        }
        var messages = {
            comparable: "Evidence ready: all compared metrics stayed within the comparison tolerance.",
            inconclusive: "Comparison withheld: the deterministic evidence is inconclusive.",
            improved: "Evidence ready: one or more measured error/noise metrics decreased without another increasing; no tuning advice was created.",
            worse: "Evidence ready: one or more measured error/noise metrics increased without another decreasing; no tuning advice was created.",
            mixed: "Comparison withheld: the deterministic evidence is mixed."
        };
        return messages[cyclicComparisonState.status] || "Comparison required.";
    }

    function updateCyclicUi() {
        if (!cacheElements()) {
            return;
        }
        cyclicAxisInputs.filter("[value='" + cyclicSelection.axis + "']").prop("checked", true);
        cyclicTermInputs.filter("[value='" + cyclicSelection.term + "']").prop("checked", true);
        modal.find(".tune-center-axis-signature > span").each(function() {
            $(this).toggleClass(
                "is-selected",
                this.textContent.toLowerCase() === cyclicSelection.axis.charAt(0)
            );
        });

        CYCLIC_CAPTURE_SLOTS.forEach(function(slot) {
            var metadata = cyclicCaptureMetadata[slot];
            var status = cyclicSlotStatuses.filter("[data-cyclic-slot-status='" + slot + "']");
            var summary = cyclicSlotSummaries.filter("[data-cyclic-slot-summary='" + slot + "']");
            var button = cyclicCaptureButtons.filter("[data-cyclic-capture='" + slot + "']");
            var comparisonAvailable = Boolean(metadata && cyclicComparisonState
                && cyclicCaptureMetadata.baseline && cyclicCaptureMetadata.test);
            status
                .removeClass("label-default label-success label-warning")
                .addClass(metadata
                    ? (metadata.captureStatus === "captured" ? "label-success" : "label-warning")
                    : "label-default")
                .text(metadata
                    ? (metadata.captureStatus === "captured" ? "Captured" : "Inconclusive")
                    : "Comparison required");
            if (metadata) {
                summary.text(cyclicCaptureSummary(metadata));
                button.text("Replace " + slot);
            } else if (slot === "baseline") {
                summary.text("No baseline capture is attached.");
                button.text("Save current I/O as baseline");
            } else {
                summary.text(!cyclicCaptureMetadata.baseline
                    ? "Save a baseline before attaching a test capture."
                    : (cyclicCaptureMetadata.baseline.captureStatus === "captured"
                        ? "No test capture is attached."
                        : "Replace the withheld baseline before attaching a test capture."));
                button.text("Save current I/O as test");
            }
        });

        var validRange = Boolean(currentLog && readSelectedRange());
        cyclicCaptureButtons.each(function() {
            var slot = this.getAttribute("data-cyclic-capture");
            var busy = Boolean(activeCyclicCapture);
            var canCapture = !busy && cyclicIntegrationReady && validRange
                && (slot === "baseline" || Boolean(
                    cyclicCaptureMetadata.baseline
                    && cyclicCaptureMetadata.baseline.captureStatus === "captured"
                ));
            $(this).prop("disabled", !canCapture);
            if (busy && activeCyclicCapture.slot === slot) {
                $(this).text("Capturing " + slot + "…");
            }
        });
        cyclicClearButton.prop("disabled", Boolean(activeCyclicCapture) || !(
            cyclicCaptureMetadata.baseline || cyclicCaptureMetadata.test
        ));
        cyclicStatus.text(cyclicComparisonStatusText());
        renderCyclicComparisonEvidence();
        updateCyclicSafetyBlocker();
        updateTuneCenterModuleStatuses();
    }

    function clearCyclicComparison(message) {
        cancelActiveCyclicCapture();
        cyclicCaptures = { baseline: null, test: null };
        cyclicCaptureMetadata = { baseline: null, test: null };
        cyclicComparisonState = null;
        updateCyclicUi();
        if (message && cyclicStatus && cyclicStatus.length) {
            cyclicStatus.text(message);
        }
        return true;
    }

    function setCyclicIntegrationReady(ready) {
        cyclicIntegrationReady = ready === true;
        updateCyclicUi();
        return cyclicIntegrationReady;
    }

    function setCyclicCaptureMetadata(slot, metadata) {
        var normalized = normalizeCyclicCaptureMetadata(slot, metadata);
        if (!normalized || (slot === "test" && (!cyclicCaptureMetadata.baseline
                || cyclicCaptureMetadata.baseline.captureStatus !== "captured"))) {
            return false;
        }
        if (slot === "baseline") {
            cyclicCaptureMetadata.baseline = normalized;
            cyclicCaptureMetadata.test = null;
        } else {
            cyclicCaptureMetadata.test = normalized;
        }
        cyclicComparisonState = null;
        updateCyclicUi();
        return true;
    }

    function setCyclicComparisonResult(result) {
        var normalized = normalizeCyclicComparisonState(result);
        if (!normalized || !cyclicCaptureMetadata.baseline || !cyclicCaptureMetadata.test) {
            return false;
        }
        cyclicComparisonState = normalized;
        updateCyclicUi();
        return true;
    }

    function cancelActiveCyclicCapture() {
        if (!activeCyclicCapture) {
            return false;
        }
        activeCyclicCapture.cancelled = true;
        activeCyclicCapture = null;
        updateCyclicUi();
        return true;
    }

    function cyclicCaptureBindingMatches(job, live) {
        var context = live || {};
        return Boolean(job
            && context.activeJob === job
            && !job.cancelled
            && job.generation === context.generation
            && job.log === context.log
            && rangesEqual(job.range, context.range)
            && context.selection
            && job.axis === context.selection.axis
            && job.term === context.selection.term
            && (job.slot !== "test" || job.baselineCapture === context.baselineCapture));
    }

    function cyclicCaptureJobMatches(job) {
        return cyclicCaptureBindingMatches(job, {
            activeJob: activeCyclicCapture,
            generation: generation,
            log: currentLog,
            range: readSelectedRange(),
            selection: cyclicSelection,
            baselineCapture: cyclicCaptures.baseline
        });
    }

    function cyclicCaptureErrorText(error) {
        var code = error && typeof error.code === "string" ? error.code : "";
        if (code === "CYCLIC_ANALYSIS_CANCELLED") {
            return "Cyclic capture stopped because its log, range, or selection changed.";
        }
        if (code === "CYCLIC_RANGE_DURATION_LIMIT") {
            return "Select a cyclic maneuver range no longer than 30 seconds.";
        }
        if (code && Object.prototype.hasOwnProperty.call(CYCLIC_REASON_MESSAGES, code)) {
            return CYCLIC_REASON_MESSAGES[code];
        }
        return "The cyclic evidence capture failed closed. Check the selected range and try again.";
    }

    function requestCyclicCapture(slot) {
        var selectedRange = readSelectedRange();
        var logStartTimeUs = currentLog && typeof currentLog.getMinTime === "function"
            ? currentLog.getMinTime() : null;
        var request = cyclicCaptureRequestPayload(
            slot,
            selectedRange,
            {
                fileName: currentContext.fileName || "Blackbox log",
                logIndex: currentContext.logIndex,
                logStartTimeUs: logStartTimeUs
            },
            cyclicSelection
        );
        var engine = cyclicEngineApi();
        if (!cyclicIntegrationReady || !engine || !request) {
            if (cyclicStatus && cyclicStatus.length) {
                cyclicStatus.text("Comparison required: select a valid I/O range and connect the deterministic capture integration.");
            }
            return false;
        }
        if (activeCyclicCapture) {
            cyclicStatus.text("A cyclic evidence capture is already running. Wait for it to finish or change the range to cancel it.");
            return false;
        }
        var job = {
            slot: request.slot,
            axis: request.axis,
            term: request.term,
            range: copyRange(request.range),
            source: request.source,
            generation: generation,
            log: currentLog,
            baselineCapture: request.slot === "test" ? cyclicCaptures.baseline : null,
            cancelled: false
        };
        if (job.slot === "test" && (!job.baselineCapture
                || job.baselineCapture.status !== "captured")) {
            cyclicStatus.text("Save a baseline that passes every capture gate before the test capture.");
            return false;
        }
        activeCyclicCapture = job;
        updateCyclicUi();
        $(document).trigger("rotorlens:cyclic-capture-request", [request]);
        cyclicStatus.text("Capturing " + slot + " evidence from the exact selected I/O range…");
        Promise.resolve(engine.captureFlightLogRange(job.log, {
            timeRangeUs: copyRange(job.range),
            axis: job.axis,
            term: job.term,
            isCancelled: function() {
                return !cyclicCaptureJobMatches(job);
            },
            onProgress: function(progress) {
                if (!cyclicCaptureJobMatches(job) || !progress) {
                    return;
                }
                var total = isFiniteNumber(progress.total) && progress.total > 0
                    ? progress.total : 1;
                var completed = isFiniteNumber(progress.completed)
                    ? Math.max(0, Math.min(total, progress.completed)) : 0;
                cyclicStatus.text("Capturing " + slot + " evidence · "
                    + Math.round((completed / total) * 100) + "%");
            }
        })).then(function(capture) {
            if (!cyclicCaptureJobMatches(job)) {
                return;
            }
            var metadata = cyclicCaptureMetadataFromResult(job.slot, capture, request);
            if (!metadata) {
                throw new Error("Cyclic capture contract mismatch");
            }
            if (job.slot === "baseline") {
                cyclicCaptures = { baseline: capture, test: null };
            } else {
                cyclicCaptures.test = capture;
            }
            if (!setCyclicCaptureMetadata(job.slot, metadata)) {
                throw new Error("Cyclic capture metadata rejected");
            }
            if (job.slot === "test") {
                var comparison = engine.compareCaptures(job.baselineCapture, capture);
                if (!cyclicCaptureJobMatches(job)
                        || !setCyclicComparisonResult(comparison)) {
                    throw new Error("Cyclic comparison contract mismatch");
                }
            }
            activeCyclicCapture = null;
            updateCyclicUi();
        }).catch(function(error) {
            if (activeCyclicCapture !== job) {
                return;
            }
            activeCyclicCapture = null;
            updateCyclicUi();
            cyclicStatus.text(cyclicCaptureErrorText(error));
        });
        return true;
    }

    function applyCyclicSelection(axis, term) {
        var nextSelection = canonicalCyclicSelection(axis, term);
        if (!nextSelection) {
            return false;
        }
        if (nextSelection.axis === cyclicSelection.axis
                && nextSelection.term === cyclicSelection.term) {
            return true;
        }
        applyCyclicSessionState(cyclicSessionAfterSelectionChange(
            cyclicSessionState(),
            nextSelection
        ));
        cancelActiveCyclicCapture();
        cyclicCaptures = { baseline: null, test: null };
        updateCyclicUi();
        $(document).trigger("rotorlens:cyclic-selection-change", [Object.freeze({
            axis: cyclicSelection.axis,
            term: cyclicSelection.term
        })]);
        cyclicStatus.text("Comparison required: axis or term changed, so the prior comparison was cleared.");
        return true;
    }

    function humanizeMetric(value) {
        return String(value || "Measurement")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[._-]+/g, " ")
            .replace(/^./, function(first) { return first.toUpperCase(); });
    }

    function setTriggerEnabled(enabled) {
        $(".open-tune-advisor").each(function() {
            var trigger = $(this);
            if (this.tagName.toLowerCase() === "button") {
                trigger.prop("disabled", !enabled);
            } else {
                trigger.toggleClass("disabled", !enabled);
                trigger.attr("aria-disabled", enabled ? "false" : "true");
            }
        });
    }

    function renderPendingLogSummary() {
        if (!cacheElements()) {
            return;
        }

        logSummary.empty();
        if (!currentLog) {
            append(logSummary[0], element("span", null, "Open a Blackbox log to use Tune Center."));
            return;
        }

        append(logSummary[0], element("strong", null, currentContext.fileName || "Current Blackbox log"));
        if (Number.isInteger(currentContext.logIndex)) {
            append(logSummary[0], element("span", null, "Embedded log " + (currentContext.logIndex + 1)));
        }
        var pendingRange = readSelectedRange();
        var pendingLogStart = typeof currentLog.getMinTime === "function" ? currentLog.getMinTime() : 0;
        append(logSummary[0], element("span", null, rangeLabel(pendingRange, pendingLogStart)));
        append(logSummary[0], element("span", null, "Analysis stays inside this viewer"));
    }

    function renderAnalyzedLogSummary(log, range) {
        if (!logSummary || !logSummary.length) {
            return;
        }

        logSummary.empty();
        append(logSummary[0], element("strong", null, currentContext.fileName || "Current Blackbox log"));

        if (log) {
            var firmware = [log.firmwareType, log.firmwareVersion]
                .filter(function(value) { return value !== undefined && value !== null && value !== ""; })
                .join(" ");
            if (firmware) {
                append(logSummary[0], element("span", null, firmware));
            }
            if (isFiniteNumber(log.durationUs)) {
                append(logSummary[0], element("span", null, "Full log " + formatDuration(log.durationUs)));
            }
        }
        if (range) {
            append(logSummary[0], element("span", null, rangeLabel(range, log && log.startTimeUs)));
            if (isFiniteNumber(range.sampleRateHz)) {
                append(logSummary[0], element("span", null, formatNumber(range.sampleRateHz, 1) + " Hz selected rate"));
            }
        }
    }

    function setProgress(label, percent) {
        if (!cacheElements()) {
            return;
        }

        var safePercent = Math.max(0, Math.min(100, isFiniteNumber(percent) ? percent : 0));
        progressLabel.text(label);
        progressBar.css("width", safePercent + "%");
        progressBar.attr("aria-valuenow", Math.round(safePercent));
        progressBar.attr("aria-valuetext", label);
    }

    function progressPercent(progress) {
        var phase = progress && progress.phase === "gyro" ? "tracking" : progress && progress.phase;
        var phaseIndex = PHASES.indexOf(phase);
        if (phaseIndex < 0) {
            return 0;
        }

        var ratio = 0;
        if (isFiniteNumber(progress.total) && progress.total > 0 && isFiniteNumber(progress.completed)) {
            ratio = Math.max(0, Math.min(1, progress.completed / progress.total));
        }

        return ((phaseIndex + ratio) / PHASES.length) * 100;
    }

    function mechanicalProgressPercent(progress) {
        var phaseIndex = MECHANICAL_PHASES.indexOf(progress && progress.phase);
        if (phaseIndex < 0) {
            return 0;
        }

        var ratio = 0;
        if (isFiniteNumber(progress.total) && progress.total > 0 && isFiniteNumber(progress.completed)) {
            ratio = Math.max(0, Math.min(1, progress.completed / progress.total));
        }
        return ((phaseIndex + ratio) / MECHANICAL_PHASES.length) * 28;
    }

    function clearMechanicalPresentation() {
        if (!mechanicalSection || !mechanicalSection.length) {
            return;
        }
        mechanicalSection.attr("hidden", true);
        mechanicalStatus
            .removeClass("status-clear status-attention status-insufficient")
            .empty();
        mechanicalContainer.empty();
    }

    function setAICoachState(state, detail) {
        if (!cacheElements()) {
            return;
        }

        var information = detail || {};
        aiCoachState = state;
        aiCoachRetryKind = state === "error" && information.retryKind === "status"
            ? "status" : null;
        aiCoachAction.prop("disabled", false);

        if (state !== "result") {
            aiCoachResult.attr("hidden", true).empty();
        }

        switch (state) {
        case "not-installed":
            aiModelReady = false;
            aiCoachStatus.text("The private on-device model is not installed yet.");
            aiCoachAction.text("Download ~329 MiB model");
            break;
        case "downloading":
            aiModelReady = false;
            var percent = isFiniteNumber(information.percent)
                ? Math.max(0, Math.min(100, information.percent)) : null;
            aiCoachStatus.text(
                percent === null
                    ? "Downloading the on-device model…"
                    : "Downloading the on-device model… " + formatNumber(percent, 0) + "%"
            );
            aiCoachAction.text(
                aiCoachRequest && aiCoachRequest.kind === "download"
                    ? "Cancel model download" : "Check download status"
            );
            break;
        case "ready":
            aiModelReady = true;
            aiCoachStatus.text("The on-device model is ready to explain this exact selected range.");
            aiCoachAction.text("Explain selected range");
            break;
        case "running":
            aiCoachStatus.text("AI Coach is prioritizing validated findings on this phone…");
            aiCoachAction.text("Cancel AI Coach");
            break;
        case "result":
            aiModelReady = true;
            aiCoachStatus.text("Explanation complete for this exact selected range.");
            aiCoachAction.text("Explain selected range again");
            aiCoachResult.removeAttr("hidden");
            break;
        case "error":
            aiCoachStatus.text(information.message || AI_ERROR_MESSAGES.INTERNAL);
            aiCoachAction.text(
                aiCoachRetryKind === "status"
                    ? "Retry model check"
                    : (aiModelReady ? "Try AI Coach again" : "Retry model download")
            );
            break;
        default:
            aiModelReady = false;
            aiCoachState = "unavailable";
            aiCoachStatus.text(information.message || AI_ERROR_MESSAGES.AI_UNAVAILABLE);
            aiCoachAction.text("AI Coach unavailable").prop("disabled", true);
            break;
        }
    }

    function clearAIRequestTimer(request) {
        if (request && request.timeoutId !== null) {
            clearTimeout(request.timeoutId);
            request.timeoutId = null;
        }
    }

    function cancelAICoachRequest(sendNativeCancel) {
        var request = aiCoachRequest;
        if (!request) {
            return null;
        }

        clearAIRequestTimer(request);
        aiCoachRequest = null;
        if (sendNativeCancel !== false) {
            postAIBridgeEnvelope(makeAICancelEnvelope(request));
        }
        return request;
    }

    function clearAICoachPresentation() {
        cancelAICoachRequest(true);
        aiCoachBinding = null;
        aiModelReady = false;
        aiCoachRetryKind = null;
        aiCoachState = "unavailable";
        if (aiCoachSection && aiCoachSection.length) {
            aiCoachSection.attr("hidden", true);
            aiCoachStatus.text("Checking on-device AI availability…");
            aiCoachResult.attr("hidden", true).empty();
            aiCoachAction.text("Check AI Coach").prop("disabled", true);
        }
    }

    function aiRequestTimeout(request) {
        if (aiCoachRequest !== request) {
            return;
        }
        cancelAICoachRequest(true);
        setAICoachState("error", {
            message: AI_ERROR_MESSAGES.TIMEOUT,
            retryKind: retryKindForAIError(request.kind, "TIMEOUT")
        });
    }

    function retryKindForAIError(requestKind, errorCode) {
        // MODEL_NOT_INSTALLED and AI_UNAVAILABLE are handled before this helper.
        // Every remaining status failure should retry verification, never download.
        return requestKind === "status" ? "status" : null;
    }

    function aiRetryRequestKind(state, modelReady, retryKind) {
        if (state === "error" && retryKind === "status") {
            return "status";
        }
        if (state === "not-installed" || (state === "error" && !modelReady)) {
            return "download";
        }
        if (state === "ready" || state === "result" || state === "error") {
            return "explain";
        }
        return null;
    }

    function armAIRequestTimeout(request) {
        clearAIRequestTimer(request);
        var delay = request.kind === "download"
            ? AI_DOWNLOAD_TIMEOUT_MS
            : (request.kind === "status" ? AI_STATUS_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS);
        request.timeoutId = setTimeout(function() {
            aiRequestTimeout(request);
        }, delay);
    }

    function commonAIBridgePayload(request) {
        return {
            rangeBinding: request.rangeBinding,
            generation: request.generation,
            selection: copyRange(request.range)
        };
    }

    function beginAIBridgeRequest(kind) {
        if (!aiCoachBinding
                || aiCoachBinding.generation !== generation
                || !rangesEqual(readSelectedRange(), aiCoachBinding.range)) {
            setAICoachState("error", {
                message: "The graph In/Out range changed. Analyze it again before using AI Coach."
            });
            return false;
        }

        cancelAICoachRequest(true);
        aiCoachRetryKind = null;
        var request = makeAIRequest(kind, aiCoachBinding.range);
        var envelope;

        if (kind === "explain") {
            var contract = window.RotorLensAIContract;
            if (!contract || typeof contract.buildCoachEnvelope !== "function") {
                setAICoachState("unavailable", {
                    message: "The AI Coach safety contract is unavailable in this build."
                });
                return false;
            }
            try {
                request.coachEnvelope = contract.buildCoachEnvelope({
                    advisorPackage: aiCoachBinding.advisorPackage,
                    mechanicalResult: aiCoachBinding.mechanicalResult,
                    recommendationValidation: aiCoachBinding.recommendationValidation,
                    selectedRange: copyRange(request.range),
                    requestId: request.requestId,
                    rangeBinding: request.rangeBinding,
                    generation: request.generation
                });
            } catch (error) {
                setAICoachState("error", {
                    message: "AI Coach could not build a safe selected-range fact package."
                });
                return false;
            }
            envelope = makeAIBridgeEnvelope(
                "advisor.explain",
                request.requestId,
                request.coachEnvelope
            );
        } else {
            envelope = makeAIBridgeEnvelope(
                kind === "download" ? "advisor.download" : "advisor.status",
                request.requestId,
                commonAIBridgePayload(request)
            );
        }

        aiCoachRequest = request;
        if (kind === "download") {
            setAICoachState("downloading");
        } else if (kind === "explain") {
            setAICoachState("running");
        } else {
            aiCoachStatus.text("Checking on-device AI availability…");
            aiCoachAction.text("Checking AI Coach…").prop("disabled", true);
        }

        if (!postAIBridgeEnvelope(envelope)) {
            aiCoachRequest = null;
            setAICoachState("unavailable", {
                message: "The secure on-device AI bridge is unavailable in this build."
            });
            return false;
        }
        if (aiCoachRequest === request) {
            armAIRequestTimeout(request);
        }
        return true;
    }

    function registryText(registry, code) {
        var entry = registry && registry[code];
        return entry && typeof entry.text === "string" ? entry.text : null;
    }

    function coachFactValue(fact) {
        if (!fact || !Object.prototype.hasOwnProperty.call(fact, "value")) {
            return null;
        }
        var contract = window.RotorLensAIContract;
        var definition = contract && contract.FACT_REGISTRY
            && contract.FACT_REGISTRY[fact.id];
        if (!definition || typeof definition.label !== "string") {
            return null;
        }
        var value = fact.value;
        var presented;
        if (typeof value === "number" && Number.isFinite(value)) {
            presented = formatNumber(value, Number.isInteger(value) ? 0 : 2);
        } else if (typeof value === "boolean") {
            presented = value ? "Yes" : "No";
        } else if (typeof value === "string" && value.length <= 96) {
            presented = value;
        } else {
            return null;
        }

        if (typeof definition.unit === "string" && definition.unit.length > 0
                && definition.unit !== "boolean") {
            presented += definition.unit === "percent"
                ? "%" : " " + definition.unit.replace(/-/g, " ");
        }
        return definition.label + ": " + presented;
    }

    function renderCodeOnlyCoachResult(response, request) {
        var contract = window.RotorLensAIContract;
        var messageRegistry = contract && contract.MESSAGE_REGISTRY;
        var nextStepRegistry = contract && contract.NEXT_STEP_REGISTRY;
        var factsById = Object.create(null);
        (request.coachEnvelope.facts || []).forEach(function(fact) {
            if (fact && typeof fact.id === "string") {
                factsById[fact.id] = fact;
            }
        });

        aiCoachResult.empty();
        append(aiCoachResult[0], element("h6", null, "AI-prioritized validated findings"));

        (response.cards || []).forEach(function(card) {
            var message = registryText(messageRegistry, card.messageCode);
            if (!message) {
                return;
            }
            append(aiCoachResult[0], element("p", "tune-advisor-ai-message", message));

            var factLines = (card.evidenceRefs || []).map(function(reference) {
                return coachFactValue(factsById[reference]);
            }).filter(Boolean);
            if (factLines.length > 0) {
                var factList = append(
                    aiCoachResult[0],
                    element("ul", "tune-advisor-ai-facts")
                );
                factLines.forEach(function(line) {
                    append(factList, element("li", null, line));
                });
            }
        });

        if (response.proposalRef === "validated-governor-f-next-test"
                && aiCoachBinding
                && aiCoachBinding.recommendationValidation
                && aiCoachBinding.recommendationValidation.state === "valid") {
            var recommendation = aiCoachBinding.recommendationValidation.recommendation;
            append(aiCoachResult[0], element(
                "p",
                "tune-advisor-ai-proposal",
                "Validated deterministic next test remains Governor F "
                    + formatNumber(recommendation.currentValue, 1) + " → "
                    + formatNumber(recommendation.proposedValue, 1)
                    + "; keep " + formatNumber(recommendation.rollbackValue, 1)
                    + " as the rollback value. AI did not choose or modify these numbers."
            ));
        }

        var nextSteps = (response.nextStepCodes || []).map(function(code) {
            return registryText(nextStepRegistry, code);
        }).filter(Boolean);
        if (nextSteps.length > 0) {
            append(aiCoachResult[0], element("h6", null, "Bounded next steps"));
            var nextStepList = append(
                aiCoachResult[0],
                element("ul", "tune-advisor-ai-next-steps")
            );
            nextSteps.forEach(function(step) {
                append(nextStepList, element("li", null, step));
            });
        }

        append(aiCoachResult[0], element(
            "p",
            "tune-advisor-ai-limitation",
            "Selected-range explanation only · not a component diagnosis or flightworthiness claim · no setting write."
        ));
        setAICoachState("result");
    }

    function handleAIBridgeMessage(eventOrValue) {
        var message = parseAIBridgeMessage(eventOrValue);
        var request = aiCoachRequest;
        if (!message || !responseMatchesAIRequest(
            message,
            request,
            generation,
            readSelectedRange()
        ) || !responseTypeMatchesAIRequest(message.type, request.kind)
                || !validAIBridgePayloadShape(message)) {
            return false;
        }

        var payload = message.payload;
        if (message.type === "advisor.download.progress") {
            setAICoachState("downloading", {
                percent: payload.downloadedBytes / payload.totalBytes * 100
            });
            armAIRequestTimeout(request);
            return true;
        }

        clearAIRequestTimer(request);
        aiCoachRequest = null;

        if (message.type === "advisor.error") {
            var errorCode = typeof payload.code === "string"
                && AI_ERROR_MESSAGES[payload.code]
                ? payload.code : "INTERNAL";
            if (errorCode === "AI_UNAVAILABLE") {
                setAICoachState("unavailable", { message: AI_ERROR_MESSAGES[errorCode] });
            } else if (errorCode === "MODEL_NOT_INSTALLED") {
                setAICoachState("not-installed");
            } else {
                setAICoachState("error", {
                    message: AI_ERROR_MESSAGES[errorCode],
                    retryKind: retryKindForAIError(request.kind, errorCode)
                });
            }
            return true;
        }

        if (message.type === "advisor.status.result"
                || message.type === "advisor.download.result") {
            if (payload.state === "ready") {
                setAICoachState("ready");
            } else if (payload.state === "not-installed") {
                setAICoachState("not-installed");
            } else if (payload.state === "downloading") {
                setAICoachState("downloading");
            } else if (payload.state === "unavailable") {
                setAICoachState("unavailable");
            } else {
                setAICoachState("error", { message: AI_ERROR_MESSAGES.REQUEST_INVALID });
                return false;
            }
            return true;
        }

        if (message.type !== "advisor.explain.result"
                || !request.coachEnvelope) {
            setAICoachState("error", { message: AI_ERROR_MESSAGES.REQUEST_INVALID });
            return false;
        }

        var contract = window.RotorLensAIContract;
        if (!contract || typeof contract.validateCoachResponse !== "function") {
            setAICoachState("unavailable", {
                message: "The AI Coach safety contract is unavailable in this build."
            });
            return false;
        }
        try {
            var validated = contract.validateCoachResponse(payload, {
                envelope: request.coachEnvelope,
                requestId: request.requestId,
                rangeBinding: request.rangeBinding,
                generation: request.generation,
                selectedRange: copyRange(request.range)
            });
            renderCodeOnlyCoachResult(validated, request);
            return true;
        } catch (error) {
            setAICoachState("error", {
                message: "AI Coach rejected a malformed or unbound explanation."
            });
            return false;
        }
    }

    function bindNativeAIBridge() {
        var bridge = nativeAIBridge();
        if (!bridge) {
            return false;
        }
        if (!aiBridgeBound) {
            bridge.onmessage = handleAIBridgeMessage;
            aiBridgeBound = true;
        }
        return true;
    }

    function prepareAICoach(
        evidencePackage,
        submittedRange,
        recommendationValidation,
        mechanicalValidation
    ) {
        cancelAICoachRequest(true);
        aiCoachBinding = {
            advisorPackage: evidencePackage,
            mechanicalResult: mechanicalValidation && mechanicalValidation.state === "valid"
                ? mechanicalValidation.result : null,
            recommendationValidation: recommendationValidation,
            range: copyRange(submittedRange),
            generation: generation
        };
        aiCoachSection.removeAttr("hidden");
        aiCoachResult.attr("hidden", true).empty();

        if (!window.RotorLensAIContract
                || typeof window.RotorLensAIContract.buildCoachEnvelope !== "function"
                || typeof window.RotorLensAIContract.validateCoachResponse !== "function") {
            setAICoachState("unavailable", {
                message: "The AI Coach safety contract is unavailable in this build."
            });
            return;
        }
        if (!bindNativeAIBridge()) {
            setAICoachState("unavailable", {
                message: "On-device AI is not available in this app host yet. The deterministic Tune Advisor result above is still complete."
            });
            return;
        }
        beginAIBridgeRequest("status");
    }

    function showError(message) {
        if (!cacheElements()) {
            return;
        }

        clearAICoachPresentation();
        progressContainer.attr("hidden", true);
        results.attr("hidden", true);
        withheldSection.attr("hidden", true);
        withheldReasonsContainer.empty();
        recommendationSection.attr("hidden", true);
        recommendationContainer.empty();
        currentMechanicalState = null;
        clearMechanicalPresentation();
        tuneCenterAnalysisState = { governor: null, mechanical: null, report: null };
        setGlobalBlocker("danger", message || "Tune Center could not analyze this log.");
        rerunButton.prop("disabled", !(currentLog && readSelectedRange()));
        modal.attr("aria-busy", "false");
        confirmationBusy = false;
        confirmationNotice = "Analysis stopped. Review the selected range and user-entered prerequisites before trying again.";
        updateConfirmationUi();
        updateTuneCenterModuleStatuses();
    }

    function resetPresentation() {
        if (!cacheElements()) {
            return;
        }

        clearAICoachPresentation();
        renderPendingLogSummary();
        results.attr("hidden", true);
        findingsContainer.empty();
        measurementsContainer.empty();
        withheldSection.attr("hidden", true);
        withheldReasonsContainer.empty();
        recommendationSection.attr("hidden", true);
        recommendationContainer.empty();
        clearMechanicalPresentation();
        overallStatus.removeClass("status-pass status-caution status-blocked").empty();
        tuneCenterAnalysisState = { governor: null, mechanical: null, report: null };
        progressContainer.removeAttr("hidden");
        var selectedRange = currentLog ? readSelectedRange() : null;
        setProgress(currentLog
            ? (selectedRange ? "Ready to analyze the selected range." : "Set graph In and Out to enable analysis.")
            : "Open a log to begin.", 0);
        rerunButton.prop("disabled", !(currentLog && selectedRange));
        setGlobalBlocker(
            currentLog && !selectedRange ? "warning" : null,
            currentLog && !selectedRange
                ? "Needs range: set both graph In and Out markers, with In before Out. No analysis has run."
                : null
        );
        modal.attr("aria-busy", "false");
        updateConfirmationUi();
        updateCyclicUi();
    }

    function metricLine(label, value) {
        var line = element("li");
        append(line, element("span", null, label));
        append(line, element("strong", null, value));
        return line;
    }

    function measurementCard(title, status, lines) {
        var column = element("div", "col-sm-6 tune-advisor-measurement-column");
        var card = append(column, element("article", "tune-advisor-measurement-card"));
        append(card, element("h6", null, title));
        if (status) {
            append(card, element("p", "tune-advisor-measurement-status", status));
        }

        var list = append(card, element("ul", "tune-advisor-metric-list"));
        lines.forEach(function(line) {
            append(list, metricLine(line.label, line.value));
        });
        return column;
    }

    function presentBoolean(value, yesText, noText) {
        if (value === true) {
            return yesText;
        }
        if (value === false) {
            return noText;
        }
        return "—";
    }

    function presentAxisCoverage(value) {
        if (!Array.isArray(value)) {
            return "Unknown";
        }
        var available = value.filter(function(item) { return item === true; }).length;
        return available + " / " + value.length + " axes";
    }

    function renderMeasurements(evidencePackage) {
        measurementsContainer.empty();

        var log = evidencePackage.log || {};
        var range = evidencePackage.range || {};
        var quality = evidencePackage.quality || {};
        var sampleCount = isFiniteNumber(range.sampleCount) ? range.sampleCount : quality.sampleCount;
        var sampleRateHz = isFiniteNumber(range.sampleRateHz) ? range.sampleRateHz : quality.sampleRateHz;
        append(measurementsContainer[0], measurementCard("Selected graph range", null, [
            { label: "In", value: formatDuration(range.startOffsetUs) },
            { label: "Out", value: formatDuration(range.endOffsetUs) },
            { label: "Duration", value: formatDuration(range.durationUs) },
            { label: "Samples", value: formatNumber(sampleCount, 0) },
            { label: "Sample rate", value: isFiniteNumber(sampleRateHz) ? formatNumber(sampleRateHz, 1) + " Hz" : "—" }
        ]));

        var invalidSamples = quality.invalidSampleCount;
        if (!isFiniteNumber(invalidSamples)) {
            invalidSamples = (Number(quality.invalidTimeCount) || 0)
                + (Number(quality.invalidRequiredValueCount) || 0);
        }
        var missingEndMarker = quality.missingEndMarker;
        if (missingEndMarker === undefined && quality.hasEndMarker !== undefined) {
            missingEndMarker = !quality.hasEndMarker;
        }
        append(measurementsContainer[0], measurementCard("Quality gate", quality.status, [
            { label: "Corrupt frames", value: formatNumber(quality.corruptFrames, 0) },
            { label: "Discontinuities", value: formatNumber(quality.discontinuities, 0) },
            { label: "Invalid samples", value: formatNumber(invalidSamples, 0) },
            { label: "End marker missing", value: presentBoolean(missingEndMarker, "Yes", "No") }
        ]));

        var tracking = evidencePackage.tracking || {};
        var trackingAxes = Array.isArray(tracking) ? tracking : tracking.axes;
        var trackingLines = [];
        if (tracking.source) {
            trackingLines.push({ label: "Source", value: tracking.source });
        }
        (Array.isArray(trackingAxes) ? trackingAxes : []).forEach(function(axis) {
            var values = [];
            if (isFiniteNumber(axis.rmsErrorDps)) {
                values.push("RMS " + formatNumber(axis.rmsErrorDps, 1));
            }
            if (isFiniteNumber(axis.p95AbsErrorDps)) {
                values.push("P95 " + formatNumber(axis.p95AbsErrorDps, 1));
            }
            trackingLines.push({
                label: humanizeMetric(axis.axis),
                value: values.length ? values.join(" · ") + " °/s" : "—"
            });
            if (isFiniteNumber(axis.commandedRmsErrorDps)) {
                trackingLines.push({
                    label: humanizeMetric(axis.axis) + " commanded RMS",
                    value: formatNumber(axis.commandedRmsErrorDps, 1) + " °/s"
                });
            }
        });
        if (!trackingLines.length) {
            trackingLines.push({ label: "Measurement", value: "Not available" });
        }
        append(measurementsContainer[0], measurementCard(
            "Control tracking",
            tracking.status || (Array.isArray(trackingAxes) ? "available" : "unsupported"),
            trackingLines
        ));

        var battery = evidencePackage.battery || {};
        var batteryLines = [];
        if (isFiniteNumber(battery.minimumVolts)) {
            batteryLines.push({ label: "Minimum", value: formatNumber(battery.minimumVolts, 2) + " V" });
        }
        if (isFiniteNumber(battery.maximumVolts)) {
            batteryLines.push({ label: "Maximum", value: formatNumber(battery.maximumVolts, 2) + " V" });
        }
        if (isFiniteNumber(battery.minimumCellVolts)) {
            batteryLines.push({ label: "Minimum per cell", value: formatNumber(battery.minimumCellVolts, 2) + " V" });
        }
        if (isFiniteNumber(battery.warningCellVolts)) {
            batteryLines.push({ label: "Configured warning", value: formatNumber(battery.warningCellVolts, 2) + " V/cell" });
        }
        if (!batteryLines.length) {
            batteryLines.push({ label: "Measurement", value: "Not available" });
        }
        append(measurementsContainer[0], measurementCard(
            "Battery",
            battery.status || (battery.available === true ? "available" : "unsupported"),
            batteryLines
        ));

        var governor = evidencePackage.governor || {};
        var governorLines = [];
        if (governor.source) {
            governorLines.push({ label: "Source", value: governor.source });
        }
        if (isFiniteNumber(governor.targetRpm)) {
            governorLines.push({ label: "Target", value: formatNumber(governor.targetRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.actualRpm)) {
            governorLines.push({ label: "Actual mean", value: formatNumber(governor.actualRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.rmseRpm)) {
            governorLines.push({ label: "Tracking RMSE", value: formatNumber(governor.rmseRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.maxDroopRpm)) {
            governorLines.push({ label: "Maximum droop", value: formatNumber(governor.maxDroopRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.maxOvershootRpm)) {
            governorLines.push({ label: "Maximum overshoot", value: formatNumber(governor.maxOvershootRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.motorP95Pct)) {
            governorLines.push({ label: "Motor 1 P95", value: formatNumber(governor.motorP95Pct, 1) + " %" });
        }
        if (!governorLines.length) {
            governorLines.push({ label: "Measurement", value: "Not available" });
        }
        append(measurementsContainer[0], measurementCard(
            "Governor",
            governor.status || (governor.available === true ? "available" : "unsupported"),
            governorLines
        ));

        var coverage = evidencePackage.coverage;
        if (coverage && typeof coverage === "object") {
            var coverageLines = [
                { label: "Setpoint", value: presentAxisCoverage(coverage.setpointAxes) },
                { label: "Filtered gyro", value: presentAxisCoverage(coverage.gyroAxes) },
                { label: "Raw gyro", value: presentAxisCoverage(coverage.rawGyroAxes) },
                { label: "Battery voltage", value: presentBoolean(coverage.battery, "Present", "Missing") },
                { label: "Headspeed", value: presentBoolean(coverage.headspeed, "Present", "Missing") },
                { label: "Collective", value: presentBoolean(coverage.collective, "Present", "Missing") },
                { label: "Motor outputs", value: isFiniteNumber(coverage.motorCount) ? formatNumber(coverage.motorCount, 0) : "Unknown" },
                { label: "Failsafe phase", value: presentBoolean(coverage.failsafePhase, "Present", "Missing") },
                { label: "RX signal + channels", value: presentBoolean(coverage.rxHealth, "Present", "Missing") },
                { label: "RX safety gate", value: coverage.rxSafety || "unknown" },
                { label: "Battery safety gate", value: coverage.batterySafety || "unknown" },
                { label: "Governor fields", value: presentBoolean(coverage.governor, "Present", "Missing") },
                { label: "Governor source", value: coverage.governorSource || "None" },
                { label: "Debug mode", value: coverage.debugMode || "Unknown" }
            ];
            if (coverageLines.length) {
                append(measurementsContainer[0], measurementCard("Analysis coverage", coverage.status, coverageLines));
            }
        }
    }

    function numberInRange(value, minimum, maximum) {
        return isFiniteNumber(value) && value >= minimum && value <= maximum;
    }

    function integerInRange(value, minimum, maximum) {
        return Number.isInteger(value) && value >= minimum && value <= maximum;
    }

    function ratioInRange(value, minimum) {
        return numberInRange(value, minimum === undefined ? 0 : minimum, 1);
    }

    function approximatelyEqual(left, right, tolerance) {
        return isFiniteNumber(left)
            && isFiniteNumber(right)
            && Math.abs(left - right) <= tolerance;
    }

    function validMechanicalReasonCodes(reasonCodes, requireOne) {
        if (!Array.isArray(reasonCodes)
                || (requireOne && reasonCodes.length === 0)
                || reasonCodes.length > 16) {
            return false;
        }
        var seen = Object.create(null);
        return reasonCodes.every(function(code) {
            return typeof code === "string"
                && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
                && !seen[code]
                && (seen[code] = true);
        });
    }

    function validMechanicalCoverage(item, minimumCoverage) {
        return item
            && integerInRange(item.totalPossibleWindowCount, 1, 4096)
            && integerInRange(item.validWindowCount, 1, item.totalPossibleWindowCount)
            && ratioInRange(item.validWindowCoverageRatio, minimumCoverage)
            && ratioInRange(item.finiteSampleCoverageRatio, minimumCoverage)
            && ratioInRange(item.finiteTimeSpanCoverageRatio, minimumCoverage);
    }

    function expectedMechanicalWindowCount(resampledSampleCount, windowSize) {
        if (!Number.isInteger(resampledSampleCount)
                || !Number.isInteger(windowSize)
                || resampledSampleCount < windowSize) {
            return 0;
        }
        return Math.floor(
            (resampledSampleCount - windowSize) / (windowSize / 2)
        ) + 1;
    }

    function validMechanicalQualityTimeline(quality, range, minimumCoverage) {
        var durationUs = range.endTimeUs - range.startTimeUs;
        var selectedSpanUs = quality.lastSelectedSampleTimeUs
            - quality.firstSelectedSampleTimeUs;
        var resampledSpanUs = quality.resampledEndTimeUs
            - quality.resampledStartTimeUs;
        var selectedCoverage = selectedSpanUs / durationUs;
        var resampledCoverage = resampledSpanUs / durationUs;
        var sourceRateSpanUs = (quality.sourceSampleCount - 1)
            * 1000000 / quality.measuredSampleRateHz;
        var resampledRateSpanUs = (quality.resampledSampleCount - 1)
            * 1000000 / quality.resampledRateHz;
        var sourceToleranceUs = Math.max(
            2 * 1000000 / quality.measuredSampleRateHz,
            durationUs * 0.1
        );
        var uniformToleranceUs = Math.max(2, durationUs * 0.0001);

        return numberInRange(
            quality.firstSelectedSampleTimeUs,
            range.startTimeUs,
            range.endTimeUs
        )
            && numberInRange(
                quality.lastSelectedSampleTimeUs,
                quality.firstSelectedSampleTimeUs,
                range.endTimeUs
            )
            && numberInRange(quality.leadingSelectedGapUs, 0, durationUs)
            && numberInRange(quality.trailingSelectedGapUs, 0, durationUs)
            && approximatelyEqual(
                quality.leadingSelectedGapUs,
                quality.firstSelectedSampleTimeUs - range.startTimeUs,
                0.01
            )
            && approximatelyEqual(
                quality.trailingSelectedGapUs,
                range.endTimeUs - quality.lastSelectedSampleTimeUs,
                0.01
            )
            && approximatelyEqual(
                quality.leadingSelectedGapUs + selectedSpanUs
                    + quality.trailingSelectedGapUs,
                durationUs,
                0.02
            )
            && ratioInRange(quality.selectedTimestampSpanCoverageRatio, minimumCoverage)
            && approximatelyEqual(
                quality.selectedTimestampSpanCoverageRatio,
                selectedCoverage,
                0.002
            )
            && Math.abs(sourceRateSpanUs - selectedSpanUs) <= sourceToleranceUs
            && quality.resampledStartTimeUs === range.startTimeUs
            && numberInRange(
                quality.resampledEndTimeUs,
                quality.resampledStartTimeUs,
                range.endTimeUs
            )
            && numberInRange(quality.resampledTimeSpanUs, 0, durationUs)
            && approximatelyEqual(
                quality.resampledTimeSpanUs,
                resampledSpanUs,
                0.01
            )
            && ratioInRange(quality.resampledRangeCoverageRatio, minimumCoverage)
            && approximatelyEqual(
                quality.resampledRangeCoverageRatio,
                resampledCoverage,
                0.002
            )
            && Math.abs(resampledRateSpanUs - resampledSpanUs) <= uniformToleranceUs;
    }

    function validMechanicalAxisTimeline(
        axis,
        quality,
        range,
        minimumCoverage,
        requireSampleCount
    ) {
        var durationUs = range.endTimeUs - range.startTimeUs;
        var finiteSpanUs = axis.lastFiniteSampleTimeUs - axis.firstFiniteSampleTimeUs;
        return numberInRange(
            axis.firstFiniteSampleTimeUs,
            quality.resampledStartTimeUs,
            quality.resampledEndTimeUs
        )
            && numberInRange(
                axis.lastFiniteSampleTimeUs,
                axis.firstFiniteSampleTimeUs,
                quality.resampledEndTimeUs
            )
            && numberInRange(axis.leadingFiniteGapUs, 0, durationUs)
            && numberInRange(axis.trailingFiniteGapUs, 0, durationUs)
            && approximatelyEqual(
                axis.leadingFiniteGapUs,
                axis.firstFiniteSampleTimeUs - range.startTimeUs,
                0.01
            )
            && approximatelyEqual(
                axis.trailingFiniteGapUs,
                range.endTimeUs - axis.lastFiniteSampleTimeUs,
                0.01
            )
            && ratioInRange(axis.finiteTimeSpanCoverageRatio, minimumCoverage)
            && approximatelyEqual(
                axis.finiteTimeSpanCoverageRatio,
                finiteSpanUs / durationUs,
                0.002
            )
            && (!requireSampleCount || approximatelyEqual(
                axis.finiteSampleCoverageRatio,
                axis.sampleCount / quality.resampledSampleCount,
                0.002
            ));
    }

    function validMechanicalHarmonicMatch(match, maximumFrequencyHz) {
        if (match === null) {
            return true;
        }
        if (!match || typeof match !== "object"
                || (match.rotor !== "main" && match.rotor !== "tail")) {
            return false;
        }
        var maximumOrder = match.rotor === "main" ? 8 : 6;
        return integerInRange(match.order, 1, maximumOrder)
            && numberInRange(match.predictedHz, 0, maximumFrequencyHz + 100)
            && numberInRange(match.deltaHz, 0, maximumFrequencyHz)
            && numberInRange(match.toleranceHz, 0.01, maximumFrequencyHz)
            && match.deltaHz <= match.toleranceHz;
    }

    function validMechanicalPeak(peak, axis, quality) {
        if (!peak || typeof peak !== "object") {
            return false;
        }
        var evaluatedWindows = peak.evaluatedWindowCount;
        var requiredWindows = Number.isInteger(evaluatedWindows)
            ? Math.max(3, Math.ceil(evaluatedWindows * 0.25))
            : Infinity;
        var expectedAttentionEligible = integerInRange(
            peak.attentionSupportingWindowCount,
            0,
            evaluatedWindows
        )
            && peak.attentionSupportingWindowCount >= requiredWindows
            && peak.attentionTemporalSpanRatio >= 0.5
            && peak.attentionOccupiedBucketCount >= 3
            && peak.attentionMaximumGapRatio <= 0.35;
        var expectedMaximumHz = Math.min(1000, quality.resampledRateHz * 0.45);

        return numberInRange(peak.frequencyHz, 5, expectedMaximumHz)
            && numberInRange(peak.psdDps2PerHz, 0, 10000000000)
            && numberInRange(peak.localNoisePsdDps2PerHz, 0, 10000000000)
            && numberInRange(peak.relativePowerDb, 8, 1000)
            && numberInRange(peak.prominenceDb, 8, 1000)
            && numberInRange(
                peak.bandwidthHz,
                Math.max(0.01, quality.frequencyResolutionHz - 0.01),
                quality.resampledRateHz / 2
            )
            && numberInRange(peak.bandPowerDps2, 0, 10000000000)
            && numberInRange(peak.bandRmsDps, 0, 100000)
            && integerInRange(peak.supportingWindowCount, 3, evaluatedWindows)
            && evaluatedWindows === axis.windowCount
            && ratioInRange(peak.persistenceRatio, 0.25)
            && approximatelyEqual(
                peak.persistenceRatio,
                peak.supportingWindowCount / evaluatedWindows,
                0.002
            )
            && integerInRange(peak.attentionSupportingWindowCount, 0, evaluatedWindows)
            && ratioInRange(peak.attentionPersistenceRatio, 0)
            && approximatelyEqual(
                peak.attentionPersistenceRatio,
                peak.attentionSupportingWindowCount / evaluatedWindows,
                0.002
            )
            && ratioInRange(peak.attentionTemporalSpanRatio, 0)
            && integerInRange(peak.attentionOccupiedBucketCount, 0, 4)
            && ratioInRange(peak.attentionMaximumGapRatio, 0)
            && typeof peak.attentionEligible === "boolean"
            && peak.attentionEligible === expectedAttentionEligible
            && validMechanicalHarmonicMatch(peak.harmonicMatch, expectedMaximumHz);
    }

    function validAcceptedMechanicalAxis(axis, quality, seenAxes, range) {
        var expectedAmplitudeKinds = {
            gyroRAW: "unfiltered-gyro-output",
            gyroUnfilt: "unfiltered-gyro-output",
            "gyroADC-filtered": "filtered-gyro-output"
        };
        if (!axis || typeof axis !== "object"
                || ["roll", "pitch", "yaw"].indexOf(axis.axis) < 0
                || seenAxes[axis.axis]
                || !Object.prototype.hasOwnProperty.call(expectedAmplitudeKinds, axis.source)
                || axis.amplitudeKind !== expectedAmplitudeKinds[axis.source]
                || axis.available !== true
                || !integerInRange(axis.sampleCount, quality.windowSize, quality.resampledSampleCount)
                || !numberInRange(axis.rmsDps, 0, 100000)
                || !numberInRange(axis.broadbandPowerDps2, 0, 10000000000)
                || !numberInRange(axis.broadbandRmsDps, 0, 100000)
                || !numberInRange(axis.medianNoisePsdDps2PerHz, 0, 10000000000)
                || !integerInRange(axis.windowCount, 3, 128)
                || !integerInRange(axis.candidateWindowCount, axis.windowCount, 4096)
                || !ratioInRange(axis.windowCoverageRatio, 0)
                || !approximatelyEqual(
                    axis.windowCoverageRatio,
                    axis.windowCount / axis.candidateWindowCount,
                    0.002
                )
                || !validMechanicalCoverage(axis, 0.75)
                || axis.validWindowCount !== axis.candidateWindowCount
                || axis.windowCount > axis.validWindowCount
                || axis.totalPossibleWindowCount !== expectedMechanicalWindowCount(
                    quality.resampledSampleCount,
                    quality.windowSize
                )
                || axis.windowCount !== Math.min(axis.validWindowCount, 128)
                || !validMechanicalAxisTimeline(axis, quality, range, 0.75, true)
                || !Array.isArray(axis.peaks)
                || axis.peaks.length > 5) {
            return false;
        }
        seenAxes[axis.axis] = true;
        return axis.peaks.every(function(peak) {
            return validMechanicalPeak(peak, axis, quality);
        });
    }

    function validAcceptedMechanicalResult(mechanicalResult) {
        var quality = mechanicalResult.quality;
        var range = mechanicalResult.range;
        var expectedTotalPossibleWindowCount = expectedMechanicalWindowCount(
            quality && quality.resampledSampleCount,
            quality && quality.windowSize
        );
        if (mechanicalResult.available !== true
                || typeof mechanicalResult.attention !== "boolean"
                || !quality || typeof quality !== "object"
                || quality.status !== "accepted"
                || !integerInRange(quality.sourceSampleCount, 256, 262144)
                || range.sampleCount !== quality.sourceSampleCount
                || !numberInRange(quality.measuredSampleRateHz, 50, 8000)
                || !numberInRange(quality.resampledRateHz, 50, 8000)
                || !integerInRange(quality.resampledSampleCount, 256, 262144)
                || [256, 512, 1024, 2048, 4096].indexOf(quality.windowSize) < 0
                || quality.overlapSamples !== quality.windowSize / 2
                || !integerInRange(quality.windowCount, 3, 128)
                || !validMechanicalCoverage(quality, 0.75)
                || !validMechanicalQualityTimeline(quality, range, 0.75)
                || quality.windowCount > quality.validWindowCount
                || expectedTotalPossibleWindowCount < 3
                || quality.totalPossibleWindowCount !== expectedTotalPossibleWindowCount
                || quality.minimumCoverageRatio !== 0.75
                || quality.maximumWelchWindowsPerAxis !== 128
                || quality.attentionBandRmsThresholdDps !== 8
                || !numberInRange(quality.frequencyResolutionHz, 0.01, 31.25)
                || !approximatelyEqual(
                    quality.frequencyResolutionHz,
                    quality.resampledRateHz / quality.windowSize,
                    0.002
                )
                || !numberInRange(
                    quality.maximumAnalyzedFrequencyHz,
                    5,
                    Math.min(1000, quality.resampledRateHz * 0.45) + 0.01
                )
                || !Array.isArray(mechanicalResult.axes)
                || mechanicalResult.axes.length < 1
                || mechanicalResult.axes.length > 3) {
            return false;
        }

        var seenAxes = Object.create(null);
        if (!mechanicalResult.axes.every(function(axis) {
            return validAcceptedMechanicalAxis(axis, quality, seenAxes, range);
        })) {
            return false;
        }
        var minimumWindowCount = Math.min.apply(null, mechanicalResult.axes.map(function(axis) {
            return axis.windowCount;
        }));
        var minimumTotalWindowCount = Math.min.apply(null, mechanicalResult.axes.map(function(axis) {
            return axis.totalPossibleWindowCount;
        }));
        var minimumValidWindowCount = Math.min.apply(null, mechanicalResult.axes.map(function(axis) {
            return axis.validWindowCount;
        }));
        var minimumValidCoverage = Math.min.apply(null, mechanicalResult.axes.map(function(axis) {
            return axis.validWindowCoverageRatio;
        }));
        var minimumSampleCoverage = Math.min.apply(null, mechanicalResult.axes.map(function(axis) {
            return axis.finiteSampleCoverageRatio;
        }));
        var minimumTimeCoverage = Math.min.apply(null, mechanicalResult.axes.map(function(axis) {
            return axis.finiteTimeSpanCoverageRatio;
        }));
        if (quality.windowCount !== minimumWindowCount
                || quality.totalPossibleWindowCount !== minimumTotalWindowCount
                || quality.validWindowCount !== minimumValidWindowCount
                || !approximatelyEqual(quality.validWindowCoverageRatio, minimumValidCoverage, 0.002)
                || !approximatelyEqual(quality.finiteSampleCoverageRatio, minimumSampleCoverage, 0.002)
                || !approximatelyEqual(quality.finiteTimeSpanCoverageRatio, minimumTimeCoverage, 0.002)) {
            return false;
        }

        var hasAttentionPeak = mechanicalResult.axes.some(function(axis) {
            return axis.peaks.some(function(peak) { return peak.attentionEligible === true; });
        });
        var clearSourcesVerified = mechanicalResult.status !== "clear"
            || mechanicalResult.axes.length === 3
                && mechanicalResult.axes.every(function(axis) {
                    return axis.source === "gyroRAW" || axis.source === "gyroUnfilt";
                });
        return clearSourcesVerified
            && mechanicalResult.attention === (mechanicalResult.status === "attention")
            && hasAttentionPeak === (mechanicalResult.status === "attention");
    }

    function validInsufficientMechanicalResult(mechanicalResult) {
        var quality = mechanicalResult.quality;
        var range = mechanicalResult.range;
        var expectedTotalPossibleWindowCount = expectedMechanicalWindowCount(
            quality && quality.resampledSampleCount,
            quality && quality.windowSize
        );
        if (mechanicalResult.available !== false
                || mechanicalResult.attention !== false
                || !quality || typeof quality !== "object"
                || quality.status !== "insufficient"
                || quality.minimumCoverageRatio !== 0.75
                || quality.attentionBandRmsThresholdDps !== 8
                || !integerInRange(quality.sourceSampleCount, 256, 262144)
                || range.sampleCount !== quality.sourceSampleCount
                || !numberInRange(quality.measuredSampleRateHz, 50, 8000)
                || !numberInRange(quality.resampledRateHz, 50, 8000)
                || !integerInRange(quality.resampledSampleCount, 256, 262144)
                || [256, 512, 1024, 2048, 4096].indexOf(quality.windowSize) < 0
                || quality.overlapSamples !== quality.windowSize / 2
                || !integerInRange(quality.windowCount, 0, 128)
                || expectedTotalPossibleWindowCount < 1
                || quality.totalPossibleWindowCount !== expectedTotalPossibleWindowCount
                || !integerInRange(
                    quality.validWindowCount,
                    0,
                    quality.totalPossibleWindowCount
                )
                || quality.windowCount > quality.validWindowCount
                || !ratioInRange(quality.validWindowCoverageRatio, 0)
                || !approximatelyEqual(
                    quality.validWindowCoverageRatio,
                    quality.validWindowCount / quality.totalPossibleWindowCount,
                    0.002
                )
                || !ratioInRange(quality.finiteSampleCoverageRatio, 0)
                || !ratioInRange(quality.finiteTimeSpanCoverageRatio, 0)
                || !numberInRange(quality.frequencyResolutionHz, 0.01, 31.25)
                || !approximatelyEqual(
                    quality.frequencyResolutionHz,
                    quality.resampledRateHz / quality.windowSize,
                    0.002
                )
                || !validMechanicalQualityTimeline(quality, range, 0)
                || !validMechanicalReasonCodes(mechanicalResult.reasonCodes, true)
                || !Array.isArray(mechanicalResult.axes)
                || mechanicalResult.axes.length > 3) {
            return false;
        }
        var seenAxes = Object.create(null);
        return mechanicalResult.axes.every(function(axis) {
            if (!axis || typeof axis !== "object"
                    || ["roll", "pitch", "yaw"].indexOf(axis.axis) < 0
                    || seenAxes[axis.axis]
                    || ["gyroRAW", "gyroUnfilt", "gyroADC-filtered"].indexOf(axis.source) < 0
                    || axis.available !== false
                    || !Array.isArray(axis.peaks)
                    || axis.peaks.length !== 0
                    || !integerInRange(axis.totalPossibleWindowCount, 0, 4096)
                    || !integerInRange(axis.validWindowCount, 0, axis.totalPossibleWindowCount)
                    || !ratioInRange(axis.validWindowCoverageRatio, 0)
                    || !ratioInRange(axis.finiteSampleCoverageRatio, 0)
                    || !ratioInRange(axis.finiteTimeSpanCoverageRatio, 0)
                    || !integerInRange(axis.windowCount, 0, 128)
                    || !integerInRange(axis.candidateWindowCount, axis.windowCount, 4096)
                    || !ratioInRange(axis.windowCoverageRatio, 0)
                    || (axis.candidateWindowCount > 0 && !approximatelyEqual(
                        axis.windowCoverageRatio,
                        axis.windowCount / axis.candidateWindowCount,
                        0.002
                    ))
                    || axis.totalPossibleWindowCount !== expectedTotalPossibleWindowCount
                    || axis.validWindowCount !== axis.candidateWindowCount
                    || axis.windowCount !== Math.min(axis.validWindowCount, 128)
                    || !validMechanicalAxisTimeline(axis, quality, range, 0, false)) {
                return false;
            }
            seenAxes[axis.axis] = true;
            return true;
        });
    }

    function validateMechanicalResult(mechanicalResult, submittedRange) {
        if (!mechanicalResult || typeof mechanicalResult !== "object") {
            return { state: "unavailable" };
        }

        if (!rangesEqual(mechanicalResult.range, submittedRange)) {
            return { state: "range-mismatch" };
        }

        var findings = mechanicalResult.findings;
        if (!Array.isArray(findings)) {
            return { state: "unavailable" };
        }
        for (var findingIndex = 0; findingIndex < findings.length; findingIndex++) {
            var finding = findings[findingIndex];
            var findingRange = finding && normalizeTimeRange(finding.timeRangeUs);
            if (!findingRange) {
                return { state: "unavailable" };
            }
            if (!rangesEqual(findingRange, submittedRange)) {
                return { state: "range-mismatch" };
            }
        }

        var capabilities = mechanicalResult.capabilities;
        var safeCapabilities = Boolean(
            capabilities
            && capabilities.offline === true
            && capabilities.selectedRangeRequired === true
            && capabilities.selectedRangeOnly === true
            && capabilities.rawLogIncluded === false
            && capabilities.componentDiagnosis === false
            && capabilities.tuningRecommendations === false
            && capabilities.settingDirectionAdvice === false
            && capabilities.directSettingWrites === false
        );
        var safeStatus = ["clear", "attention", "insufficient"]
            .indexOf(mechanicalResult.status) >= 0;
        var range = mechanicalResult.range;
        var safeRangeMetadata = range.durationUs
                === range.endTimeUs - range.startTimeUs
            && range.durationUs > 0
            && range.durationUs <= 120000000
            && (range.sampleCount === null
                || integerInRange(range.sampleCount, 0, 262144));
        if (mechanicalResult.schemaVersion !== 1
                || typeof mechanicalResult.engineVersion !== "string"
                || !mechanicalResult.engineVersion.trim()
                || mechanicalResult.engineVersion.length > 64
                || mechanicalResult.analysisMode !== "deterministic-local"
                || !safeCapabilities
                || !safeStatus
                || !safeRangeMetadata
                || !validMechanicalReasonCodes(
                    mechanicalResult.reasonCodes,
                    mechanicalResult.status === "insufficient"
                )) {
            return { state: "unavailable" };
        }

        var validStatusContract = mechanicalResult.status === "insufficient"
            ? validInsufficientMechanicalResult(mechanicalResult)
            : validAcceptedMechanicalResult(mechanicalResult);
        if (!validStatusContract) {
            return { state: "unavailable" };
        }

        return {
            state: "valid",
            result: mechanicalResult
        };
    }

    function mechanicalNeedsInspection(mechanicalState) {
        return Boolean(
            mechanicalState
            && mechanicalState.state === "valid"
            && mechanicalState.result
            && mechanicalState.result.status === "attention"
        );
    }

    function mechanicalAllowsGovernor(mechanicalState) {
        return Boolean(
            mechanicalState
            && mechanicalState.state === "valid"
            && mechanicalState.result
            && mechanicalState.result.status === "clear"
        );
    }

    function mechanicalEvidenceIsLimited(mechanicalState) {
        return !mechanicalState
            || mechanicalState.state !== "valid"
            || !mechanicalState.result
            || mechanicalState.result.status === "insufficient";
    }

    function applyMechanicalRecommendationBoundary(validation, mechanicalState) {
        if (validation && validation.state === "valid"
                && !mechanicalAllowsGovernor(mechanicalState)) {
            return {
                state: "mechanical-withhold",
                mechanicalStatus: mechanicalState
                    && mechanicalState.result && mechanicalState.result.status
            };
        }
        return validation;
    }

    function mechanicalStat(label, value) {
        var item = element("dl", "tune-advisor-mechanical-stat");
        append(item, element("dt", null, label));
        append(item, element("dd", null, value));
        return item;
    }

    function formatPower(value) {
        if (!isFiniteNumber(value)) {
            return "—";
        }
        var magnitude = Math.abs(value);
        if (magnitude > 0 && magnitude < 0.01) {
            return value.toExponential(2);
        }
        return formatNumber(value, 3);
    }

    function safeAxisLabel(axis) {
        var normalized = String(axis || "").trim().toLowerCase();
        if (normalized === "roll" || normalized === "x") {
            return "Roll";
        }
        if (normalized === "pitch" || normalized === "y") {
            return "Pitch";
        }
        if (normalized === "yaw" || normalized === "z") {
            return "Yaw";
        }
        return "Gyro axis";
    }

    function safeGyroSource(source) {
        var normalized = String(source || "").trim().toLowerCase();
        if (normalized === "gyroadc-filtered") {
            return "Filtered gyro fallback";
        }
        if (normalized === "gyroadc"
                || normalized.indexOf("raw") >= 0
                || normalized.indexOf("unfiltered") >= 0) {
            return "Raw gyro";
        }
        return "Gyro evidence";
    }

    function harmonicReference(match) {
        if (!match || typeof match !== "object") {
            return "";
        }

        var referenceName = String(
            match.reference || match.source || match.rotor || match.kind || ""
        ).toLowerCase();
        var label = referenceName.indexOf("tail") >= 0
            ? "tail-rotor"
            : referenceName.indexOf("main") >= 0 || referenceName.indexOf("head") >= 0
                ? "main-rotor"
                : "logged RPM";
        var harmonic = match.harmonic;
        if (!isFiniteNumber(harmonic)) {
            harmonic = match.order;
        }
        var order = isFiniteNumber(harmonic) && harmonic > 0
            ? " " + formatNumber(harmonic, 1) + "×"
            : "";
        return "Near the " + label + order
            + " reference (correlation only; not a source diagnosis).";
    }

    function renderSpectrumPeak(peak) {
        var item = element("li", "tune-advisor-spectrum-peak");
        append(item, element(
            "strong",
            "tune-advisor-spectrum-frequency",
            isFiniteNumber(peak && peak.frequencyHz)
                ? formatNumber(peak.frequencyHz, 1) + " Hz"
                : "Frequency unavailable"
        ));

        var details = [];
        if (isFiniteNumber(peak && peak.bandRmsDps)) {
            details.push(formatNumber(peak.bandRmsDps, 2) + " °/s band RMS");
        }
        if (isFiniteNumber(peak && peak.prominenceDb)) {
            details.push(formatNumber(peak.prominenceDb, 1) + " dB prominence");
        }
        if (isFiniteNumber(peak && peak.relativePowerDb)) {
            details.push(formatNumber(peak.relativePowerDb, 1) + " dB relative power");
        }
        if (isFiniteNumber(peak && peak.bandwidthHz)) {
            details.push(formatNumber(peak.bandwidthHz, 1) + " Hz bandwidth");
        }
        if (isFiniteNumber(peak && peak.psdDps2PerHz)) {
            details.push(formatPower(peak.psdDps2PerHz) + " (°/s)²/Hz PSD");
        }
        append(item, element(
            "span",
            "tune-advisor-spectrum-detail",
            details.length ? details.join(" · ") : "Qualified spectral peak"
        ));

        var reference = harmonicReference(peak && peak.harmonicMatch);
        if (reference) {
            append(item, element("span", "tune-advisor-spectrum-reference", reference));
        }
        return item;
    }

    function renderSpectrumAxis(axis) {
        var card = element("article", "tune-advisor-spectrum-axis");
        append(card, element("h6", null, safeAxisLabel(axis && axis.axis)));

        var details = [safeGyroSource(axis && axis.source)];
        if (isFiniteNumber(axis && axis.rmsDps)) {
            details.push("RMS " + formatNumber(axis.rmsDps, 1) + " °/s");
        }
        if (isFiniteNumber(axis && axis.medianNoisePsdDps2PerHz)) {
            details.push("median noise " + formatPower(axis.medianNoisePsdDps2PerHz) + " (°/s)²/Hz");
        }
        append(card, element(
            "p",
            "tune-advisor-spectrum-axis-summary",
            details.join(" · ")
        ));

        var peaks = Array.isArray(axis && axis.peaks)
            ? axis.peaks.filter(function(peak) {
                return peak && isFiniteNumber(peak.frequencyHz) && peak.frequencyHz >= 0;
            }).slice(0, 5)
            : [];
        if (!peaks.length) {
            append(card, element(
                "p",
                "tune-advisor-spectrum-axis-summary",
                "No qualified dominant peaks on this axis."
            ));
            return card;
        }

        var list = append(card, element("ul", "tune-advisor-spectrum-peaks"));
        peaks.forEach(function(peak) {
            append(list, renderSpectrumPeak(peak));
        });
        return card;
    }

    function mechanicalActions(status) {
        if (status === "attention") {
            return [
                "Land and inspect blades, tracking, balance, shafts, bearings, drivetrain, fasteners, airframe, wiring, and gyro mounting before tuning.",
                "Correct any mechanical or mounting issue first; do not chase this spectrum with PID or Governor changes.",
                "After inspection, repeat the same operating condition in a new In/Out selection and compare the peak frequency and strength."
            ];
        }
        if (status === "clear") {
            return [
                "Continue normal preflight and mechanical inspections; a clear selected range is not proof that every component is healthy.",
                "If an unexplained vibration remains, capture another clean range at the same operating condition and compare before changing tuning."
            ];
        }
        return [
            "Choose a longer, clean, steady-speed In/Out range with gyro data, then analyze again.",
            "Do not infer a mechanical fault or change PID/Governor settings from insufficient spectrum evidence."
        ];
    }

    function renderMechanicalUnavailable() {
        clearMechanicalPresentation();
        mechanicalStatus
            .addClass("status-insufficient")
            .text("Analysis unavailable");
        append(mechanicalContainer[0], element(
            "p",
            "tune-advisor-mechanical-summary",
            "Mechanical analysis is unavailable for this selected range. Governor and control measurements remain separate; no mechanical conclusion or tuning advice is shown."
        ));
        mechanicalSection.removeAttr("hidden");
    }

    function renderMechanicalResult(mechanicalState) {
        if (!mechanicalState || mechanicalState.state !== "valid") {
            renderMechanicalUnavailable();
            return;
        }

        clearMechanicalPresentation();
        var mechanicalResult = mechanicalState.result;
        var status = mechanicalResult.status;
        var belowAttentionGate = Array.isArray(mechanicalResult.reasonCodes)
            && mechanicalResult.reasonCodes.indexOf(
                "PERSISTENT_NARROWBAND_ENERGY_BELOW_ATTENTION_THRESHOLD"
            ) >= 0;
        var statusLabel = status === "attention"
            ? "Inspect mechanics"
            : status === "clear"
                ? (belowAttentionGate ? "Below attention gate" : "No dominant peak")
                : "Insufficient evidence";
        mechanicalStatus.addClass("status-" + status).text(statusLabel);

        var axes = mechanicalResult.axes;
        var peakCount = axes.reduce(function(total, axis) {
            return total + (Array.isArray(axis && axis.peaks) ? axis.peaks.length : 0);
        }, 0);
        var summary = status === "attention"
            ? "The exact selected range contains " + peakCount
                + " qualified spectral " + (peakCount === 1 ? "peak" : "peaks")
                + " across " + axes.length + " gyro " + (axes.length === 1 ? "axis" : "axes")
                + ". Treat these as clues for a mechanics-first inspection."
            : status === "clear"
                ? (belowAttentionGate
                    ? "Persistent frequency evidence was measured, but it remained below RotorLens's experimental attention-amplitude gate. Use it as a comparison baseline; this is not a mechanical-health certification."
                    : "No qualified dominant vibration peak was flagged in the exact selected range. This is not a mechanical-health certification.")
                : "The exact selected range did not contain enough suitable gyro evidence for a reliable spectrum, so no mechanical conclusion was produced.";
        append(mechanicalContainer[0], element("p", "tune-advisor-mechanical-summary", summary));

        var quality = mechanicalResult.quality;
        var stats = append(mechanicalContainer[0], element("div", "tune-advisor-mechanical-quality"));
        append(stats, mechanicalStat(
            "Resampled rate",
            isFiniteNumber(quality.resampledRateHz)
                ? formatNumber(quality.resampledRateHz, 1) + " Hz"
                : "—"
        ));
        append(stats, mechanicalStat(
            "FFT windows",
            isFiniteNumber(quality.windowCount) ? formatNumber(quality.windowCount, 0) : "—"
        ));
        append(stats, mechanicalStat(
            "Resolution",
            isFiniteNumber(quality.frequencyResolutionHz)
                ? formatNumber(quality.frequencyResolutionHz, 2) + " Hz"
                : "—"
        ));
        append(stats, mechanicalStat(
            "Experimental attention gate",
            isFiniteNumber(quality.attentionBandRmsThresholdDps)
                ? formatNumber(quality.attentionBandRmsThresholdDps, 1) + " °/s band RMS"
                : "—"
        ));

        if (axes.length) {
            var spectrumGrid = append(mechanicalContainer[0], element("div", "tune-advisor-spectrum-grid"));
            axes.slice(0, 3).forEach(function(axis) {
                append(spectrumGrid, renderSpectrumAxis(axis));
            });
        }

        var actionBox = append(mechanicalContainer[0], element("div", "tune-advisor-mechanical-actions"));
        append(actionBox, element("strong", null, "Mechanics-first next steps"));
        var actionList = append(actionBox, element("ol"));
        mechanicalActions(status).forEach(function(action) {
            append(actionList, element("li", null, action));
        });
        mechanicalSection.removeAttr("hidden");
    }

    function normalizeTimeRange(value) {
        var start;
        var end;

        if (Array.isArray(value) && value.length >= 2) {
            start = value[0];
            end = value[1];
        } else if (value && typeof value === "object") {
            start = value.startTimeUs;
            if (!isFiniteNumber(start)) {
                start = value.startUs;
            }
            if (!isFiniteNumber(start)) {
                start = value.start;
            }

            end = value.endTimeUs;
            if (!isFiniteNumber(end)) {
                end = value.endUs;
            }
            if (!isFiniteNumber(end)) {
                end = value.end;
            }
        }

        if (!isFiniteNumber(start) || !isFiniteNumber(end)) {
            return null;
        }

        if (end < start) {
            var swap = start;
            start = end;
            end = swap;
        }

        return { startTimeUs: start, endTimeUs: end };
    }

    function evidenceDescription(evidence) {
        var description = humanizeMetric(evidence.metric);
        if (evidence.scope) {
            description += " (" + evidence.scope + ")";
        }
        if (evidence.value !== undefined && evidence.value !== null) {
            description += ": " + (isFiniteNumber(evidence.value) ? formatNumber(evidence.value, 2) : String(evidence.value));
            if (evidence.unit) {
                description += " " + evidence.unit;
            }
        }
        return description;
    }

    function governorRecommendationGate(evidencePackage) {
        var governor = evidencePackage && evidencePackage.governor;
        var gate = governor && governor.recommendationGate;
        return gate && typeof gate === "object" ? gate : null;
    }

    function withheldReasonMessage(code) {
        var normalized = typeof code === "string" ? code.trim() : "";
        if (hasCuratedWithheldReason(normalized)) {
            return WITHHELD_REASON_MESSAGES[normalized];
        }

        var words = normalized
            .replace(/[^A-Za-z0-9]+/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 16);
        if (!words.length) {
            return "An unrecognized Governor F safety prerequisite was not satisfied.";
        }
        return words.map(function(word) {
            var lower = word.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        }).join(" ") + ".";
    }

    function hasCuratedWithheldReason(code) {
        return typeof code === "string"
            && Object.prototype.hasOwnProperty.call(WITHHELD_REASON_MESSAGES, code);
    }

    function renderWithheldReasons(gate) {
        withheldReasonsContainer.empty();
        withheldSection.attr("hidden", true);
        if (!gate || gate.status !== "withheld") {
            return;
        }

        var seen = Object.create(null);
        var reasonCodes = (Array.isArray(gate.reasonCodes) ? gate.reasonCodes : [])
            .filter(function(code) {
                if (typeof code !== "string") {
                    return false;
                }
                var normalized = code.trim();
                if (!normalized || seen[normalized]) {
                    return false;
                }
                seen[normalized] = true;
                return true;
            });
        if (!reasonCodes.length) {
            reasonCodes = [""];
        }

        append(withheldReasonsContainer[0], element(
            "p",
            null,
            "Directional advice stays unavailable until every measured and user-confirmed prerequisite below passes. No setting was written."
        ));
        var list = append(withheldReasonsContainer[0], element("ul", "tune-advisor-withheld-list"));
        var displayedMessages = Object.create(null);
        reasonCodes.forEach(function(code) {
            var message = withheldReasonMessage(code);
            if (displayedMessages[message]) {
                return;
            }
            displayedMessages[message] = true;
            append(list, element("li", null, message));
        });
        withheldSection.removeAttr("hidden");
    }

    function applyConfirmationGate(evidencePackage) {
        var gate = governorRecommendationGate(evidencePackage);
        var rawContextKey = gate && typeof gate.configurationKey === "string"
            ? gate.configurationKey
            : gate && typeof gate.confirmationContextKey === "string"
                ? gate.confirmationContextKey
                : "";
        var nextContextKey = rawContextKey.trim();
        var previousContextKey = confirmationContextKey || "";
        var bindingChanged = previousContextKey !== nextContextKey;
        var pristineFirstBinding = Boolean(
            !previousContextKey
            && nextContextKey
            && !confirmationHasBoundKey
            && confirmationCount() === 0
        );
        var bindingReset = bindingChanged && !pristineFirstBinding;

        if (bindingReset) {
            confirmationValues = emptyConfirmationValues();
            confirmationSessionId = createConfirmationSessionId();
            confirmationNotice = nextContextKey
                ? "The analyzed configuration was rebound or changed. Flight readiness was cleared; confirm it again before another controlled test."
                : "The analyzed configuration key was lost. Flight readiness was cleared; analyze again before confirming it.";
        } else {
            confirmationNotice = "";
        }

        confirmationContextKey = nextContextKey || null;
        if (nextContextKey) {
            confirmationHasBoundKey = true;
        }
        confirmationBusy = false;
        updateConfirmationUi();
        return {
            gate: gate,
            bindingReset: bindingReset
        };
    }

    function applyRecommendationNotice(gateState, validation) {
        var state = gateState || {};
        var gate = state.gate;
        if (state.bindingReset) {
            return;
        }

        if (validation && validation.state === "mechanical-withhold") {
            confirmationNotice = validation.mechanicalStatus === "attention"
                ? "Mechanical spectrum evidence requires inspection first. Governor F advice is hidden until the mechanics are checked and a new clean In/Out range is analyzed."
                : "Governor F advice is hidden because this exact range did not produce a rigorously verified clear mechanical result.";
        } else if (validation && validation.state === "valid") {
            confirmationNotice = "The flight-readiness acknowledgment is separate from measured log evidence. Both gates passed for the single experimental next-test proposal below; no setting was written.";
        } else if (gate && gate.status === "withheld"
                && allConfirmationsChecked()
                && governorMaxThrottleValue() !== null) {
            confirmationNotice = "Flight readiness is confirmed, but measured evidence withheld a Governor F proposal. Review the reasons below.";
        } else if (gate && gate.status === "eligible") {
            confirmationNotice = "The returned Governor F proposal did not pass the app's complete safety-contract validation. No proposal is available and no setting was written.";
        }
        updateConfirmationUi();
    }

    function recommendationReasonCodes(recommendation) {
        if (Array.isArray(recommendation.reasonCodes)) {
            return recommendation.reasonCodes.filter(function(code) {
                return typeof code === "string";
            });
        }
        return typeof recommendation.reasonCode === "string"
            ? [recommendation.reasonCode]
            : [];
    }

    function verifiedRotorflightBuild(log) {
        var firmwareBuild = log && log.firmwareBuild;
        return Boolean(
            log
            && String(log.firmwareType || "").trim().toLowerCase() === "rotorflight"
            && String(log.firmwareVersion || "").trim() === "4.6.0"
            && firmwareBuild
            && typeof firmwareBuild === "object"
            && firmwareBuild.verified === true
            && firmwareBuild.shortRevision === "118e912"
            && typeof firmwareBuild.raw === "string"
            && /^Rotorflight 4\.6\.0 \(118e912\) [A-Za-z0-9_.-]+$/i.test(firmwareBuild.raw)
        );
    }

    function recommendationMetadataMatches(recommendation) {
        var sourceIds = recommendation && recommendation.sourceIds;
        var provenance = recommendation && recommendation.provenance;
        return Boolean(
            recommendation
            && recommendation.experimental === true
            && Array.isArray(sourceIds)
            && sourceIds.length === 1
            && sourceIds[0] === "rotorflight-governor-tuning"
            && provenance
            && typeof provenance === "object"
            && provenance.analysisMode === "deterministic-local"
            && provenance.ruleset === "rotorlens-governor-f-next-test-v1"
            && provenance.firmwareShortRevision === "118e912"
            && provenance.selectedRangeOnly === true
        );
    }

    function exactCanonicalConfirmationIds(ids) {
        if (!Array.isArray(ids) || ids.length !== CONFIRMATION_DEFINITIONS.length) {
            return false;
        }
        var seen = Object.create(null);
        return ids.every(function(id) {
            if (!hasConfirmationKey(id) || seen[id]) {
                return false;
            }
            seen[id] = true;
            return true;
        });
    }

    function validateRecommendation(evidencePackage, evidenceById, submittedRange) {
        var governor = evidencePackage && evidencePackage.governor;
        var recommendation = governor && governor.recommendation;
        if (recommendation === undefined || recommendation === null) {
            return { state: "none" };
        }
        if (!recommendation || typeof recommendation !== "object") {
            return { state: "invalid" };
        }

        var gate = governorRecommendationGate(evidencePackage);
        var reasonCodes = recommendationReasonCodes(recommendation);
        var knownReasonCodes = reasonCodes.filter(function(code) {
            return Object.prototype.hasOwnProperty.call(RECOMMENDATION_REASONS, code);
        });
        var evidenceIds = Array.isArray(recommendation.evidenceIds)
            ? recommendation.evidenceIds.filter(function(id) { return typeof id === "string"; })
            : [];
        var citedEvidence = evidenceIds.map(function(id) {
            return evidenceById[id];
        }).filter(Boolean);
        var evidenceRangesBound = citedEvidence.length === evidenceIds.length
            && citedEvidence.every(function(evidence) {
                return evidenceRangeWithinSelection(evidence, submittedRange);
            });
        var prerequisiteIds = Array.isArray(recommendation.prerequisiteIds)
            ? recommendation.prerequisiteIds
            : [];
        var hasEveryPrerequisite = CONFIRMATION_DEFINITIONS.every(function(definition) {
            return prerequisiteIds.indexOf(definition.key) >= 0;
        });
        var expectedDirection = recommendation.delta === 10 ? "increase" : "decrease";
        var expectedReason = recommendation.delta === 10
            ? "CONSISTENT_DROOP"
            : "CONSISTENT_OVERSHOOT";
        var valuesMatch = isFiniteNumber(recommendation.currentValue)
            && isFiniteNumber(recommendation.proposedValue)
            && isFiniteNumber(recommendation.rollbackValue)
            && isFiniteNumber(recommendation.delta)
            && (recommendation.delta === 10 || recommendation.delta === -10)
            && recommendation.currentValue >= 0
            && recommendation.currentValue <= 250
            && recommendation.proposedValue >= 0
            && recommendation.proposedValue <= 250
            && recommendation.rollbackValue >= 0
            && recommendation.rollbackValue <= 250
            && Math.abs((recommendation.proposedValue - recommendation.currentValue) - recommendation.delta) < 0.001
            && Math.abs(recommendation.rollbackValue - recommendation.currentValue) < 0.001;
        var returnedContextKey = gate && typeof (gate.configurationKey || gate.confirmationContextKey) === "string"
            ? String(gate.configurationKey || gate.confirmationContextKey).trim()
            : "";
        var contextMatches = Boolean(
            gate
            && gate.status === "eligible"
            && gate.firmwareBuildVerified === true
            && Array.isArray(gate.reasonCodes)
            && gate.reasonCodes.length === 0
            && exactCanonicalConfirmationIds(gate.requiredConfirmationIds)
            && exactCanonicalConfirmationIds(gate.confirmedConfirmationIds)
            && confirmationContextKey
            && returnedContextKey === confirmationContextKey
        );
        var log = evidencePackage && evidencePackage.log;
        var eligibleFirmware = verifiedRotorflightBuild(log);
        var packageRangeBound = rangesEqual(evidencePackage && evidencePackage.range, submittedRange);
        var currentSettings = governor && governor.currentSettings;
        var currentSettingsMatch = Boolean(
            currentSettings
            && typeof currentSettings === "object"
            && currentSettings.pGain === 10
            && currentSettings.iGain === 20
            && currentSettings.dGain === 0
            && currentSettings.ttaGain === 0
            && currentSettings.fGain === recommendation.currentValue
            && currentSettings.maxThrottlePct === governorMaxThrottleValue()
        );
        var safeContract = packageRangeBound
            && recommendation.kind === "next-controlled-test"
            && recommendation.setting === "gov_f_gain"
            && recommendationMetadataMatches(recommendation)
            && recommendation.direction === expectedDirection
            && reasonCodes.length === 1
            && knownReasonCodes.length === 1
            && knownReasonCodes[0] === expectedReason
            && evidenceIds.length > 0
            && citedEvidence.length === evidenceIds.length
            && evidenceRangesBound
            && hasEveryPrerequisite
            && allConfirmationsChecked()
            && governorMaxThrottleValue() !== null
            && recommendation.directWriteAllowed === false
            && recommendation.validationRequired === true
            && recommendation.finalTuneClaim === false
            && contextMatches
            && eligibleFirmware
            && currentSettingsMatch
            && valuesMatch;

        if (!safeContract) {
            return { state: "invalid" };
        }
        return {
            state: "valid",
            recommendation: recommendation,
            reason: RECOMMENDATION_REASONS[knownReasonCodes[0]],
            evidence: citedEvidence
        };
    }

    function recommendationValue(label, value) {
        var item = element("dl", "tune-advisor-recommendation-value");
        append(item, element("dt", null, label));
        append(item, element("dd", null, value));
        return item;
    }

    function renderRecommendation(evidencePackage, evidenceById, submittedRange, priorValidation) {
        recommendationContainer.empty();
        recommendationSection.attr("hidden", true);

        var validation = priorValidation
            || validateRecommendation(evidencePackage, evidenceById, submittedRange);
        if (validation.state === "none" || validation.state === "mechanical-withhold") {
            return validation;
        }

        recommendationSection.removeAttr("hidden");
        if (validation.state !== "valid") {
            append(recommendationContainer[0], element(
                "p",
                "tune-advisor-recommendation-error",
                "A Governor F proposal was returned, but it failed the app's safety-contract validation. No proposal is shown and no setting was written."
            ));
            return validation;
        }

        var recommendation = validation.recommendation;
        var card = append(recommendationContainer[0], element("article", "tune-advisor-recommendation-card"));
        append(card, element(
            "p",
            "tune-advisor-recommendation-warning",
            "No setting has been written. Experimental: this Rotorflight 4.6.0 build 118e912 path is not yet validated against a licensed real 4.6 log fixture and is not production-proven. This is one manually reviewed next-test step, not a final tune."
        ));

        var values = append(card, element("div", "tune-advisor-recommendation-values"));
        append(values, recommendationValue("Current Governor F", formatNumber(recommendation.currentValue, 1)));
        append(values, recommendationValue(
            "Proposed test",
            formatNumber(recommendation.proposedValue, 1)
                + " (" + (recommendation.delta > 0 ? "+" : "")
                + formatNumber(recommendation.delta, 0) + ")"
        ));
        append(values, recommendationValue("Rollback value", formatNumber(recommendation.rollbackValue, 1)));

        var reason = append(card, element("p", "tune-advisor-recommendation-reason"));
        append(reason, element("strong", null, "Why this test: "));
        reason.appendChild(document.createTextNode(validation.reason));

        var evidenceList = append(card, element("ul", "tune-advisor-evidence-list"));
        validation.evidence.forEach(function(evidence) {
            append(evidenceList, element("li", null, evidenceDescription(evidence)));
        });

        var validationText = append(card, element("p", "tune-advisor-recommendation-validation"));
        append(validationText, element("strong", null, "Required validation: "));
        validationText.appendChild(document.createTextNode(
            "Change only Governor F manually, repeat the same controlled maneuver in a new selected In/Out range, and compare. Land and restore the rollback value if response worsens or safety becomes uncertain."
        ));
        return validation;
    }

    function safeGuidanceSource(finding, sourceById) {
        var source = finding && finding.source;
        if (!source && finding && Array.isArray(finding.sources)) {
            source = finding.sources[0];
        }
        if (typeof source === "string") {
            source = sourceById[source];
        }
        if (!source && finding && Array.isArray(finding.sourceIds)) {
            source = sourceById[finding.sourceIds[0]];
        }
        if (!source || typeof source !== "object" || typeof source.url !== "string") {
            return null;
        }

        try {
            var parsed = new URL(source.url, window.location.href);
            if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
                return null;
            }
            return {
                label: "Official guidance",
                title: source.label || source.title || "Official guidance",
                url: parsed.href
            };
        } catch (error) {
            return null;
        }
    }

    function findingFocusRange(finding, evidenceById) {
        var directRange = normalizeTimeRange(finding.timeRangeUs);
        if (directRange) {
            return directRange;
        }

        var ids = Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [];
        for (var i = 0; i < ids.length; i++) {
            var evidence = evidenceById[ids[i]];
            var range = evidence && normalizeTimeRange(evidence.timeRangeUs);
            if (range) {
                return range;
            }
        }
        return null;
    }

    function focusEvidence(range, finding) {
        if (!range || typeof currentContext.focusTime !== "function") {
            return;
        }

        var midpoint = range.startTimeUs + ((range.endTimeUs - range.startTimeUs) / 2);
        modal.modal("hide");
        window.setTimeout(function() {
            currentContext.focusTime(midpoint, {
                startTimeUs: range.startTimeUs,
                endTimeUs: range.endTimeUs,
                findingId: finding.id
            });
        }, 0);
    }

    function renderFinding(finding, evidenceById, sourceById) {
        var severity = ["info", "caution", "stop"].indexOf(finding.severity) >= 0
            ? finding.severity
            : "info";
        var card = element("article", "panel tune-advisor-finding severity-" + severity);
        var body = append(card, element("div", "panel-body"));
        var header = append(body, element("div", "tune-advisor-finding-header"));
        append(header, element("h6", null, finding.title || "Advisor finding"));
        append(header, element("span", "label tune-advisor-severity severity-" + severity, severity));

        if (finding.summary) {
            append(body, element("p", "tune-advisor-summary", finding.summary));
        }
        if (finding.action) {
            var action = append(body, element("p", "tune-advisor-action"));
            append(action, element("strong", null, "Next check: "));
            action.appendChild(document.createTextNode(String(finding.action)));
        }

        var citedEvidence = (Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [])
            .map(function(id) { return evidenceById[id]; })
            .filter(Boolean);
        if (citedEvidence.length) {
            var evidenceList = append(body, element("ul", "tune-advisor-evidence-list"));
            citedEvidence.forEach(function(evidence) {
                append(evidenceList, element("li", null, evidenceDescription(evidence)));
            });
        }

        var guidanceSource = safeGuidanceSource(finding, sourceById);
        if (guidanceSource) {
            var guidanceLink = append(body, element("a", "tune-advisor-guidance", guidanceSource.label));
            guidanceLink.href = guidanceSource.url;
            guidanceLink.target = "_blank";
            guidanceLink.rel = "noopener noreferrer";
            guidanceLink.title = "Open " + guidanceSource.title;
        }

        var range = findingFocusRange(finding, evidenceById);
        if (range && typeof currentContext.focusTime === "function") {
            var focusButton = append(body, element("button", "btn btn-default btn-sm tune-advisor-focus"));
            var rangeMidpointUs = range.startTimeUs + ((range.endTimeUs - range.startTimeUs) / 2);
            var logStartUs = currentPackage && currentPackage.log && isFiniteNumber(currentPackage.log.startTimeUs)
                ? currentPackage.log.startTimeUs
                : 0;
            var focusSeconds = Math.max(0, rangeMidpointUs - logStartUs) / 1000000;
            focusButton.type = "button";
            focusButton.textContent = "View evidence near " + formatNumber(focusSeconds, 1) + " s";
            focusButton.setAttribute("aria-label", "Close Tune Advisor and focus the graph on evidence for " + (finding.title || "this finding"));
            $(focusButton).on("click", function() {
                focusEvidence(range, finding);
            });
        }
        return card;
    }

    function visibleFindings(evidencePackage, recommendationValidation) {
        return (Array.isArray(evidencePackage && evidencePackage.findings)
            ? evidencePackage.findings
            : [])
            .filter(function(finding) {
                return recommendationValidation && recommendationValidation.state === "valid"
                    || !finding
                    || finding.id !== "governor-f-next-controlled-test";
            });
    }

    function overallState(evidencePackage, recommendationValidation, mechanicalState) {
        var findings = visibleFindings(evidencePackage, recommendationValidation);
        var qualityStatus = evidencePackage.quality && evidencePackage.quality.status;
        var grade = typeof evidencePackage.grade === "string"
            ? evidencePackage.grade
            : evidencePackage.grade && (evidencePackage.grade.overall || evidencePackage.grade.status || evidencePackage.grade.value);

        if (recommendationValidation && recommendationValidation.state === "invalid") {
            return {
                className: "status-blocked",
                label: "Safety contract rejected · No advice"
            };
        }
        if (grade === "blocked" || grade === "stop" || qualityStatus === "blocked" || findings.some(function(finding) { return finding.severity === "stop"; })) {
            return { className: "status-blocked", label: "Evidence blocked · Stop / inspect" };
        }
        if (mechanicalNeedsInspection(mechanicalState)) {
            return {
                className: "status-caution",
                label: "Mechanical inspection advised"
            };
        }
        if (mechanicalEvidenceIsLimited(mechanicalState)) {
            return {
                className: "status-caution",
                label: "Mechanical evidence limited"
            };
        }
        if (grade === "limited" || grade === "caution" || qualityStatus === "caution" || findings.some(function(finding) { return finding.severity === "caution"; })) {
            return { className: "status-caution", label: "Evidence limited" };
        }
        return { className: "status-pass", label: "Evidence supported" };
    }

    function renderResults(evidencePackage, submittedRange, mechanicalState) {
        if (!rangesEqual(evidencePackage && evidencePackage.range, submittedRange)) {
            currentPackage = null;
            currentPackageRange = null;
            currentMechanicalState = null;
            showError("Tune Advisor rejected results that were not bound to the exact submitted In/Out range. Analyze the selection again; no result or confirmation was accepted.");
            return false;
        }

        var mechanicalValidation = mechanicalState && mechanicalState.state === "valid"
            ? validateMechanicalResult(mechanicalState.result, submittedRange)
            : { state: "unavailable" };
        if (mechanicalValidation.state === "range-mismatch") {
            currentPackage = null;
            currentPackageRange = null;
            currentMechanicalState = null;
            showError("Tune Advisor rejected mechanical evidence that was not bound to the exact submitted In/Out range. No result was accepted.");
            return false;
        }

        renderAnalyzedLogSummary(evidencePackage.log || {}, submittedRange);
        findingsContainer.empty();

        var gateState = applyConfirmationGate(evidencePackage);

        var evidenceById = {};
        (Array.isArray(evidencePackage.evidence) ? evidencePackage.evidence : []).forEach(function(evidence) {
            if (evidence && evidence.id) {
                evidenceById[evidence.id] = evidence;
            }
        });
        var recommendationValidation = applyMechanicalRecommendationBoundary(
            validateRecommendation(evidencePackage, evidenceById, submittedRange),
            mechanicalValidation
        );

        var sourceById = {};
        (Array.isArray(evidencePackage.sources) ? evidencePackage.sources : []).forEach(function(source) {
            if (source && source.id) {
                sourceById[source.id] = source;
            }
        });

        var findings = visibleFindings(evidencePackage, recommendationValidation);
        if (findings.length) {
            findings.forEach(function(finding) {
                append(findingsContainer[0], renderFinding(finding || {}, evidenceById, sourceById));
            });
        } else {
            append(findingsContainer[0], element(
                "p",
                "tune-advisor-empty",
                evidencePackage.quality && evidencePackage.quality.status === "blocked"
                    ? "This log did not pass the quality gate, so Tune Advisor withheld tuning guidance."
                    : "No deterministic tuning findings were produced for this log. Review the measured evidence below."
            ));
        }

        var status = overallState(
            evidencePackage,
            recommendationValidation,
            mechanicalValidation
        );
        overallStatus
            .removeClass("status-pass status-caution status-blocked")
            .addClass(status.className)
            .text(status.label);

        tuneCenterAnalysisState.governor = recommendationValidation.state === "valid"
            ? "Available" : "Withheld";
        tuneCenterAnalysisState.mechanical = mechanicalValidation.state === "valid"
                && mechanicalValidation.result
                && mechanicalValidation.result.status === "clear"
            ? "Available" : "Withheld";
        tuneCenterAnalysisState.report = status.className === "status-blocked"
            ? "Withheld" : "Available";

        renderWithheldReasons(gateState.gate);
        renderRecommendation(
            evidencePackage,
            evidenceById,
            submittedRange,
            recommendationValidation
        );
        applyRecommendationNotice(gateState, recommendationValidation);
        renderMechanicalResult(mechanicalValidation);
        renderMeasurements(evidencePackage);
        prepareAICoach(
            evidencePackage,
            submittedRange,
            recommendationValidation,
            mechanicalValidation
        );
        results.removeAttr("hidden");
        progressContainer.removeAttr("hidden");
        setProgress("Analysis complete for the exact submitted In/Out range.", 100);
        rerunButton.prop("disabled", false);
        if (status.className === "status-blocked") {
            setGlobalBlocker(
                "danger",
                "Stop / inspect: selected-range evidence blocked tuning guidance. Review the report before flying another test."
            );
        } else if (mechanicalNeedsInspection(mechanicalValidation)) {
            setGlobalBlocker(
                "warning",
                "Mechanical inspection advised: selected-range vibration evidence withholds Governor and PID tuning guidance."
            );
        } else {
            setGlobalBlocker(null, null);
        }
        updateTuneCenterModuleStatuses();
        modal.attr("aria-busy", "false");
        return true;
    }

    function cancelActiveJob() {
        if (activeJob) {
            activeJob.cancelled = true;
            activeJob = null;
        }
        cancelActiveCyclicCapture();
        cancelAICoachRequest(true);
    }

    function invalidatePresentation(message) {
        if (!cacheElements()) {
            return;
        }
        generation++;
        cancelActiveJob();
        clearAICoachPresentation();
        currentPackage = null;
        currentPackageRange = null;
        currentMechanicalState = null;
        confirmationBusy = false;
        tuneCenterAnalysisState = { governor: null, mechanical: null, report: null };
        setGlobalBlocker(null, null);
        results.attr("hidden", true);
        withheldSection.attr("hidden", true);
        withheldReasonsContainer.empty();
        recommendationSection.attr("hidden", true);
        recommendationContainer.empty();
        clearMechanicalPresentation();
        progressContainer.removeAttr("hidden");
        renderPendingLogSummary();
        setProgress(message || "Flight readiness changed. Analyze the selected range again.", 0);
        rerunButton.prop("disabled", !(currentLog && readSelectedRange()));
        modal.attr("aria-busy", "false");
        updateConfirmationUi();
        updateTuneCenterModuleStatuses();
    }

    function resetConfirmationsForRange() {
        confirmationValues = emptyConfirmationValues();
        confirmationSessionId = createConfirmationSessionId();
        confirmationContextKey = null;
        confirmationHasBoundKey = false;
        confirmationBusy = false;
        confirmationNotice = governorMaxThrottleValue() === null
            ? "The selected In/Out range changed. Enter the active profile's Governor Maximum Throttle, then analyze this exact range."
            : "The selected In/Out range changed. Flight readiness was cleared; analyze this exact range before confirming it again.";
        updateConfirmationUi();
    }

    function startAnalysis(force) {
        if (!cacheElements()) {
            return;
        }
        if (!currentLog) {
            showError("Open a Blackbox log before running Tune Advisor.");
            return;
        }
        var selectedRange = readSelectedRange();
        if (!selectedRange) {
            currentPackage = null;
            currentPackageRange = null;
            currentMechanicalState = null;
            showError("Set both graph In and Out markers, with In before Out, then run Tune Advisor again.");
            return;
        }
        if (!force
                && currentPackage
                && rangesEqual(currentPackageRange, selectedRange)
                && rangesEqual(currentPackage.range, currentPackageRange)) {
            renderResults(currentPackage, currentPackageRange, currentMechanicalState);
            return;
        }

        var engine = window.RotorLensTuneAdvisorEngine;
        if (!engine || typeof engine.analyzeFlightLog !== "function") {
            showError("The on-device Tune Advisor engine is unavailable in this build.");
            return;
        }

        cancelActiveJob();
        currentPackage = null;
        currentPackageRange = null;
        currentMechanicalState = null;
        var job = {
            cancelled: false,
            generation: generation,
            log: currentLog,
            range: selectedRange,
            confirmations: confirmationOptions(),
            userInputs: userInputOptions()
        };
        activeJob = job;

        analysisGlobalBlocker = null;
        renderGlobalBlocker();
        results.attr("hidden", true);
        withheldSection.attr("hidden", true);
        withheldReasonsContainer.empty();
        recommendationSection.attr("hidden", true);
        recommendationContainer.empty();
        clearMechanicalPresentation();
        progressContainer.removeAttr("hidden");
        rerunButton.prop("disabled", true);
        modal.attr("aria-busy", "true");
        confirmationBusy = true;
        confirmationNotice = "";
        updateConfirmationUi();
        setProgress("Preparing on-device analysis", 0);

        var isJobCancelled = function() {
            return job.cancelled
                || job.generation !== generation
                || job.log !== currentLog
                || !rangesEqual(readSelectedRange(), job.range);
        };

        Promise.resolve().then(function() {
            var mechanicalEngine = window.RotorLensMechanicalAnalysis;
            if (!mechanicalEngine || typeof mechanicalEngine.analyzeFlightLog !== "function") {
                return { state: "unavailable" };
            }

            var mechanicalOptions = {
                timeRangeUs: copyRange(job.range),
                isCancelled: isJobCancelled,
                onProgress: function(progress) {
                    if (job.cancelled || activeJob !== job) {
                        return;
                    }
                    var label = MECHANICAL_PHASE_LABELS[progress && progress.phase]
                        || "Measuring selected-range vibration spectrum";
                    setProgress(label, mechanicalProgressPercent(progress));
                }
            };
            return Promise.resolve().then(function() {
                return mechanicalEngine.analyzeFlightLog(job.log, mechanicalOptions);
            }).then(function(mechanicalResult) {
                var validation = validateMechanicalResult(mechanicalResult, job.range);
                if (validation.state === "range-mismatch") {
                    var mismatchError = new Error(
                        "Mechanical evidence was returned for a different In/Out range. No result was accepted."
                    );
                    mismatchError.code = "MECHANICAL_RANGE_MISMATCH";
                    throw mismatchError;
                }
                return validation;
            }).catch(function(error) {
                if (error && error.code === "MECHANICAL_RANGE_MISMATCH") {
                    throw error;
                }
                if (isJobCancelled()) {
                    var cancelledError = new Error("Analysis cancelled");
                    cancelledError.code = "ANALYSIS_CANCELLED";
                    throw cancelledError;
                }
                return { state: "unavailable" };
            });
        }).then(function(mechanicalState) {
            if (isJobCancelled() || activeJob !== job) {
                var cancelledError = new Error("Analysis cancelled");
                cancelledError.code = "ANALYSIS_CANCELLED";
                throw cancelledError;
            }

            setProgress("Checking control and governor evidence", 30);
            var engineOptions = {
                timeRangeUs: copyRange(job.range),
                isCancelled: isJobCancelled,
                onProgress: function(progress) {
                    if (job.cancelled || activeJob !== job) {
                        return;
                    }
                    var label = PHASE_LABELS[progress && progress.phase] || "Analyzing log";
                    setProgress(label, 30 + (progressPercent(progress) * 0.7));
                }
            };
            if (mechanicalState.state === "valid") {
                var mechanicalResult = mechanicalState.result;
                engineOptions.mechanicalGate = {
                    status: mechanicalResult.status,
                    range: copyRange(mechanicalResult.range),
                    reasonCodes: (Array.isArray(mechanicalResult.reasonCodes)
                        ? mechanicalResult.reasonCodes
                        : []).filter(function(code) {
                        return typeof code === "string"
                            && /^[A-Z][A-Z0-9_]{0,63}$/.test(code);
                    }).slice(0, 16)
                };
            } else {
                engineOptions.mechanicalGate = {
                    status: "unavailable",
                    range: copyRange(job.range),
                    reasonCodes: ["MECHANICAL_ANALYSIS_UNAVAILABLE"]
                };
            }
            if (job.confirmations) {
                engineOptions.confirmations = job.confirmations;
            }
            if (job.userInputs) {
                engineOptions.userInputs = job.userInputs;
            }
            return Promise.resolve(engine.analyzeFlightLog(job.log, engineOptions)).then(function(evidencePackage) {
                return {
                    evidencePackage: evidencePackage,
                    mechanicalState: mechanicalState
                };
            });
        }).then(function(analysisResult) {
            if (job.cancelled || activeJob !== job || job.generation !== generation || job.log !== currentLog) {
                return;
            }
            if (!rangesEqual(readSelectedRange(), job.range)) {
                activeJob = null;
                showError("The graph In/Out range changed. Run Tune Advisor again for the new selection.");
                return;
            }
            activeJob = null;
            if (!analysisResult || !analysisResult.evidencePackage) {
                throw new Error("Tune Advisor returned an invalid analysis result.");
            }
            currentPackage = analysisResult.evidencePackage;
            currentPackageRange = copyRange(job.range);
            currentMechanicalState = analysisResult.mechanicalState;
            renderResults(currentPackage, currentPackageRange, currentMechanicalState);
        }).catch(function(error) {
            if (job.cancelled || job.generation !== generation || job.log !== currentLog) {
                return;
            }
            if (activeJob === job) {
                activeJob = null;
            }
            if (error && error.code === "ANALYSIS_CANCELLED"
                    && !rangesEqual(readSelectedRange(), job.range)) {
                showError("The graph In/Out range changed. Run Tune Advisor again for the new selection.");
                return;
            }
            if (error && error.code === "MECHANICAL_RANGE_MISMATCH") {
                currentPackage = null;
                currentPackageRange = null;
                currentMechanicalState = null;
                showError("Tune Advisor rejected mechanical evidence that was not bound to the exact submitted In/Out range. No result or confirmation was accepted.");
                return;
            }
            showError(error && error.message
                ? "Tune Advisor could not analyze this log: " + error.message
                : "Tune Advisor could not analyze this log.");
        });
    }

    function openAdvisor() {
        if (!cacheElements()) {
            return;
        }
        if (!currentLog) {
            return;
        }

        showTuneCenterView("home", false);
        renderPendingLogSummary();
        updateCyclicUi();
        updateTuneCenterModuleStatuses();
        modal.modal("show");
    }

    function setCurrentLog(flightLog, context) {
        generation++;
        cancelActiveJob();
        applyCyclicSessionState(cyclicSessionAfterLogChange(cyclicSessionState()));
        cyclicCaptures = {
            baseline: cyclicCaptures.baseline || null,
            test: null
        };
        currentLog = flightLog || null;
        currentContext = context || {};
        currentPackage = null;
        currentPackageRange = null;
        currentMechanicalState = null;
        resetConfirmationSession(currentLog
            ? "A new log is active. Flight readiness and Governor Maximum Throttle were cleared; verify this aircraft profile again."
            : "");
        setTriggerEnabled(Boolean(currentLog));
        resetPresentation();
        if (cacheElements() && modal.hasClass("in")) {
            showTuneCenterView("home", true);
        }
    }

    function bindUi() {
        if (isBound || !cacheElements()) {
            return;
        }
        isBound = true;

        $(document).on("click.rotorLensTuneAdvisor", ".open-tune-advisor", function(event) {
            event.preventDefault();
            if ($(this).hasClass("disabled") || $(this).prop("disabled")) {
                return;
            }
            openAdvisor();
        });

        rerunButton.on("click.rotorLensTuneAdvisor", function() {
            startAnalysis(true);
        });

        modal.on("click.rotorLensTuneCenter", "[data-tune-center-target]", function() {
            showTuneCenterView(this.getAttribute("data-tune-center-target"), true);
        });

        modal.on("click.rotorLensTuneCenter", "[data-tune-center-back]", function() {
            showTuneCenterView("home", true);
        });

        cyclicAxisInputs.on("change.rotorLensTuneCenter", function() {
            if (this.checked) {
                applyCyclicSelection(this.value, cyclicSelection.term);
            }
        });

        cyclicTermInputs.on("change.rotorLensTuneCenter", function() {
            if (this.checked) {
                applyCyclicSelection(cyclicSelection.axis, this.value);
            }
        });

        cyclicCaptureButtons.on("click.rotorLensTuneCenter", function() {
            requestCyclicCapture(this.getAttribute("data-cyclic-capture"));
        });

        cyclicClearButton.on("click.rotorLensTuneCenter", function() {
            clearCyclicComparison("Comparison cleared. Save a new baseline and test explicitly.");
            $(document).trigger("rotorlens:cyclic-comparison-clear", [Object.freeze({
                axis: cyclicSelection.axis,
                term: cyclicSelection.term
            })]);
        });

        aiCoachAction.on("click.rotorLensTuneAdvisor", function() {
            if (!aiCoachBinding || $(this).prop("disabled")) {
                return;
            }
            if (aiCoachState === "running") {
                var cancelled = cancelAICoachRequest(true);
                setAICoachState(cancelled ? "ready" : "error");
                return;
            }
            if (aiCoachState === "downloading") {
                var cancelledDownload = cancelAICoachRequest(true);
                if (cancelledDownload && cancelledDownload.kind === "download") {
                    setAICoachState("not-installed");
                } else {
                    beginAIBridgeRequest("status");
                }
                return;
            }
            var retryRequestKind = aiRetryRequestKind(
                aiCoachState,
                aiModelReady,
                aiCoachRetryKind
            );
            if (retryRequestKind) {
                beginAIBridgeRequest(retryRequestKind);
            }
        });

        flightReadyConfirmationInput.on("change.rotorLensTuneAdvisor", function() {
            confirmationValues = groupedConfirmationValues(this.checked === true);
            confirmationNotice = "";
            invalidatePresentation("Flight-readiness acknowledgment changed. Analyze this selected range again to apply it.");
        });

        governorMaxThrottleInput.on("input.rotorLensTuneAdvisor change.rotorLensTuneAdvisor", function() {
            var nextRaw = String($(this).val() || "").trim();
            if (nextRaw === governorMaxThrottleRaw && governorMaxThrottleTouched) {
                return;
            }
            governorMaxThrottleRaw = nextRaw;
            governorMaxThrottleTouched = true;
            confirmationValues = emptyConfirmationValues();
            confirmationSessionId = createConfirmationSessionId();
            confirmationContextKey = null;
            confirmationHasBoundKey = false;
            confirmationNotice = "";
            invalidatePresentation(
                governorMaxThrottleValue() === null
                    ? "Enter Governor Maximum Throttle as a whole number from 10% through 100% before requesting Governor F advice."
                    : "Governor Maximum Throttle changed. Analyze this selected range to bind the new user-entered value; flight readiness was cleared."
            );
        });

        $(document).on("rotorlens:analysis-range-change.rotorLensTuneAdvisor", function() {
            generation++;
            cancelActiveJob();
            currentPackage = null;
            currentPackageRange = null;
            currentMechanicalState = null;
            resetConfirmationsForRange();
            resetPresentation();
        });

        modal.on("shown.bs.modal.rotorLensTuneAdvisor", function() {
            showTuneCenterView("home", true);
        });

        modal.on("hidden.bs.modal.rotorLensTuneAdvisor", function() {
            cancelActiveJob();
            clearAICoachPresentation();
            confirmationBusy = false;
            confirmationNotice = "";
            updateConfirmationUi();
            modal.attr("aria-busy", "false");
            $(".open-tune-advisor:visible").first().trigger("focus");
        });

        setCyclicIntegrationReady(Boolean(cyclicEngineApi()));
        setTriggerEnabled(Boolean(currentLog));
        resetPresentation();
    }

    var advisorApi = {
        setCurrentLog: setCurrentLog,
        open: openAdvisor,
        cancel: cancelActiveJob
    };
    if (window.__ROTORLENS_ADVISOR_TEST__ === true) {
        advisorApi.testHooks = Object.freeze({
            visibleFindings: visibleFindings,
            overallState: overallState,
            emptyConfirmationValues: emptyConfirmationValues,
            groupedConfirmationValues: groupedConfirmationValues,
            canonicalTuneCenterView: canonicalTuneCenterView,
            canonicalCyclicSelection: canonicalCyclicSelection,
            cyclicCaptureRequestPayload: cyclicCaptureRequestPayload,
            cyclicCaptureMatchesRequest: cyclicCaptureMatchesRequest,
            cyclicCaptureMetadataFromResult: cyclicCaptureMetadataFromResult,
            normalizeCyclicCaptureMetadata: normalizeCyclicCaptureMetadata,
            normalizeCyclicComparisonState: normalizeCyclicComparisonState,
            cyclicCaptureBindingMatches: cyclicCaptureBindingMatches,
            cyclicSafetyBlockerForMetadata: cyclicSafetyBlockerForMetadata,
            cyclicSessionAfterLogChange: cyclicSessionAfterLogChange,
            cyclicSessionAfterSelectionChange: cyclicSessionAfterSelectionChange,
            verifiedRotorflightBuild: verifiedRotorflightBuild,
            recommendationMetadataMatches: recommendationMetadataMatches,
            exactCanonicalConfirmationIds: exactCanonicalConfirmationIds,
            hasCuratedWithheldReason: hasCuratedWithheldReason,
            validateMechanicalResult: validateMechanicalResult,
            applyMechanicalRecommendationBoundary: applyMechanicalRecommendationBoundary,
            aiBridgeAvailable: aiBridgeAvailable,
            parseAIBridgeMessage: parseAIBridgeMessage,
            responseMatchesAIRequest: responseMatchesAIRequest,
            responseTypeMatchesAIRequest: responseTypeMatchesAIRequest,
            validAIBridgePayloadShape: validAIBridgePayloadShape,
            makeAIBridgeEnvelope: makeAIBridgeEnvelope,
            makeAICancelEnvelope: makeAICancelEnvelope,
            postAIBridgeEnvelope: postAIBridgeEnvelope,
            utf8ByteLength: utf8ByteLength,
            commonAIBridgePayload: commonAIBridgePayload,
            retryKindForAIError: retryKindForAIError,
            aiRetryRequestKind: aiRetryRequestKind,
            aiStatusTimeoutMs: AI_STATUS_TIMEOUT_MS,
            aiRequestTimeoutMs: AI_REQUEST_TIMEOUT_MS
        });
    }
    window.RotorLensTuneAdvisorUI = advisorApi;

    $(bindUi);
})(window, document, window.jQuery);
