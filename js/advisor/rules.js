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

    function buildEvidencePackage(snapshot, measurement) {
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
        var rxSafetyEvaluable = snapshot.coverage.failsafePhase === true
            && snapshot.coverage.rxHealth === true
            && snapshot.poweredSampleCount > 0;
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
        if (governor.available) {
            governorEvidenceIds.push(evidence.add({
                id: "governor.target-rpm",
                metric: "Median active target headspeed",
                value: round(governor.targetRpm, 0),
                unit: "rpm",
                scope: "governor-active"
            }));
            governorEvidenceIds.push(evidence.add({
                id: "governor.rmse",
                metric: "Active headspeed tracking RMSE",
                value: round(governor.rmseRpm, 1),
                unit: "rpm",
                scope: "governor-active"
            }));
            governorEvidenceIds.push(evidence.add({
                id: "governor.maximum-droop",
                metric: "Maximum active headspeed droop",
                value: round(governor.maxDroopRpm, 0),
                unit: "rpm",
                scope: "governor-active"
            }));
            governorEvidenceIds.push(evidence.add({
                id: "governor.maximum-overshoot",
                metric: "Maximum active headspeed overshoot",
                value: round(governor.maxOvershootRpm, 0),
                unit: "rpm",
                scope: "governor-active"
            }));
            if (governor.motorP95Pct !== null) {
                governorEvidenceIds.push(evidence.add({
                    id: "governor.motor-p95",
                    metric: "Governor-active motor output p95",
                    value: round(governor.motorP95Pct, 1),
                    unit: "%",
                    scope: "governor-active"
                }));
            }
        }

        // V1 intentionally never turns a log into a gain direction. A log does
        // not prove mechanical health, TTA/P/I test setup, receiver coverage,
        // battery health, or the configured motor ceiling. Those prerequisites
        // need explicit confirmation plus controlled before/after logs.
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
        } else {
            findings.push(finding(
                "governor-prerequisites-required",
                "info",
                "Governor response measured; gain advice withheld",
                "Target, actual headspeed, and Motor 1 were measured, but a log cannot prove every mechanical, power, receiver, setup, and motor-limit prerequisite required for a safe gain decision.",
                "Use the official Rotorflight governor procedure and controlled repeat logs. This Advisor version does not recommend raising or lowering a gain.",
                governorEvidenceIds,
                ["rotorflight-governor-tuning"]
            ));
        }

        var qualityStatus = blockerCount > 0
            ? "blocked"
            : (cautionCount > 0 ? "caution" : "pass");
        var governorStatus = governor.available ? "limited" : "unsupported";
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
                headroomSufficient: governor.headroomSufficient,
                pitchPumpCount: governor.pitchPumps ? governor.pitchPumps.candidateCount : 0,
                direction: null,
                evidenceIds: governorEvidenceIds
            },
            evidence: evidence.items,
            findings: findings
        });
    }

    return Object.freeze({
        buildEvidencePackage: buildEvidencePackage
    });
}));
