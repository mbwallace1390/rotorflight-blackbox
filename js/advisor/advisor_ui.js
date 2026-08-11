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
        CONFIRMATION_MECHANICAL_INSPECTION_REQUIRED: "Confirm the mechanical, tail-servo, linkage, and control-authority inspection.",
        CONFIRMATION_POWER_SYSTEM_HEALTHY_REQUIRED: "Confirm the battery, ESC, motor, wiring, and throttle-headroom checks.",
        CONFIRMATION_RPM_AND_GEARING_REQUIRED: "Confirm the RPM sensor, motor poles or magnets, and gearing values.",
        CONFIRMATION_CORRECT_PROFILE_REQUIRED: "Confirm the aircraft/profile provenance and no settings change before In.",
        CONFIRMATION_OFFICIAL_TEST_SETUP_REQUIRED: "Confirm the governed mode and conservative experimental TTA/P/I/D test setup.",
        CONFIRMATION_SAFE_PITCH_PUMPS_REQUIRED: "Confirm the controlled pitch-pump test is safe to perform.",
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
    var confirmationInputs;
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
        confirmationInputs = confirmationFieldset.find("[data-confirmation]");
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
        return true;
    }

    function emptyConfirmationValues() {
        var values = {};
        CONFIRMATION_DEFINITIONS.forEach(function(definition) {
            values[definition.key] = false;
        });
        return values;
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

    function hasConfirmationKey(key) {
        return CONFIRMATION_DEFINITIONS.some(function(definition) {
            return definition.key === key;
        });
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

        confirmationInputs.each(function() {
            var key = this.getAttribute("data-confirmation");
            this.checked = hasConfirmationKey(key) && confirmationValues[key] === true;
        });
        if (governorMaxThrottleInput.length
                && document.activeElement !== governorMaxThrottleInput[0]) {
            governorMaxThrottleInput.val(governorMaxThrottleRaw);
        }
        governorMaxThrottleInput.attr(
            "aria-invalid",
            governorMaxThrottleTouched && governorMaxThrottleValue() === null ? "true" : "false"
        );

        var checkedCount = confirmationCount();
        confirmationCountLabel.text(
            "User confirmed · " + checkedCount + " / " + CONFIRMATION_DEFINITIONS.length
        );

        var confirmationsEnabled = Boolean(
            currentLog
            && confirmationContextKey
            && governorMaxThrottleValue() !== null
            && !confirmationBusy
        );
        confirmationFieldset.prop("disabled", false);
        confirmationInputs.prop("disabled", !confirmationsEnabled);
        confirmationInputs.closest(".tune-advisor-confirmation-item")
            .toggleClass("is-disabled", !confirmationsEnabled);
        governorMaxThrottleInput.prop("disabled", !(currentLog && !confirmationBusy));

        if (confirmationNotice) {
            confirmationStatus.text(confirmationNotice);
        } else if (!currentLog) {
            confirmationStatus.text("Open a Blackbox log before recording user confirmations.");
        } else if (confirmationBusy) {
            confirmationStatus.text("Measured analysis is running. User confirmations are temporarily locked.");
        } else if (governorMaxThrottleValue() === null) {
            confirmationStatus.text("Enter the active profile's configured Governor Maximum Throttle as a whole number from 10% through 100%. This user-entered value is required and is not measured from the log.");
        } else if (!confirmationContextKey) {
            confirmationStatus.text("Analyze the selected range once to bind the user-entered value to its exact logged configuration before confirming the six checks.");
        } else if (allConfirmationsChecked()) {
            confirmationStatus.text(
                "All six user-entered checks and Governor Maximum Throttle "
                + formatNumber(governorMaxThrottleValue(), 0)
                + "% are recorded for this selected range. Analyze again to apply them; no setting will be written."
            );
        } else {
            confirmationStatus.text(
                checkedCount + " of " + CONFIRMATION_DEFINITIONS.length
                + " user-entered checks confirmed. Governor F direction remains withheld until every user and measured gate passes."
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
                || !isFiniteNumber(range.startTimeUs)
                || !isFiniteNumber(range.endTimeUs)
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
            append(logSummary[0], element("span", null, "Open a Blackbox log to use Tune Advisor."));
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

    function showError(message) {
        if (!cacheElements()) {
            return;
        }

        progressContainer.attr("hidden", true);
        results.attr("hidden", true);
        withheldSection.attr("hidden", true);
        withheldReasonsContainer.empty();
        recommendationSection.attr("hidden", true);
        recommendationContainer.empty();
        currentMechanicalState = null;
        clearMechanicalPresentation();
        errorBox.text(message || "Tune Advisor could not analyze this log.");
        errorBox.removeAttr("hidden");
        rerunButton.prop("disabled", !(currentLog && readSelectedRange()));
        modal.attr("aria-busy", "false");
        confirmationBusy = false;
        confirmationNotice = "Analysis stopped. Review the selected range and user-entered prerequisites before trying again.";
        updateConfirmationUi();
    }

    function resetPresentation() {
        if (!cacheElements()) {
            return;
        }

        renderPendingLogSummary();
        errorBox.attr("hidden", true).empty();
        results.attr("hidden", true);
        findingsContainer.empty();
        measurementsContainer.empty();
        withheldSection.attr("hidden", true);
        withheldReasonsContainer.empty();
        recommendationSection.attr("hidden", true);
        recommendationContainer.empty();
        clearMechanicalPresentation();
        overallStatus.removeClass("status-pass status-caution status-blocked").empty();
        progressContainer.removeAttr("hidden");
        setProgress(currentLog ? "Ready to analyze this log." : "Open a log to begin.", 0);
        rerunButton.prop("disabled", !(currentLog && readSelectedRange()));
        modal.attr("aria-busy", "false");
        updateConfirmationUi();
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
        reasonCodes.forEach(function(code) {
            append(list, element("li", null, withheldReasonMessage(code)));
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
                ? "The analyzed configuration was rebound or changed. All user-entered prerequisites were cleared; verify them again before another controlled test."
                : "The analyzed configuration key was lost. All user-entered prerequisites were cleared; analyze again before confirming them.";
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
            confirmationNotice = "User-entered prerequisites are separate from measured log evidence. Both gates passed for the single experimental next-test proposal below; no setting was written.";
        } else if (gate && gate.status === "withheld"
                && allConfirmationsChecked()
                && governorMaxThrottleValue() !== null) {
            confirmationNotice = "All user-entered prerequisites are recorded, but measured evidence withheld a Governor F proposal. Review the reasons below.";
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
        errorBox.attr("hidden", true).empty();
        results.removeAttr("hidden");
        progressContainer.removeAttr("hidden");
        setProgress("Analysis complete for the exact submitted In/Out range.", 100);
        rerunButton.prop("disabled", false);
        modal.attr("aria-busy", "false");
        return true;
    }

    function cancelActiveJob() {
        if (activeJob) {
            activeJob.cancelled = true;
            activeJob = null;
        }
    }

    function invalidatePresentation(message) {
        if (!cacheElements()) {
            return;
        }
        generation++;
        cancelActiveJob();
        currentPackage = null;
        currentPackageRange = null;
        currentMechanicalState = null;
        confirmationBusy = false;
        errorBox.attr("hidden", true).empty();
        results.attr("hidden", true);
        withheldSection.attr("hidden", true);
        withheldReasonsContainer.empty();
        recommendationSection.attr("hidden", true);
        recommendationContainer.empty();
        clearMechanicalPresentation();
        progressContainer.removeAttr("hidden");
        renderPendingLogSummary();
        setProgress(message || "User-entered prerequisites changed. Analyze the selected range again.", 0);
        rerunButton.prop("disabled", !(currentLog && readSelectedRange()));
        modal.attr("aria-busy", "false");
        updateConfirmationUi();
    }

    function resetConfirmationsForRange() {
        confirmationValues = emptyConfirmationValues();
        confirmationSessionId = createConfirmationSessionId();
        confirmationContextKey = null;
        confirmationHasBoundKey = false;
        confirmationBusy = false;
        confirmationNotice = governorMaxThrottleValue() === null
            ? "The selected In/Out range changed. Enter the active profile's Governor Maximum Throttle, then analyze this exact range."
            : "The selected In/Out range changed. User confirmations were cleared; analyze this exact range before confirming them again.";
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

        errorBox.attr("hidden", true).empty();
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

        modal.modal("show");
        startAnalysis(false);
    }

    function setCurrentLog(flightLog, context) {
        generation++;
        cancelActiveJob();
        currentLog = flightLog || null;
        currentContext = context || {};
        currentPackage = null;
        currentPackageRange = null;
        currentMechanicalState = null;
        resetConfirmationSession(currentLog
            ? "A new log is active. User confirmations and Governor Maximum Throttle were cleared; verify this aircraft profile again."
            : "");
        setTriggerEnabled(Boolean(currentLog));
        resetPresentation();

        if (currentLog && cacheElements() && modal.hasClass("in")) {
            startAnalysis(true);
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

        confirmationInputs.on("change.rotorLensTuneAdvisor", function() {
            var key = this.getAttribute("data-confirmation");
            if (!hasConfirmationKey(key)) {
                return;
            }
            confirmationValues[key] = this.checked === true;
            confirmationNotice = "";
            invalidatePresentation("User confirmations changed. Analyze this selected range again to apply them.");
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
                    : "Governor Maximum Throttle changed. Analyze this selected range to bind the new user-entered value; confirmations were cleared."
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
            if (modal.hasClass("in") && readSelectedRange()) {
                startAnalysis(true);
            }
        });

        modal.on("hidden.bs.modal.rotorLensTuneAdvisor", function() {
            cancelActiveJob();
            confirmationBusy = false;
            confirmationNotice = "";
            updateConfirmationUi();
            modal.attr("aria-busy", "false");
            $(".open-tune-advisor:visible").first().trigger("focus");
        });

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
            verifiedRotorflightBuild: verifiedRotorflightBuild,
            recommendationMetadataMatches: recommendationMetadataMatches,
            exactCanonicalConfirmationIds: exactCanonicalConfirmationIds,
            hasCuratedWithheldReason: hasCuratedWithheldReason,
            validateMechanicalResult: validateMechanicalResult,
            applyMechanicalRecommendationBoundary: applyMechanicalRecommendationBoundary
        });
    }
    window.RotorLensTuneAdvisorUI = advisorApi;

    $(bindUi);
})(window, document, window.jQuery);
