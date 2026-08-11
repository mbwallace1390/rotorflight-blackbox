"use strict";

(function(root, factory) {
    var api;

    if (typeof module === "object" && module.exports) {
        api = factory(require("./evidence_contract"));
        module.exports = api;
    } else {
        api = factory(root.RotorLensAdvisorEvidenceContract);
    }

    if (root) {
        root.RotorLensAdvisorRules = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function(contract) {
    var MINIMUM_USEFUL_DURATION_US = 5000000;
    var MINIMUM_TRACKING_RATE_HZ = 100;
    var MINIMUM_RECOMMENDATION_RATE_HZ = 900;
    var MAXIMUM_RECOMMENDATION_P99_INTERVAL_US = 1500;
    var MAXIMUM_RECOMMENDATION_FRAME_INTERVAL_US = 5000;
    var MAXIMUM_RECOMMENDATION_JITTER_RATIO = 1.5;
    var MINIMUM_RECOMMENDATION_TIMING_COVERAGE = 0.98;
    var MINIMUM_SAFETY_SAMPLE_COUNT = 100;
    var SUPPORTED_RECOMMENDATION_FIRMWARE = "4.6.0";
    var GOVERNOR_F_STEP = 10;
    var GOVERNOR_GAIN_MIN = 0;
    var GOVERNOR_GAIN_MAX = 250;
    var CONFIRMATION_IDS = Object.freeze([
        "mechanicalInspection",
        "powerSystemHealthy",
        "rpmAndGearingVerified",
        "correctProfileVerified",
        "officialTestSetup",
        "safePitchPumps"
    ]);
    var CONFIRMATION_REASON_CODES = Object.freeze({
        mechanicalInspection: "CONFIRMATION_MECHANICAL_INSPECTION_REQUIRED",
        powerSystemHealthy: "CONFIRMATION_POWER_SYSTEM_HEALTHY_REQUIRED",
        rpmAndGearingVerified: "CONFIRMATION_RPM_AND_GEARING_REQUIRED",
        correctProfileVerified: "CONFIRMATION_CORRECT_PROFILE_REQUIRED",
        officialTestSetup: "CONFIRMATION_OFFICIAL_TEST_SETUP_REQUIRED",
        safePitchPumps: "CONFIRMATION_SAFE_PITCH_PUMPS_REQUIRED"
    });

    function round(value, digits) {
        return contract.roundNumber(value, digits);
    }

    function finding(id, severity, title, summary, action, evidenceIds, sourceIds, timeRangeUs) {
        return {
            id: id,
            severity: severity,
            title: title,
            summary: summary,
            action: action,
            evidenceIds: evidenceIds || [],
            sourceIds: sourceIds || [],
            timeRangeUs: timeRangeUs
        };
    }

    function addReason(reasonCodes, code) {
        if (reasonCodes.indexOf(code) === -1) {
            reasonCodes.push(code);
        }
    }

    function validGovernorGain(value) {
        return Number.isInteger(value)
            && value >= GOVERNOR_GAIN_MIN
            && value <= GOVERNOR_GAIN_MAX;
    }

    function poweredCoverageComplete(snapshot, fieldName) {
        var coverage = snapshot.safetySampleCoverage
            && snapshot.safetySampleCoverage[fieldName];
        return snapshot.poweredSampleCount >= MINIMUM_SAFETY_SAMPLE_COUNT
            && coverage
            && coverage.valid === snapshot.poweredSampleCount
            && coverage.missing === 0;
    }

    function verifiedRecommendationFirmware(snapshot) {
        return snapshot.firmwareTypeCode === 5
            && snapshot.firmwareVersion === SUPPORTED_RECOMMENDATION_FIRMWARE
            && typeof snapshot.firmwareRevisionRaw === "string"
            && /^Rotorflight 4\.6\.0 \(118e912\) [A-Za-z0-9_.-]+$/i.test(
                snapshot.firmwareRevisionRaw
            );
    }

    function hashConfiguration(value) {
        // FNV-1a is used only as a compact stale-confirmation key, not as a
        // security primitive. The engine retains no confirmation state.
        var hash = 2166136261;
        for (var i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        var hex = (hash >>> 0).toString(16);
        return "govf-" + ("00000000" + hex).slice(-8);
    }

    function configurationKey(snapshot) {
        var config = snapshot.governorConfiguration || {};
        return hashConfiguration([
            snapshot.firmwareTypeCode,
            snapshot.firmwareVersion,
            snapshot.firmwareRevisionRaw,
            snapshot.logIndex,
            snapshot.minTimeUs,
            snapshot.maxTimeUs,
            config.pGain,
            config.iGain,
            config.dGain,
            config.fGain,
            config.masterGain,
            config.ttaGain,
            config.ttaLimit,
            config.collectiveRange ? config.collectiveRange.join(",") : null,
            config.maxThrottlePercent,
            snapshot.selectedDataFingerprint
        ].join("|"));
    }

    function confirmationGate(confirmations, expectedKey, reasonCodes) {
        var input = confirmations && typeof confirmations === "object"
            ? confirmations
            : {};
        var keyMatches = input.configurationKey === expectedKey;
        var sessionPresent = typeof input.sessionId === "string"
            && input.sessionId.trim().length > 0;
        var confirmedIds = [];

        if (!sessionPresent) {
            addReason(reasonCodes, "CONFIRMATION_SESSION_REQUIRED");
        }

        if (!input.configurationKey) {
            addReason(reasonCodes, "CONFIRMATION_CONTEXT_REQUIRED");
        } else if (!keyMatches) {
            addReason(reasonCodes, "CONFIRMATION_CONTEXT_MISMATCH");
        }

        CONFIRMATION_IDS.forEach(function(id) {
            if (sessionPresent && keyMatches && input[id] === true) {
                confirmedIds.push(id);
            } else {
                addReason(reasonCodes, CONFIRMATION_REASON_CODES[id]);
            }
        });

        return confirmedIds;
    }

    function buildEvidencePackage(snapshot, measurement, confirmations) {
        if (!contract) {
            throw new Error("Tune Advisor evidence contract was not loaded");
        }

        var evidence = new contract.EvidenceBuilder();
        var findings = [];
        var qualityEvidenceIds = [];
        var blockerCount = 0;
        var cautionCount = 0;
        var invalidSampleCount = snapshot.invalidTimeCount + snapshot.invalidRequiredValueCount;
        var selectedTimeRange = [snapshot.minTimeUs, snapshot.maxTimeUs];
        var firmwareBuildVerified = verifiedRecommendationFirmware(snapshot);

        qualityEvidenceIds.push(evidence.add({
            id: "quality.duration",
            metric: "Selected range duration",
            value: round(snapshot.durationUs / 1000000, 3),
            unit: "s",
            scope: "selected-range",
            timeRangeUs: selectedTimeRange
        }));
        qualityEvidenceIds.push(evidence.add({
            id: "quality.sample-rate",
            metric: "Measured logging rate",
            value: round(measurement.quality.sampleRateHz, 2),
            unit: "Hz",
            scope: "selected-range",
            timeRangeUs: selectedTimeRange
        }));
        qualityEvidenceIds.push(evidence.add({
            id: "quality.effective-sample-rate",
            metric: "Effective selected-range logging rate",
            value: round(measurement.quality.effectiveSampleRateHz, 2),
            unit: "Hz",
            scope: "selected-range",
            timeRangeUs: selectedTimeRange
        }));
        qualityEvidenceIds.push(evidence.add({
            id: "quality.p99-frame-interval",
            metric: "Frame interval p99",
            value: round(measurement.quality.p99FrameIntervalUs, 0),
            unit: "us",
            scope: "selected-range",
            timeRangeUs: selectedTimeRange
        }));
        qualityEvidenceIds.push(evidence.add({
            id: "quality.powered-duration",
            metric: "Powered-flight duration",
            value: round(snapshot.poweredDurationUs / 1000000, 3),
            unit: "s",
            scope: "powered-flight"
        }));
        qualityEvidenceIds.push(evidence.add({
            id: "quality.corrupt-frames",
            metric: "Corrupt frames",
            value: snapshot.corruptFrames,
            unit: "frames",
            scope: "selected-range"
        }));
        qualityEvidenceIds.push(evidence.add({
            id: "quality.discontinuities",
            metric: "Detected discontinuities",
            value: snapshot.discontinuities,
            unit: "events",
            scope: "selected-range"
        }));

        if (snapshot.firmwareTypeCode !== 5) {
            blockerCount++;
            findings.push(finding(
                "unsupported-firmware",
                "stop",
                "Unsupported firmware for tuning advice",
                "The measurements can be displayed, but this ruleset is validated only for Rotorflight logs.",
                "Use a Rotorflight Blackbox log or review this log manually. No settings will be changed.",
                [],
                ["rotorflight-blackbox"]
            ));
        }

        if (snapshot.poweredDurationUs < MINIMUM_USEFUL_DURATION_US) {
            blockerCount++;
            findings.push(finding(
                "log-too-short",
                "stop",
                "Powered flight is too short for tuning advice",
                "Less than five seconds of powered-flight data is not enough to separate steady behavior from transitions.",
                "Record a longer, controlled powered flight and repeat one maneuver at a time.",
                ["quality.powered-duration"],
                ["rotorflight-blackbox"]
            ));
        }

        var corruptionRatio = Number.isFinite(snapshot.corruptFrames) && snapshot.sampleCount > 0
            ? snapshot.corruptFrames / snapshot.sampleCount
            : null;
        if (corruptionRatio > 0.01 || snapshot.discontinuities > 5) {
            blockerCount++;
            findings.push(finding(
                "log-integrity-blocker",
                "stop",
                "Log integrity is insufficient",
                "Corruption or repeated discontinuities can make apparent tracking and governor errors misleading.",
                "Fix Blackbox logging reliability and capture a clean replacement log before tuning.",
                ["quality.corrupt-frames", "quality.discontinuities"],
                ["rotorflight-blackbox"]
            ));
        } else if (snapshot.corruptFrames > 0 || snapshot.discontinuities > 0) {
            cautionCount++;
            findings.push(finding(
                "log-integrity-caution",
                "caution",
                "Minor log integrity issue",
                "A small number of corrupt frames or discontinuities was detected.",
                "Confirm each recommendation against the graph and repeat the maneuver in a clean log.",
                ["quality.corrupt-frames", "quality.discontinuities"],
                ["rotorflight-blackbox"]
            ));
        }

        if (snapshot.endMarkerEvaluable && !snapshot.hasEndMarker) {
            cautionCount++;
            findings.push(finding(
                "missing-end-marker",
                "caution",
                "Log may be incomplete",
                "The parser recovered usable data, but no end-of-log marker was found.",
                "Use the measurements cautiously and capture a normally closed log before making a tuning decision.",
                qualityEvidenceIds,
                ["rotorflight-blackbox"]
            ));
        }

        if (invalidSampleCount > Math.max(5, snapshot.sampleCount * 0.001)) {
            cautionCount++;
            findings.push(finding(
                "invalid-values",
                "caution",
                "Some required values were invalid",
                "The advisor excluded invalid time, setpoint, or gyro values from its measurements.",
                "Inspect the affected graph regions and repeat the log if the gaps overlap a tuning maneuver.",
                [],
                ["rotorflight-blackbox"]
            ));
        }

        if (snapshot.configurationWarnings.length > 0) {
            cautionCount++;
            findings.push(finding(
                "logging-header-warning",
                "caution",
                "Logging-rate configuration is incomplete",
                "One or more timing headers needed to verify the configured logging rate are missing.",
                "Check the Blackbox configuration and use the measured rate shown here.",
                ["quality.sample-rate"],
                ["rotorflight-blackbox"]
            ));
        }

        var rxProblemCount = snapshot.failsafeSampleCount
            + snapshot.rxLossSampleCount
            + snapshot.invalidRxChannelsSampleCount;
        var failsafeSamplesComplete = poweredCoverageComplete(snapshot, "failsafePhase");
        var rxSignalSamplesComplete = poweredCoverageComplete(snapshot, "rxSignalReceived");
        var rxChannelSamplesComplete = poweredCoverageComplete(
            snapshot,
            "rxFlightChannelsValid"
        );
        var flightModeSamplesComplete = poweredCoverageComplete(snapshot, "flightModeFlags");
        var batterySamplesComplete = poweredCoverageComplete(snapshot, "battery");
        var rxSafetyEvaluable = snapshot.coverage.failsafePhase === true
            && snapshot.coverage.rxHealth === true
            && failsafeSamplesComplete
            && rxSignalSamplesComplete
            && rxChannelSamplesComplete;
        var rxEvidenceId = evidence.add({
            id: "safety.rx-health",
            metric: "Powered samples with failsafe or invalid RX data",
            value: rxSafetyEvaluable || rxProblemCount > 0 ? rxProblemCount : null,
            unit: "samples",
            scope: "powered-flight",
            status: rxSafetyEvaluable ? "observed" : "unknown"
        });
        if (rxProblemCount > 0) {
            blockerCount++;
            findings.push(finding(
                "rx-safety-blocker",
                "stop",
                "Resolve receiver or failsafe events first",
                "Failsafe phase, lost signal, or invalid flight-channel data appeared while the system was powered.",
                "Do not tune from this log. Inspect the receiver link and failsafe setup, then make a clean verification flight.",
                [rxEvidenceId],
                ["rotorflight-blackbox"]
            ));
        } else if (!rxSafetyEvaluable) {
            cautionCount++;
            findings.push(finding(
                "rx-safety-unknown",
                "caution",
                "Receiver and failsafe safety coverage is incomplete",
                "A zero cannot be inferred because this log lacks one or more powered-flight receiver/failsafe fields.",
                "Capture a powered Rotorflight log with failsafe phase, RX signal, and flight-channel validity before treating the safety gate as clear.",
                [rxEvidenceId],
                ["rotorflight-blackbox"]
            ));
        }

        var trackingAxes = measurement.tracking.filter(function(axis) {
            return axis.available;
        }).map(function(axis) {
            var rmseId = evidence.add({
                id: "tracking." + axis.axis + ".rmse",
                metric: "Tracking error RMS",
                scope: axis.axis,
                value: round(axis.all.rmsErrorDps, 2),
                unit: "deg/s",
                timeRangeUs: selectedTimeRange
            });
            var p95Id = evidence.add({
                id: "tracking." + axis.axis + ".p95",
                metric: "Tracking error p95 absolute",
                scope: axis.axis,
                value: round(axis.all.p95AbsErrorDps, 2),
                unit: "deg/s",
                timeRangeUs: selectedTimeRange
            });

            return {
                axis: axis.axis,
                sampleCount: axis.all.sampleCount,
                rmsErrorDps: round(axis.all.rmsErrorDps, 2),
                p95AbsErrorDps: round(axis.all.p95AbsErrorDps, 2),
                commandedRmsErrorDps: axis.commanded
                    ? round(axis.commanded.rmsErrorDps, 2)
                    : null,
                normalizedCommandedRmse: round(axis.normalizedCommandedRmse, 4),
                evidenceIds: [rmseId, p95Id]
            };
        });

        var trackingStatus = trackingAxes.length === 3
            ? "available"
            : (trackingAxes.length > 0 ? "limited" : "unsupported");
        if (trackingStatus !== "available"
                || !measurement.quality.sampleRateHz
                || measurement.quality.sampleRateHz < MINIMUM_TRACKING_RATE_HZ) {
            cautionCount++;
            findings.push(finding(
                "tracking-coverage-limited",
                "caution",
                "Tracking measurement is limited",
                "All three setpoint and filtered-gyro axes at a useful logging rate are required for a complete comparison.",
                "Enable Setpoint and Gyro Blackbox fields and record at least 100 Hz; use the same maneuver for before/after logs.",
                ["quality.sample-rate"],
                ["rotorflight-blackbox"]
            ));
        }

        var battery = measurement.battery;
        var batteryEvidenceIds = [];
        if (battery.available) {
            batteryEvidenceIds.push(evidence.add({
                id: "battery.minimum-voltage",
                metric: "Minimum powered battery voltage",
                value: round(battery.minimumVolts, 2),
                unit: "V",
                scope: "powered-flight",
                timeRangeUs: selectedTimeRange
            }));
            if (battery.minimumCellVolts !== null) {
                batteryEvidenceIds.push(evidence.add({
                    id: "battery.minimum-cell-voltage",
                    metric: "Minimum powered voltage per estimated cell",
                    value: round(battery.minimumCellVolts, 3),
                    unit: "V/cell",
                    scope: "powered-flight",
                    timeRangeUs: selectedTimeRange
                }));
            }
        }

        var batterySafetyEvaluable = battery.available
            && batterySamplesComplete
            && battery.minimumCellVolts !== null
            && battery.warningCellVolts !== null
            && typeof battery.belowConfiguredWarning === "boolean";
        if (battery.belowConfiguredWarning === true) {
            blockerCount++;
            findings.push(finding(
                "battery-warning-blocker",
                "stop",
                "Battery voltage crossed the configured warning",
                "Low voltage can cause power limitation and governor droop that should not be treated as a gain problem.",
                "Use a healthy charged pack and verify the power system before evaluating tuning changes.",
                batteryEvidenceIds,
                ["rotorflight-governor-tuning"]
            ));
        } else if (!batterySafetyEvaluable) {
            cautionCount++;
            findings.push(finding(
                "battery-safety-unknown",
                "caution",
                "Battery safety gate is incomplete",
                battery.available
                    ? "Pack voltage was measured, but cell count or the configured warning voltage could not be validated."
                    : "Powered-flight battery voltage was not available in this log.",
                "Confirm a healthy charged pack and capture battery voltage with valid cell-count and warning-voltage headers before comparing tuning behavior.",
                batteryEvidenceIds,
                ["rotorflight-blackbox"]
            ));
        }

        var governor = measurement.governor;
        var governorEvidenceIds = [];
        var governorConfigurationEvidenceIds = [];
        var pumpEvidenceIds = [];
        if (governor.available) {
            governorEvidenceIds.push(evidence.add({
                id: "governor.target-rpm",
                metric: "Median active target headspeed",
                value: round(governor.targetRpm, 0),
                unit: "rpm",
                scope: "governor-active",
                timeRangeUs: selectedTimeRange
            }));
            governorEvidenceIds.push(evidence.add({
                id: "governor.rmse",
                metric: "Active headspeed tracking RMSE",
                value: round(governor.rmseRpm, 1),
                unit: "rpm",
                scope: "governor-active",
                timeRangeUs: selectedTimeRange
            }));
            governorEvidenceIds.push(evidence.add({
                id: "governor.maximum-droop",
                metric: "Maximum active headspeed droop",
                value: round(governor.maxDroopRpm, 0),
                unit: "rpm",
                scope: "governor-active",
                timeRangeUs: selectedTimeRange
            }));
            governorEvidenceIds.push(evidence.add({
                id: "governor.maximum-overshoot",
                metric: "Maximum active headspeed overshoot",
                value: round(governor.maxOvershootRpm, 0),
                unit: "rpm",
                scope: "governor-active",
                timeRangeUs: selectedTimeRange
            }));
            if (governor.motorP95Pct !== null) {
                governorEvidenceIds.push(evidence.add({
                    id: "governor.motor-p95",
                    metric: "Governor-active motor output p95",
                    value: round(governor.motorP95Pct, 1),
                    unit: "%",
                    scope: "governor-active",
                    timeRangeUs: selectedTimeRange
                }));
            }
        }

        governorEvidenceIds.push(evidence.add({
            id: "governor.active-event-in-selection",
            metric: "Explicit governor ACTIVE event inside selected range",
            value: governor.explicitActiveEventWithinRange === true,
            scope: "selected-range",
            timeRangeUs: selectedTimeRange
        }));
        governorEvidenceIds.push(evidence.add({
            id: "governor.full-rate-records",
            metric: "Governor records retained without Advisor downsampling",
            value: governor.fullRateRecords === true,
            scope: "selected-range",
            timeRangeUs: selectedTimeRange
        }));

        var governorConfiguration = snapshot.governorConfiguration || {};
        [
            ["p", governorConfiguration.pGain],
            ["i", governorConfiguration.iGain],
            ["d", governorConfiguration.dGain],
            ["f", governorConfiguration.fGain],
            ["master", governorConfiguration.masterGain],
            ["tta", governorConfiguration.ttaGain]
        ].forEach(function(setting) {
            if (!Number.isFinite(setting[1])) {
                return;
            }
            governorConfigurationEvidenceIds.push(evidence.add({
                id: "governor.setting." + setting[0],
                metric: "Logged governor " + setting[0].toUpperCase() + " setting",
                value: setting[1],
                unit: "gain",
                scope: "configuration-applied-to-selected-range",
                timeRangeUs: selectedTimeRange
            }));
        });
        if (Number.isFinite(governorConfiguration.maxThrottlePercent)) {
            governorConfigurationEvidenceIds.push(evidence.add({
                id: "governor.setting.max-throttle",
                metric: "User-provided current-profile governor maximum throttle",
                value: governorConfiguration.maxThrottlePercent,
                unit: "%",
                scope: governorConfiguration.maxThrottleSource,
                timeRangeUs: selectedTimeRange
            }));
        }

        var pitchPumps = governor.pitchPumps || {
            candidateCount: 0,
            eligibleCount: 0,
            truncatedWindowCount: 0,
            overlappingWindowCount: 0,
            unstableTargetWindowCount: 0,
            targetStable: false,
            missingRequestWindowCount: 0,
            unstableRequestWindowCount: 0,
            requestEvidenceAvailable: false,
            requestStable: false,
            missingArmWindowCount: 0,
            unarmedWindowCount: 0,
            armEvidenceComplete: false,
            allPumpWindowsArmed: false,
            crossPumpHeadSpeedStable: false,
            windowEvaluationLimitReached: false,
            droopCount: 0,
            overshootCount: 0,
            sufficient: false,
            direction: null,
            headroomSufficient: false,
            tailEvidenceAvailable: false,
            tailDegradationDetected: false,
            tailStable: false,
            windows: []
        };
        pumpEvidenceIds.push(evidence.add({
            id: "governor.pitch-pump-consistency",
            metric: "Consistent normalized pitch-pump responses",
            value: {
                candidates: pitchPumps.candidateCount,
                eligible: pitchPumps.eligibleCount,
                droop: pitchPumps.droopCount,
                overshoot: pitchPumps.overshootCount,
                sufficient: pitchPumps.sufficient
            },
            scope: "selected-range",
            timeRangeUs: selectedTimeRange
        }));
        (pitchPumps.windows || []).forEach(function(window, index) {
            if (!Number.isFinite(window.baselineStartTimeUs)
                    || !Number.isFinite(window.endTimeUs)
                    || window.baselineStartTimeUs < snapshot.minTimeUs
                    || window.endTimeUs > snapshot.maxTimeUs) {
                return;
            }
            pumpEvidenceIds.push(evidence.add({
                id: "governor.pitch-pump." + (index + 1),
                metric: "Normalized pitch-pump response",
                value: {
                    classification: window.classification,
                    motorHeadroomPct: round(window.motorHeadroomPct, 1),
                    baselineYawRmsDps: round(window.baselineYawRmsDps, 1),
                    responseYawRmsDps: round(window.responseYawRmsDps, 1)
                },
                scope: "selected-range",
                timeRangeUs: [window.baselineStartTimeUs, window.endTimeUs]
            }));
        });

        var recommendationReasonCodes = [];
        if (!snapshot.mechanicalGate) {
            addReason(
                recommendationReasonCodes,
                "MECHANICAL_ANALYSIS_REQUIRED"
            );
        } else if (snapshot.mechanicalGate.status === "attention") {
            addReason(
                recommendationReasonCodes,
                "MECHANICAL_ATTENTION_IN_SELECTION"
            );
        } else if (snapshot.mechanicalGate.status === "insufficient") {
            addReason(
                recommendationReasonCodes,
                "MECHANICAL_ANALYSIS_INSUFFICIENT"
            );
        } else if (snapshot.mechanicalGate.status === "unavailable") {
            addReason(
                recommendationReasonCodes,
                "MECHANICAL_ANALYSIS_UNAVAILABLE"
            );
        }
        var machinePrerequisiteIds = [
            "firmware.rotorflight-4.6.0",
            "range.selected-only",
            "logging.minimum-900hz",
            "governor.explicit-active-event",
            "governor.required-fields",
            "governor.logged-current-settings",
            "governor.conservative-f-test-baseline",
            "governor.user-max-throttle",
            "safety.rx-clear",
            "safety.battery-clear",
            "safety.tail-stable",
            "test.three-consistent-normalized-pumps"
        ];
        var recommendationPrerequisiteIds = CONFIRMATION_IDS.slice();
        var expectedConfigurationKey = configurationKey(snapshot);

        if (snapshot.firmwareTypeCode !== 5
                || snapshot.firmwareVersion !== SUPPORTED_RECOMMENDATION_FIRMWARE) {
            addReason(recommendationReasonCodes, "UNSUPPORTED_FIRMWARE");
        } else if (!verifiedRecommendationFirmware(snapshot)) {
            addReason(recommendationReasonCodes, "UNVERIFIED_FIRMWARE_BUILD");
        }
        if (!Number.isFinite(measurement.quality.sampleRateHz)) {
            addReason(recommendationReasonCodes, "SAMPLE_RATE_UNAVAILABLE");
        } else if (measurement.quality.sampleRateHz < MINIMUM_RECOMMENDATION_RATE_HZ) {
            addReason(recommendationReasonCodes, "SAMPLE_RATE_BELOW_900_HZ");
        }
        if (!Number.isFinite(measurement.quality.effectiveSampleRateHz)
                || measurement.quality.effectiveSampleRateHz
                    < MINIMUM_RECOMMENDATION_RATE_HZ) {
            addReason(recommendationReasonCodes, "EFFECTIVE_SAMPLE_RATE_BELOW_900_HZ");
        }
        if (!Number.isFinite(measurement.quality.p99FrameIntervalUs)
                || measurement.quality.p99FrameIntervalUs
                    > MAXIMUM_RECOMMENDATION_P99_INTERVAL_US) {
            addReason(recommendationReasonCodes, "TIMING_P99_TOO_HIGH");
        }
        if (!Number.isFinite(measurement.quality.maximumFrameIntervalUs)
                || measurement.quality.maximumFrameIntervalUs
                    > MAXIMUM_RECOMMENDATION_FRAME_INTERVAL_US) {
            addReason(recommendationReasonCodes, "MAX_FRAME_INTERVAL_TOO_HIGH");
        }
        if (!Number.isFinite(measurement.quality.frameIntervalJitterRatio)
                || measurement.quality.frameIntervalJitterRatio
                    > MAXIMUM_RECOMMENDATION_JITTER_RATIO) {
            addReason(recommendationReasonCodes, "TIMING_JITTER_TOO_HIGH");
        }
        if (!Number.isFinite(measurement.quality.timingCoverageRatio)
                || measurement.quality.timingCoverageRatio
                    < MINIMUM_RECOMMENDATION_TIMING_COVERAGE) {
            addReason(recommendationReasonCodes, "TIMING_COVERAGE_INCOMPLETE");
        }
        if (snapshot.poweredDurationUs < MINIMUM_USEFUL_DURATION_US) {
            addReason(recommendationReasonCodes, "POWERED_DURATION_TOO_SHORT");
        }
        if ((Number.isFinite(snapshot.corruptFrames) && snapshot.corruptFrames > 0)
                || snapshot.discontinuities > 0
                || invalidSampleCount > 0) {
            addReason(recommendationReasonCodes, "SELECTED_RANGE_NOT_CLEAN");
        }
        if (snapshot.invalidGovernorValueCount > 0) {
            addReason(recommendationReasonCodes, "GOVERNOR_VALUES_INVALID_IN_SELECTION");
        }
        if ((snapshot.configurationWarnings || []).length > 0) {
            addReason(recommendationReasonCodes, "LOGGING_HEADER_INCOMPLETE");
        }
        if (snapshot.invalidTimeCount > 0) {
            addReason(recommendationReasonCodes, "NON_MONOTONIC_TIMESTAMP_IN_SELECTION");
        }
        if (snapshot.numericPlausibilityViolationCount > 0
                || governorConfiguration.numericPlausible === false
                || governorConfiguration.invalidLoggedGainValues === true
                || governorConfiguration.invalidCollectiveRangeValues === true) {
            addReason(recommendationReasonCodes, "GOVERNOR_NUMERIC_VALUES_IMPLAUSIBLE");
        }

        var coverage = snapshot.coverage || {};
        if (!coverage.governorRequest || !coverage.governorTarget || !coverage.governorActual) {
            addReason(recommendationReasonCodes, "REQUIRED_GOVERNOR_FIELDS_MISSING");
        }
        if (!coverage.collective) {
            addReason(recommendationReasonCodes, "COLLECTIVE_FIELD_MISSING");
        }
        if (!coverage.collectiveRange) {
            addReason(recommendationReasonCodes, "COLLECTIVE_RANGE_HEADER_MISSING");
        }
        if (!coverage.mainMotor) {
            addReason(recommendationReasonCodes, "MAIN_MOTOR_FIELD_MISSING");
        }
        if (!coverage.failsafePhase) {
            addReason(recommendationReasonCodes, "FAILSAFE_FIELD_MISSING");
        }
        if (!coverage.flightModeFlags) {
            addReason(recommendationReasonCodes, "FLIGHT_MODE_FIELD_MISSING");
        }
        if (!coverage.rxHealth) {
            addReason(recommendationReasonCodes, "RX_FIELDS_MISSING");
        }
        if (!coverage.battery) {
            addReason(recommendationReasonCodes, "BATTERY_FIELD_MISSING");
        }
        if (!coverage.batteryConfiguration) {
            addReason(recommendationReasonCodes, "BATTERY_CONFIGURATION_HEADER_MISSING");
        }
        if (snapshot.batteryConfigurationStatus === "invalid") {
            addReason(recommendationReasonCodes, "BATTERY_CONFIGURATION_INVALID");
        }
        if (!coverage.setpointAxes || !coverage.setpointAxes[2]
                || !coverage.gyroAxes || !coverage.gyroAxes[2]) {
            addReason(recommendationReasonCodes, "TAIL_FIELDS_MISSING");
        }

        if (!failsafeSamplesComplete) {
            addReason(recommendationReasonCodes, "FAILSAFE_SAMPLES_INCOMPLETE");
        }
        if (!rxSignalSamplesComplete) {
            addReason(recommendationReasonCodes, "RX_SIGNAL_SAMPLES_INCOMPLETE");
        }
        if (!rxChannelSamplesComplete) {
            addReason(recommendationReasonCodes, "RX_CHANNEL_SAMPLES_INCOMPLETE");
        }
        if (!flightModeSamplesComplete) {
            addReason(recommendationReasonCodes, "FLIGHT_MODE_SAMPLES_INCOMPLETE");
        }
        if (!batterySamplesComplete) {
            addReason(recommendationReasonCodes, "BATTERY_SAMPLES_INCOMPLETE");
        }
        if (!rxSafetyEvaluable) {
            addReason(recommendationReasonCodes, "RX_SAFETY_UNKNOWN");
        }
        if (rxProblemCount > 0) {
            addReason(recommendationReasonCodes, "RX_SAFETY_BLOCKER");
        }
        if (!batterySafetyEvaluable) {
            addReason(recommendationReasonCodes, "BATTERY_SAFETY_UNKNOWN");
        } else if (battery.belowConfiguredWarning === true) {
            addReason(recommendationReasonCodes, "BATTERY_SAFETY_BLOCKER");
        }
        (snapshot.safetyEventCodes || []).forEach(function(code) {
            addReason(recommendationReasonCodes, code);
        });
        if (snapshot.unsafeFlightModeSampleCount > 0) {
            addReason(recommendationReasonCodes, "UNSAFE_FLIGHT_MODE_IN_SELECTION");
        }

        if (!governor.explicitActiveEventWithinRange) {
            addReason(recommendationReasonCodes, "ACTIVE_EVENT_MISSING_IN_SELECTION");
        }
        if (governor.stateSequenceSafe !== true) {
            addReason(recommendationReasonCodes, "GOVERNOR_STATE_SEQUENCE_UNSAFE");
        }
        if (governor.eventsComplete !== true) {
            addReason(recommendationReasonCodes, "GOVERNOR_EVENTS_TRUNCATED");
        }
        if (!governor.available) {
            addReason(recommendationReasonCodes, "GOVERNOR_ACTIVE_DATA_INSUFFICIENT");
        }
        if (governor.fullRateRecords !== true) {
            addReason(recommendationReasonCodes, "GOVERNOR_RECORDS_NOT_FULL_RATE");
        }

        var loggedGovernorSettingsValid = governorConfiguration.govPidLogged === true
            && validGovernorGain(governorConfiguration.pGain)
            && validGovernorGain(governorConfiguration.iGain)
            && validGovernorGain(governorConfiguration.dGain)
            && validGovernorGain(governorConfiguration.fGain)
            && validGovernorGain(governorConfiguration.masterGain);
        if (!loggedGovernorSettingsValid) {
            addReason(recommendationReasonCodes, "GOVERNOR_SETTINGS_MISSING_OR_INVALID");
        } else if (governorConfiguration.pGain !== 10
                || governorConfiguration.iGain !== 20
                || governorConfiguration.dGain !== 0) {
            addReason(recommendationReasonCodes, "CONSERVATIVE_F_TEST_PID_BASELINE_REQUIRED");
        }
        if (governorConfiguration.ttaLogged !== true
                || !validGovernorGain(governorConfiguration.ttaGain)) {
            addReason(recommendationReasonCodes, "GOVERNOR_TTA_MISSING_OR_INVALID");
        } else if (governorConfiguration.ttaGain !== 0) {
            addReason(recommendationReasonCodes, "GOVERNOR_TTA_MUST_BE_ZERO");
        }
        if (governorConfiguration.maxThrottleInputStatus === "invalid") {
            addReason(recommendationReasonCodes, "GOVERNOR_MAX_THROTTLE_INVALID");
        } else if (!Number.isFinite(governorConfiguration.maxThrottlePercent)) {
            addReason(recommendationReasonCodes, "GOVERNOR_MAX_THROTTLE_REQUIRED");
        }

        if (pitchPumps.truncatedWindowCount > 0) {
            addReason(recommendationReasonCodes, "TRUNCATED_PUMP_WINDOW_IN_SELECTION");
        }
        if (pitchPumps.overlappingWindowCount > 0) {
            addReason(recommendationReasonCodes, "OVERLAPPING_PUMP_WINDOWS");
        }
        if (pitchPumps.windowEvaluationLimitReached) {
            addReason(recommendationReasonCodes, "PUMP_WINDOW_EVALUATION_LIMIT_REACHED");
        }
        if (pitchPumps.targetStable !== true) {
            addReason(recommendationReasonCodes, "GOVERNOR_TARGET_UNSTABLE");
        }
        if (pitchPumps.requestEvidenceAvailable !== true) {
            addReason(recommendationReasonCodes, "GOVERNOR_REQUEST_EVIDENCE_INCOMPLETE");
        }
        if (pitchPumps.requestStable !== true) {
            addReason(recommendationReasonCodes, "GOVERNOR_REQUEST_UNSTABLE");
        }
        if (pitchPumps.armEvidenceComplete !== true) {
            addReason(recommendationReasonCodes, "ARM_EVIDENCE_INCOMPLETE");
        }
        if (pitchPumps.allPumpWindowsArmed !== true) {
            addReason(recommendationReasonCodes, "UNARMED_PUMP_WINDOW");
        }
        if (pitchPumps.crossPumpHeadSpeedStable !== true) {
            addReason(recommendationReasonCodes, "CROSS_PUMP_HEADSPEED_INCONSISTENT");
        }
        if (pitchPumps.candidateCount < 3) {
            addReason(recommendationReasonCodes, "INSUFFICIENT_PITCH_PUMPS");
        } else if (!pitchPumps.sufficient) {
            addReason(recommendationReasonCodes, "INCONSISTENT_PITCH_PUMPS");
        }
        if (pitchPumps.candidateCount >= 3
                && Number.isFinite(governorConfiguration.maxThrottlePercent)
                && !pitchPumps.headroomSufficient) {
            addReason(recommendationReasonCodes, "MOTOR_HEADROOM_INSUFFICIENT");
        }
        if (pitchPumps.candidateCount >= 3 && !pitchPumps.tailEvidenceAvailable) {
            addReason(recommendationReasonCodes, "TAIL_EVIDENCE_INCOMPLETE");
        }
        if (pitchPumps.tailDegradationDetected) {
            addReason(recommendationReasonCodes, "TAIL_RESPONSE_DEGRADED");
        } else if (pitchPumps.candidateCount >= 3
                && pitchPumps.tailEvidenceAvailable
                && !pitchPumps.tailStable) {
            addReason(recommendationReasonCodes, "TAIL_TEST_NOT_CONTROLLED");
        }

        var confirmedConfirmationIds = confirmationGate(
            confirmations,
            expectedConfigurationKey,
            recommendationReasonCodes
        );
        var recommendation = null;
        if (recommendationReasonCodes.length === 0
                && (pitchPumps.direction === "increase" || pitchPumps.direction === "decrease")) {
            var requestedDelta = pitchPumps.direction === "increase"
                ? GOVERNOR_F_STEP
                : -GOVERNOR_F_STEP;
            var proposedValue = Math.min(
                GOVERNOR_GAIN_MAX,
                Math.max(GOVERNOR_GAIN_MIN, governorConfiguration.fGain + requestedDelta)
            );
            if (proposedValue - governorConfiguration.fGain !== requestedDelta) {
                addReason(recommendationReasonCodes, "GOVERNOR_F_FULL_STEP_OUT_OF_RANGE");
            } else {
                var recommendationEvidenceIds = governorEvidenceIds
                    .concat(governorConfigurationEvidenceIds)
                    .concat(pumpEvidenceIds);
                recommendation = {
                    kind: "next-controlled-test",
                    experimental: true,
                    setting: "gov_f_gain",
                    currentValue: governorConfiguration.fGain,
                    proposedValue: proposedValue,
                    rollbackValue: governorConfiguration.fGain,
                    requestedDelta: requestedDelta,
                    delta: requestedDelta,
                    direction: pitchPumps.direction,
                    reasonCode: pitchPumps.direction === "increase"
                        ? "CONSISTENT_DROOP"
                        : "CONSISTENT_OVERSHOOT",
                    reasonCodes: [pitchPumps.direction === "increase"
                        ? "CONSISTENT_DROOP"
                        : "CONSISTENT_OVERSHOOT"],
                    prerequisiteIds: recommendationPrerequisiteIds,
                    evidenceIds: recommendationEvidenceIds,
                    sourceIds: ["rotorflight-governor-tuning"],
                    provenance: {
                        analysisMode: "deterministic-local",
                        ruleset: "rotorlens-governor-f-next-test-v1",
                        firmwareShortRevision: "118e912",
                        selectedRangeOnly: true
                    },
                    directWriteAllowed: false,
                    validationRequired: true,
                    finalTuneClaim: false
                };
            }
        }

        if (!governor.available) {
            findings.push(finding(
                "governor-targeted-log-needed",
                "info",
                "Capture a targeted governor log",
                "Governor request, target, and actual headspeed were not available together during an explicitly ACTIVE interval.",
                "Set Blackbox debug mode to Governor. Place In before the governor enters ACTIVE and Out after the controlled test so the ACTIVE event is inside the selected range.",
                governorEvidenceIds,
                ["rotorflight-governor-tuning"]
            ));
        } else if (!recommendation) {
            findings.push(finding(
                "governor-prerequisites-required",
                "info",
                "Governor response measured; gain advice withheld",
                "The selected range was measured, but one or more deterministic safety or test prerequisites did not pass.",
                "Resolve the listed prerequisite codes, reconfirm the current range and profile, then rerun. No setting will be written.",
                governorEvidenceIds.concat(governorConfigurationEvidenceIds, pumpEvidenceIds),
                ["rotorflight-governor-tuning"]
            ));
        } else {
            findings.push(finding(
                "governor-f-next-controlled-test",
                "caution",
                "Governor F next controlled test is ready",
                "Repeated normalized pitch pumps showed consistent "
                    + (recommendation.direction === "increase" ? "droop" : "overshoot")
                    + " with measured motor headroom and stable tail response.",
                "Test only gov_f_gain " + recommendation.currentValue + " → "
                    + recommendation.proposedValue + ". Keep " + recommendation.rollbackValue
                    + " as the rollback value and capture a matched comparison log before accepting the change.",
                recommendation.evidenceIds,
                ["rotorflight-governor-tuning"],
                selectedTimeRange
            ));
        }

        var qualityStatus = blockerCount > 0
            ? "blocked"
            : (cautionCount > 0 ? "caution" : "pass");
        var governorStatus = recommendation
            ? "available"
            : (governor.available ? "limited" : "unsupported");
        var qualityGrade = qualityStatus === "blocked"
            ? "blocked"
            : (qualityStatus === "caution" ? "limited" : "supported");
        var trackingGrade = trackingStatus === "available" ? "supported" : "limited";
        var governorGrade = governorStatus === "available" ? "supported" : "limited";
        var overallGrade = blockerCount > 0
            ? "blocked"
            : (cautionCount > 0
                || trackingGrade === "limited"
                || governorGrade === "limited"
                    ? "limited"
                    : "supported");

        return contract.makePackage({
            log: {
                firmwareType: snapshot.firmwareType,
                firmwareVersion: snapshot.firmwareVersion,
                firmwareBuildVerified: firmwareBuildVerified,
                firmwareBuild: {
                    verified: firmwareBuildVerified,
                    shortRevision: firmwareBuildVerified ? "118e912" : null,
                    raw: snapshot.firmwareRevisionRaw || null
                },
                logIndex: snapshot.logIndex,
                startTimeUs: snapshot.logMinTimeUs,
                endTimeUs: snapshot.logMaxTimeUs,
                durationUs: snapshot.logMaxTimeUs - snapshot.logMinTimeUs
            },
            range: {
                startTimeUs: snapshot.minTimeUs,
                endTimeUs: snapshot.maxTimeUs,
                startOffsetUs: snapshot.minTimeUs - snapshot.logMinTimeUs,
                endOffsetUs: snapshot.maxTimeUs - snapshot.logMinTimeUs,
                durationUs: snapshot.durationUs,
                sampleRateHz: round(measurement.quality.sampleRateHz, 2),
                effectiveSampleRateHz: round(measurement.quality.effectiveSampleRateHz, 2),
                p99FrameIntervalUs: round(measurement.quality.p99FrameIntervalUs, 0),
                maximumFrameIntervalUs: round(
                    measurement.quality.maximumFrameIntervalUs,
                    0
                ),
                timingCoverageRatio: round(measurement.quality.timingCoverageRatio, 4),
                sampleCount: snapshot.sampleCount,
                poweredDurationUs: snapshot.poweredDurationUs
            },
            grade: {
                overall: overallGrade,
                quality: qualityGrade,
                tracking: trackingGrade,
                governor: governorGrade
            },
            quality: {
                status: qualityStatus,
                corruptFrames: snapshot.corruptFrames,
                discontinuities: snapshot.discontinuities,
                invalidSampleCount: invalidSampleCount,
                missingEndMarker: snapshot.endMarkerEvaluable ? !snapshot.hasEndMarker : null,
                evidenceIds: qualityEvidenceIds.concat([rxEvidenceId])
            },
            coverage: Object.assign({}, snapshot.coverage, {
                status: rxSafetyEvaluable && batterySafetyEvaluable ? "supported" : "limited",
                rxSafety: rxSafetyEvaluable ? "available" : "unknown",
                batterySafety: batterySafetyEvaluable ? "available" : "unknown",
                safetySamples: snapshot.safetySampleCoverage || null,
                debugMode: snapshot.debugName,
                governorSource: snapshot.governorSource
            }),
            tracking: {
                status: trackingStatus,
                source: trackingAxes.length > 0 ? "setpoint-minus-gyroADC" : null,
                axes: trackingAxes
            },
            battery: {
                status: !battery.available
                    ? "unsupported"
                    : (!batterySafetyEvaluable
                        ? "limited"
                        : (battery.belowConfiguredWarning ? "warning" : "available")),
                cellCount: battery.cellCount,
                minimumVolts: round(battery.minimumVolts, 2),
                maximumVolts: round(battery.maximumVolts, 2),
                minimumCellVolts: round(battery.minimumCellVolts, 3),
                warningCellVolts: round(battery.warningCellVolts, 3),
                evidenceIds: batteryEvidenceIds
            },
            governor: {
                status: governorStatus,
                source: governor.source,
                targetRpm: round(governor.targetRpm, 0),
                actualRpm: round(governor.actualRpm, 0),
                rmseRpm: round(governor.rmseRpm, 1),
                maxDroopRpm: round(governor.maxDroopRpm, 0),
                maxOvershootRpm: round(governor.maxOvershootRpm, 0),
                motorP95Pct: round(governor.motorP95Pct, 1),
                motorCeilingPct: round(governor.motorCeilingPercent, 1),
                motorHeadroomPct: round(governor.motorHeadroomPercent, 1),
                headroomSufficient: governor.headroomSufficient,
                pitchPumpCount: governor.pitchPumps ? governor.pitchPumps.candidateCount : 0,
                eligiblePitchPumpCount: pitchPumps.eligibleCount,
                direction: recommendation ? recommendation.direction : null,
                currentSettings: {
                    pGain: governorConfiguration.pGain,
                    iGain: governorConfiguration.iGain,
                    dGain: governorConfiguration.dGain,
                    fGain: governorConfiguration.fGain,
                    masterGain: governorConfiguration.masterGain,
                    ttaGain: governorConfiguration.ttaGain,
                    maxThrottlePct: governorConfiguration.maxThrottlePercent,
                    maxThrottleSource: governorConfiguration.maxThrottleSource
                },
                recommendationGate: {
                    status: recommendation ? "eligible" : "withheld",
                    firmwareBuildVerified: firmwareBuildVerified,
                    configurationKey: expectedConfigurationKey,
                    reasonCodes: recommendationReasonCodes,
                    machinePrerequisiteIds: machinePrerequisiteIds,
                    requiredConfirmationIds: CONFIRMATION_IDS,
                    confirmedConfirmationIds: confirmedConfirmationIds,
                    userInputIds: ["governorMaxThrottlePct"]
                },
                recommendation: recommendation,
                evidenceIds: governorEvidenceIds
                    .concat(governorConfigurationEvidenceIds)
                    .concat(pumpEvidenceIds)
            },
            evidence: evidence.items,
            findings: findings
        });
    }

    return Object.freeze({
        buildEvidencePackage: buildEvidencePackage
    });
}));
