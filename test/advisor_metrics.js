"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const metrics = require("../js/advisor/deterministic_metrics");
const engine = require("../js/advisor/flightlog_adapter");
const rules = require("../js/advisor/rules");

const repositoryRoot = path.resolve(__dirname, "..");
const parserScripts = [
    "js/vendor/semver.js",
    "js/tools.js",
    "js/cache.js",
    "js/datastream.js",
    "js/decoders.js",
    "js/imu.js",
    "js/flightlog_fielddefs.js",
    "js/flightlog_fields_presenter.js",
    "js/flightlog_parser.js",
    "js/flightlog_index.js",
    "js/flightlog.js"
];

function cloneForExtend(value, deep) {
    if (!deep || value === null || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(function(item) {
            return cloneForExtend(item, true);
        });
    }
    return extendObject(true, {}, value);
}

function extendObject() {
    const args = Array.prototype.slice.call(arguments);
    const deep = typeof args[0] === "boolean" ? args.shift() : false;
    const target = args.shift() || {};

    args.forEach(function(source) {
        if (!source) {
            return;
        }
        Object.keys(source).forEach(function(key) {
            const value = source[key];
            if (deep && value && !Array.isArray(value) && typeof value === "object") {
                const current = target[key];
                target[key] = extendObject(
                    true,
                    current && typeof current === "object" && !Array.isArray(current)
                        ? current
                        : {},
                    value
                );
            } else {
                target[key] = cloneForExtend(value, deep);
            }
        });
    });
    return target;
}

function createJQueryStub() {
    function jquery() {
        return {
            addClass: function() { return this; },
            hide: function() { return this; },
            removeClass: function() { return this; },
            show: function() { return this; }
        };
    }
    jquery.extend = extendObject;
    return jquery;
}

function loadParserRuntime() {
    const jquery = createJQueryStub();
    const sandbox = {
        ArrayBuffer,
        DataView,
        Date,
        JSON,
        Math,
        Uint8Array,
        clearInterval,
        clearTimeout,
        console,
        navigator: { userAgent: "node-advisor-test" },
        setInterval,
        setTimeout,
        $: jquery,
        jQuery: jquery
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.global = sandbox;

    const context = vm.createContext(sandbox);
    parserScripts.forEach(function(relativePath) {
        vm.runInContext(
            fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
            context,
            { filename: relativePath }
        );
    });
    return context;
}

function makePitchPumpRecords(responseKind, overrides) {
    const settings = Object.assign({
        motorPct: 72,
        yawErrorDps: 3,
        responseYawErrorDps: 4,
        yawSetpointDps: 0,
        requestRpm: 2000,
        unstableRequest: false,
        stepUs: 1000,
        armed: true,
        pumpStarts: [1000000, 2200000, 3400000, 4600000]
    }, overrides);
    const records = [];
    const pumpStarts = settings.pumpStarts;

    for (let timeUs = 0; timeUs <= 5800000; timeUs += settings.stepUs) {
        let collectivePercent = 0;
        let actualRpm = 2000;
        let yawErrorDps = settings.yawErrorDps;
        pumpStarts.forEach(function(startUs) {
            if (timeUs >= startUs && timeUs <= startUs + 450000) {
                collectivePercent = 80;
                if (timeUs >= startUs + 50000) {
                    actualRpm += responseKind === "droop" ? -120 : 120;
                    yawErrorDps = settings.responseYawErrorDps;
                }
            }
        });
        records.push({
            timeUs,
            collectivePercent,
            requestRpm: settings.unstableRequest
                ? (Math.floor(timeUs / 100000) % 2 === 0 ? 1800 : 2200)
                : settings.requestRpm,
            targetRpm: 2000,
            actualRpm,
            motorPct: settings.motorPct,
            yawSetpointDps: settings.yawSetpointDps,
            yawErrorDps,
            armed: settings.armed,
            active: true
        });
    }
    return records;
}

function assertPitchPumpRules() {
    const options = {
        motorCeilingPercent: 90,
        selectedStartTimeUs: 0,
        selectedEndTimeUs: 5800000
    };
    const droop = metrics.detectPitchPumps(makePitchPumpRecords("droop"), options);
    const overshoot = metrics.detectPitchPumps(makePitchPumpRecords("overshoot"), options);
    const highOutput = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { motorPct: 87 }),
        options
    );
    const unknownOutput = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { motorPct: null }),
        options
    );
    const degradedTail = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { responseYawErrorDps: 23 }),
        options
    );
    const missingRequest = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { requestRpm: null }),
        options
    );
    const unstableRequest = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { unstableRequest: true }),
        options
    );
    const boundaryLimited = metrics.detectPitchPumps(makePitchPumpRecords("droop"), {
        motorCeilingPercent: 90,
        selectedStartTimeUs: 0,
        selectedEndTimeUs: 5000000
    });
    const largeSelection = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { stepUs: 250 }),
        options
    );
    const noisyThresholdRecords = makePitchPumpRecords("droop", { stepUs: 250 }).map(
        function(record, index) {
            return Object.assign({}, record, {
                collectivePercent: index % 2 === 0 ? 69 : 70,
                actualRpm: 2000
            });
        }
    );
    const noisyThreshold = metrics.detectPitchPumps(noisyThresholdRecords, options);
    const oneUnstableTargetPumpRecords = makePitchPumpRecords("droop").map(function(record) {
        if (record.timeUs < 4350000 || record.timeUs > 5400000) {
            return record;
        }
        return Object.assign({}, record, {
            targetRpm: Math.floor(record.timeUs / 100000) % 2 === 0 ? 1800 : 2200
        });
    });
    const oneUnstableTargetPump = metrics.detectPitchPumps(
        oneUnstableTargetPumpRecords,
        options
    );
    const pumpStarts = [1000000, 2200000, 3400000, 4600000];
    const isolatedGlitchRecords = makePitchPumpRecords("droop").map(function(record) {
        const isGlitch = pumpStarts.some(function(startUs) {
            return record.timeUs === startUs + 100000;
        });
        return Object.assign({}, record, { actualRpm: isGlitch ? 1880 : 2000 });
    });
    const isolatedGlitches = metrics.detectPitchPumps(isolatedGlitchRecords, options);
    const firstHigh = metrics.detectPitchPumps(
        makePitchPumpRecords("droop").filter(function(record) {
            return record.timeUs >= 1000000;
        }),
        Object.assign({}, options, { selectedStartTimeUs: 1000000 })
    );
    const sparseBaseline = metrics.detectPitchPumps(
        makePitchPumpRecords("droop").filter(function(record) {
            return record.timeUs < 850000 || record.timeUs > 875000;
        }),
        options
    );
    const overlapping = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", {
            pumpStarts: [1000000, 1900000, 3100000, 4300000]
        }),
        options
    );
    const crossBankRecords = makePitchPumpRecords("droop").map(function(record) {
        let bankOffset = null;
        pumpStarts.forEach(function(startUs, index) {
            if (record.timeUs >= startUs - 250000
                    && record.timeUs <= startUs + 800000) {
                bankOffset = index * 150;
            }
        });
        if (bankOffset === null) {
            return record;
        }
        return Object.assign({}, record, {
            requestRpm: 2000 + bankOffset,
            targetRpm: 2000 + bankOffset,
            actualRpm: 2000 + bankOffset + (record.actualRpm - 2000)
        });
    });
    const crossBank = metrics.detectPitchPumps(crossBankRecords, options);
    const missingArm = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { armed: null }),
        options
    );
    const unarmed = metrics.detectPitchPumps(
        makePitchPumpRecords("droop", { armed: false }),
        options
    );

    assert.strictEqual(droop.sufficient, true);
    assert.strictEqual(droop.direction, "increase");
    assert.ok(droop.eligibleCount >= 3);
    assert.strictEqual(overshoot.sufficient, true);
    assert.strictEqual(overshoot.direction, "decrease");
    assert.strictEqual(highOutput.sufficient, false);
    assert.strictEqual(highOutput.headroomSufficient, false);
    assert.strictEqual(unknownOutput.sufficient, false);
    assert.strictEqual(degradedTail.sufficient, false);
    assert.strictEqual(degradedTail.tailDegradationDetected, true);
    assert.ok(missingRequest.missingRequestWindowCount >= 3);
    assert.strictEqual(missingRequest.requestEvidenceAvailable, false);
    assert.ok(unstableRequest.unstableRequestWindowCount >= 3);
    assert.strictEqual(unstableRequest.requestStable, false);
    assert.strictEqual(boundaryLimited.truncatedWindowCount, 1);
    boundaryLimited.windows.forEach(function(window) {
        assert.ok(window.baselineStartTimeUs >= 0);
        assert.ok(window.endTimeUs <= 5000000);
    });
    assert.ok(largeSelection.recordsScanned > 23000);
    assert.strictEqual(largeSelection.windowEvaluationCount, 4);
    assert.strictEqual(largeSelection.sufficient, true);
    assert.strictEqual(noisyThreshold.windowEvaluationLimitReached, true);
    assert.strictEqual(noisyThreshold.windowEvaluationCount, 256);
    assert.strictEqual(oneUnstableTargetPump.sufficient, true);
    assert.strictEqual(oneUnstableTargetPump.unstableTargetWindowCount, 1);
    assert.strictEqual(oneUnstableTargetPump.targetStable, false);
    assert.strictEqual(isolatedGlitches.sufficient, false);
    assert.strictEqual(isolatedGlitches.droopCount, 0);
    assert.strictEqual(firstHigh.truncatedWindowCount, 1);
    assert.strictEqual(firstHigh.sufficient, true);
    assert.strictEqual(sparseBaseline.truncatedWindowCount, 1);
    assert.strictEqual(sparseBaseline.sufficient, true);
    assert.strictEqual(overlapping.overlappingWindowCount, 1);
    assert.strictEqual(overlapping.sufficient, true);
    assert.strictEqual(crossBank.crossPumpHeadSpeedStable, false);
    assert.strictEqual(crossBank.sufficient, false);
    assert.ok(missingArm.missingArmWindowCount >= 3);
    assert.strictEqual(missingArm.armEvidenceComplete, false);
    assert.ok(unarmed.unarmedWindowCount >= 3);
    assert.strictEqual(unarmed.allPumpWindowsArmed, false);
}

function assertGovernorRequiresExplicitActiveState() {
    const records = [];
    for (let timeUs = 0; timeUs <= 5000000; timeUs += 100000) {
        records.push({
            timeUs,
            targetRpm: 2000,
            actualRpm: 1980,
            collective: 0,
            motorPct: 60
        });
    }

    const result = metrics.summarizeGovernor({
        governorSource: "debug-governor",
        governorEvents: [{ timeUs: 0, state: 2 }],
        governorRecords: records,
        maxTimeUs: 5000000
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.guidanceReason, "insufficient-active-governor-data");
}

function makeEligibleRuleInputs(direction) {
    const axis = function(name) {
        return {
            axis: name,
            available: true,
            all: { sampleCount: 1000, rmsErrorDps: 5, p95AbsErrorDps: 10 },
            commanded: { rmsErrorDps: 8 },
            normalizedCommandedRmse: 0.1
        };
    };
    const snapshot = {
        firmwareType: "Rotorflight",
        firmwareTypeCode: 5,
        firmwareVersion: "4.6.0",
        firmwareRevisionRaw: "Rotorflight 4.6.0 (118e912) STM32F7X2",
        logIndex: 0,
        logMinTimeUs: 0,
        logMaxTimeUs: 10000000,
        minTimeUs: 0,
        maxTimeUs: 10000000,
        durationUs: 10000000,
        poweredDurationUs: 9000000,
        sampleCount: 10000,
        invalidTimeCount: 0,
        invalidRequiredValueCount: 0,
        invalidGovernorValueCount: 0,
        corruptFrames: 0,
        discontinuities: 0,
        hasEndMarker: true,
        endMarkerEvaluable: true,
        poweredSampleCount: 10000,
        safetySampleCoverage: {
            failsafePhase: { valid: 10000, missing: 0 },
            rxSignalReceived: { valid: 10000, missing: 0 },
            rxFlightChannelsValid: { valid: 10000, missing: 0 },
            flightModeFlags: { valid: 10000, missing: 0 },
            battery: { valid: 10000, missing: 0 }
        },
        failsafeSampleCount: 0,
        rxLossSampleCount: 0,
        invalidRxChannelsSampleCount: 0,
        unsafeFlightModeSampleCount: 0,
        numericPlausibilityViolationCount: 0,
        batteryConfigurationStatus: "accepted",
        loggingRateConfigurationStatus: "accepted",
        selectedDataFingerprint: "sel-test-10000",
        safetyEventCodes: [],
        configurationWarnings: [],
        coverage: {
            setpointAxes: [true, true, true],
            gyroAxes: [true, true, true],
            battery: true,
            batteryConfiguration: true,
            collective: true,
            collectiveRange: true,
            mainMotor: true,
            failsafePhase: true,
            flightModeFlags: true,
            rxHealth: true,
            governor: true,
            governorRequest: true,
            governorTarget: true,
            governorActual: true
        },
        debugName: "GOVERNOR",
        governorSource: "named",
        governorConfiguration: {
            pGain: 10,
            iGain: 20,
            dGain: 0,
            fGain: 100,
            masterGain: 50,
            ttaGain: 0,
            ttaLimit: 20,
            collectiveRange: [-1000, 1000],
            maxThrottlePercent: 90,
            maxThrottleSource: "user-provided-current-profile",
            maxThrottleInputStatus: "accepted",
            govPidLogged: true,
            ttaLogged: true,
            collectiveRangeLogged: true
        }
    };
    const measurement = {
        quality: {
            sampleRateHz: 1000,
            effectiveSampleRateHz: 999.9,
            medianFrameIntervalUs: 1000,
            p99FrameIntervalUs: 1000,
            maximumFrameIntervalUs: 1000,
            frameIntervalJitterRatio: 1,
            timingCoverageRatio: 1
        },
        tracking: [axis("roll"), axis("pitch"), axis("yaw")],
        battery: {
            available: true,
            belowConfiguredWarning: false,
            cellCount: 6,
            minimumVolts: 23,
            maximumVolts: 25,
            minimumCellVolts: 3.83,
            warningCellVolts: 3.5
        },
        governor: {
            available: true,
            source: "named",
            explicitActiveEventWithinRange: true,
            stateSequenceSafe: true,
            eventsComplete: true,
            fullRateRecords: true,
            targetRpm: 2000,
            actualRpm: 1950,
            rmseRpm: 80,
            maxDroopRpm: 150,
            maxOvershootRpm: 20,
            motorP95Pct: 75,
            motorCeilingPercent: 90,
            motorHeadroomPercent: 15,
            headroomSufficient: true,
            pitchPumps: {
                sufficient: true,
                candidateCount: 4,
                eligibleCount: 4,
                truncatedWindowCount: 0,
                overlappingWindowCount: 0,
                unstableTargetWindowCount: 0,
                targetStable: true,
                missingRequestWindowCount: 0,
                unstableRequestWindowCount: 0,
                requestEvidenceAvailable: true,
                requestStable: true,
                missingArmWindowCount: 0,
                unarmedWindowCount: 0,
                armEvidenceComplete: true,
                allPumpWindowsArmed: true,
                crossPumpHeadSpeedStable: true,
                windowEvaluationLimitReached: false,
                droopCount: direction === "increase" ? 4 : 0,
                overshootCount: direction === "decrease" ? 4 : 0,
                direction,
                headroomSufficient: true,
                tailEvidenceAvailable: true,
                tailDegradationDetected: false,
                tailStable: true,
                windows: [{
                    baselineStartTimeUs: 750000,
                    startTimeUs: 1000000,
                    endTimeUs: 1800000,
                    classification: direction === "increase" ? "droop" : "overshoot",
                    motorHeadroomPct: 15,
                    baselineYawRmsDps: 3,
                    responseYawRmsDps: 4
                }]
            }
        }
    };

    return { snapshot, measurement };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function allConfirmations(configurationKey) {
    return {
        sessionId: "advisor-test-session",
        configurationKey,
        mechanicalInspection: true,
        powerSystemHealthy: true,
        rpmAndGearingVerified: true,
        correctProfileVerified: true,
        officialTestSetup: true,
        safePitchPumps: true
    };
}

async function analyzeSyntheticWithFreshConfirmations(flightLog, selectedRange, userInputs) {
    const settings = {
        timeRangeUs: selectedRange,
        userInputs: userInputs || { governorMaxThrottlePct: 90 },
        isCancelled: function() { return false; }
    };
    const first = await engine.analyzeFlightLog(flightLog, settings);
    return engine.analyzeFlightLog(flightLog, Object.assign({}, settings, {
        confirmations: allConfirmations(
            first.governor.recommendationGate.configurationKey
        )
    }));
}

function buildConfirmedRuleResult(snapshot, measurement, confirmationMutator) {
    const initial = rules.buildEvidencePackage(snapshot, measurement, null);
    const confirmations = allConfirmations(
        initial.governor.recommendationGate.configurationKey
    );
    if (confirmationMutator) {
        confirmationMutator(confirmations);
    }
    return rules.buildEvidencePackage(snapshot, measurement, confirmations);
}

function assertGovernorRecommendationTruthTable() {
    [
        { direction: "increase", expected: 110, delta: 10, reason: "CONSISTENT_DROOP" },
        { direction: "decrease", expected: 90, delta: -10, reason: "CONSISTENT_OVERSHOOT" }
    ].forEach(function(testCase) {
        const input = makeEligibleRuleInputs(testCase.direction);
        const result = buildConfirmedRuleResult(input.snapshot, input.measurement);
        const recommendation = result.governor.recommendation;

        assert.strictEqual(result.schemaVersion, 3);
        assert.strictEqual(result.capabilities.settingDirectionAdvice, true);
        assert.strictEqual(result.capabilities.directSettingWrites, false);
        assert.strictEqual(result.governor.recommendationGate.status, "eligible");
        assert.strictEqual(result.governor.recommendationGate.firmwareBuildVerified, true);
        assert.deepStrictEqual(result.log.firmwareBuild, {
            verified: true,
            shortRevision: "118e912",
            raw: "Rotorflight 4.6.0 (118e912) STM32F7X2"
        });
        assert.strictEqual(recommendation.kind, "next-controlled-test");
        assert.strictEqual(recommendation.experimental, true);
        assert.strictEqual(recommendation.setting, "gov_f_gain");
        assert.strictEqual(recommendation.currentValue, 100);
        assert.strictEqual(recommendation.proposedValue, testCase.expected);
        assert.strictEqual(recommendation.rollbackValue, 100);
        assert.strictEqual(recommendation.delta, testCase.delta);
        assert.strictEqual(recommendation.reasonCode, testCase.reason);
        assert.deepStrictEqual(recommendation.reasonCodes, [testCase.reason]);
        assert.deepStrictEqual(recommendation.prerequisiteIds, [
            "mechanicalInspection",
            "powerSystemHealthy",
            "rpmAndGearingVerified",
            "correctProfileVerified",
            "officialTestSetup",
            "safePitchPumps"
        ]);
        assert.strictEqual(recommendation.directWriteAllowed, false);
        assert.strictEqual(recommendation.validationRequired, true);
        assert.strictEqual(recommendation.finalTuneClaim, false);
        assert.deepStrictEqual(recommendation.sourceIds, ["rotorflight-governor-tuning"]);
        assert.deepStrictEqual(recommendation.provenance, {
            analysisMode: "deterministic-local",
            ruleset: "rotorlens-governor-f-next-test-v1",
            firmwareShortRevision: "118e912",
            selectedRangeOnly: true
        });
        recommendation.evidenceIds.forEach(function(evidenceId) {
            const item = result.evidence.find(function(candidate) {
                return candidate.id === evidenceId;
            });
            assert.ok(item, evidenceId);
            assert.ok(Array.isArray(item.timeRangeUs), evidenceId);
            assert.ok(item.timeRangeUs[0] >= result.range.startTimeUs, evidenceId);
            assert.ok(item.timeRangeUs[1] <= result.range.endTimeUs, evidenceId);
            assert.ok(item.timeRangeUs[0] < item.timeRangeUs[1], evidenceId);
        });
        assert.ok(result.findings.some(function(item) {
            return item.id === "governor-f-next-controlled-test";
        }));
    });

    const base = makeEligibleRuleInputs("increase");
    const cases = [
        ["UNSUPPORTED_FIRMWARE", function(s) { s.firmwareVersion = "4.7.0"; }],
        ["UNVERIFIED_FIRMWARE_BUILD", function(s) {
            s.firmwareRevisionRaw = "Rotorflight 4.6.0 (abcdef1) STM32F7X2";
        }],
        ["UNVERIFIED_FIRMWARE_BUILD", function(s) {
            s.firmwareRevisionRaw = "Rotorflight 4.6.0 (norevision) STM32F7X2";
        }],
        ["UNVERIFIED_FIRMWARE_BUILD", function(s) {
            s.firmwareRevisionRaw = "Rotorflight 4.6.0-rc1 (118e912) STM32F7X2";
        }],
        ["UNVERIFIED_FIRMWARE_BUILD", function(s) { s.firmwareRevisionRaw = null; }],
        ["SAMPLE_RATE_UNAVAILABLE", null, function(m) { m.quality.sampleRateHz = null; }],
        ["SAMPLE_RATE_BELOW_900_HZ", null, function(m) { m.quality.sampleRateHz = 899; }],
        ["EFFECTIVE_SAMPLE_RATE_BELOW_900_HZ", null, function(m) {
            m.quality.effectiveSampleRateHz = 899;
        }],
        ["TIMING_P99_TOO_HIGH", null, function(m) {
            m.quality.p99FrameIntervalUs = 1501;
        }],
        ["MAX_FRAME_INTERVAL_TOO_HIGH", null, function(m) {
            m.quality.maximumFrameIntervalUs = 5001;
        }],
        ["TIMING_JITTER_TOO_HIGH", null, function(m) {
            m.quality.frameIntervalJitterRatio = 1.51;
        }],
        ["TIMING_COVERAGE_INCOMPLETE", null, function(m) {
            m.quality.timingCoverageRatio = 0.979;
        }],
        ["POWERED_DURATION_TOO_SHORT", function(s) { s.poweredDurationUs = 4000000; }],
        ["SELECTED_RANGE_NOT_CLEAN", function(s) { s.discontinuities = 1; }],
        ["NON_MONOTONIC_TIMESTAMP_IN_SELECTION", function(s) {
            s.invalidTimeCount = 1;
        }],
        ["GOVERNOR_NUMERIC_VALUES_IMPLAUSIBLE", function(s) {
            s.numericPlausibilityViolationCount = 1;
        }],
        ["GOVERNOR_VALUES_INVALID_IN_SELECTION", function(s) {
            s.invalidGovernorValueCount = 1;
        }],
        ["LOGGING_HEADER_INCOMPLETE", function(s) { s.configurationWarnings = ["missing"]; }],
        ["REQUIRED_GOVERNOR_FIELDS_MISSING", function(s) { s.coverage.governorRequest = false; }],
        ["COLLECTIVE_FIELD_MISSING", function(s) { s.coverage.collective = false; }],
        ["COLLECTIVE_RANGE_HEADER_MISSING", function(s) { s.coverage.collectiveRange = false; }],
        ["MAIN_MOTOR_FIELD_MISSING", function(s) { s.coverage.mainMotor = false; }],
        ["FAILSAFE_FIELD_MISSING", function(s) { s.coverage.failsafePhase = false; }],
        ["FLIGHT_MODE_FIELD_MISSING", function(s) { s.coverage.flightModeFlags = false; }],
        ["RX_FIELDS_MISSING", function(s) { s.coverage.rxHealth = false; }],
        ["BATTERY_FIELD_MISSING", function(s) { s.coverage.battery = false; }],
        ["BATTERY_CONFIGURATION_HEADER_MISSING", function(s) {
            s.coverage.batteryConfiguration = false;
        }],
        ["BATTERY_CONFIGURATION_INVALID", function(s) {
            s.batteryConfigurationStatus = "invalid";
        }],
        ["TAIL_FIELDS_MISSING", function(s) { s.coverage.gyroAxes[2] = false; }],
        ["RX_SAFETY_BLOCKER", function(s) { s.failsafeSampleCount = 1; }],
        ["FAILSAFE_SAMPLES_INCOMPLETE", function(s) {
            s.safetySampleCoverage.failsafePhase = { valid: 9999, missing: 1 };
        }],
        ["RX_SIGNAL_SAMPLES_INCOMPLETE", function(s) {
            s.safetySampleCoverage.rxSignalReceived = { valid: 9999, missing: 1 };
        }],
        ["RX_CHANNEL_SAMPLES_INCOMPLETE", function(s) {
            s.safetySampleCoverage.rxFlightChannelsValid = { valid: 9999, missing: 1 };
        }],
        ["FLIGHT_MODE_SAMPLES_INCOMPLETE", function(s) {
            s.safetySampleCoverage.flightModeFlags = { valid: 9999, missing: 1 };
        }],
        ["BATTERY_SAMPLES_INCOMPLETE", function(s) {
            s.safetySampleCoverage.battery = { valid: 9999, missing: 1 };
        }],
        ["BATTERY_SAFETY_UNKNOWN", null, function(m) {
            m.battery.minimumCellVolts = null;
            m.battery.warningCellVolts = null;
            m.battery.belowConfiguredWarning = null;
        }],
        ["BATTERY_SAFETY_BLOCKER", null, function(m) { m.battery.belowConfiguredWarning = true; }],
        ["UNSAFE_FLIGHT_MODE_IN_SELECTION", function(s) { s.unsafeFlightModeSampleCount = 1; }],
        ["INFLIGHT_ADJUSTMENT_IN_SELECTION", function(s) {
            s.safetyEventCodes = ["INFLIGHT_ADJUSTMENT_IN_SELECTION"];
        }],
        ["ACTIVE_EVENT_MISSING_IN_SELECTION", null, function(m) {
            m.governor.explicitActiveEventWithinRange = false;
        }],
        ["GOVERNOR_STATE_SEQUENCE_UNSAFE", null, function(m) {
            m.governor.stateSequenceSafe = false;
        }],
        ["GOVERNOR_EVENTS_TRUNCATED", null, function(m) {
            m.governor.eventsComplete = false;
        }],
        ["GOVERNOR_ACTIVE_DATA_INSUFFICIENT", null, function(m) {
            m.governor.available = false;
        }],
        ["GOVERNOR_RECORDS_NOT_FULL_RATE", null, function(m) {
            m.governor.fullRateRecords = false;
        }],
        ["GOVERNOR_SETTINGS_MISSING_OR_INVALID", function(s) {
            s.governorConfiguration.govPidLogged = false;
        }],
        ["CONSERVATIVE_F_TEST_PID_BASELINE_REQUIRED", function(s) {
            s.governorConfiguration.pGain = 11;
        }],
        ["GOVERNOR_TTA_MISSING_OR_INVALID", function(s) {
            s.governorConfiguration.ttaLogged = false;
        }],
        ["GOVERNOR_TTA_MUST_BE_ZERO", function(s) {
            s.governorConfiguration.ttaGain = 1;
        }],
        ["GOVERNOR_MAX_THROTTLE_REQUIRED", function(s) {
            s.governorConfiguration.maxThrottlePercent = null;
            s.governorConfiguration.maxThrottleInputStatus = "missing";
        }],
        ["GOVERNOR_MAX_THROTTLE_INVALID", function(s) {
            s.governorConfiguration.maxThrottlePercent = null;
            s.governorConfiguration.maxThrottleInputStatus = "invalid";
        }],
        ["TRUNCATED_PUMP_WINDOW_IN_SELECTION", null, function(m) {
            m.governor.pitchPumps.truncatedWindowCount = 1;
        }],
        ["OVERLAPPING_PUMP_WINDOWS", null, function(m) {
            m.governor.pitchPumps.overlappingWindowCount = 1;
        }],
        ["GOVERNOR_REQUEST_EVIDENCE_INCOMPLETE", null, function(m) {
            m.governor.pitchPumps.requestEvidenceAvailable = false;
        }],
        ["GOVERNOR_REQUEST_UNSTABLE", null, function(m) {
            m.governor.pitchPumps.requestStable = false;
        }],
        ["ARM_EVIDENCE_INCOMPLETE", null, function(m) {
            m.governor.pitchPumps.armEvidenceComplete = false;
        }],
        ["UNARMED_PUMP_WINDOW", null, function(m) {
            m.governor.pitchPumps.allPumpWindowsArmed = false;
        }],
        ["CROSS_PUMP_HEADSPEED_INCONSISTENT", null, function(m) {
            m.governor.pitchPumps.crossPumpHeadSpeedStable = false;
        }],
        ["PUMP_WINDOW_EVALUATION_LIMIT_REACHED", null, function(m) {
            m.governor.pitchPumps.windowEvaluationLimitReached = true;
        }],
        ["GOVERNOR_TARGET_UNSTABLE", null, function(m) {
            m.governor.pitchPumps.unstableTargetWindowCount = 1;
            m.governor.pitchPumps.targetStable = false;
        }],
        ["INSUFFICIENT_PITCH_PUMPS", null, function(m) {
            m.governor.pitchPumps.candidateCount = 2;
            m.governor.pitchPumps.eligibleCount = 2;
            m.governor.pitchPumps.sufficient = false;
        }],
        ["INCONSISTENT_PITCH_PUMPS", null, function(m) {
            m.governor.pitchPumps.sufficient = false;
            m.governor.pitchPumps.direction = null;
        }],
        ["MOTOR_HEADROOM_INSUFFICIENT", null, function(m) {
            m.governor.pitchPumps.headroomSufficient = false;
        }],
        ["TAIL_EVIDENCE_INCOMPLETE", null, function(m) {
            m.governor.pitchPumps.tailEvidenceAvailable = false;
        }],
        ["TAIL_RESPONSE_DEGRADED", null, function(m) {
            m.governor.pitchPumps.tailDegradationDetected = true;
            m.governor.pitchPumps.tailStable = false;
        }],
        ["TAIL_TEST_NOT_CONTROLLED", null, function(m) {
            m.governor.pitchPumps.tailStable = false;
        }]
    ];

    cases.forEach(function(testCase) {
        const snapshot = clone(base.snapshot);
        const measurement = clone(base.measurement);
        if (testCase[1]) {
            testCase[1](snapshot);
        }
        if (testCase[2]) {
            testCase[2](measurement);
        }
        const result = buildConfirmedRuleResult(snapshot, measurement);
        assert.strictEqual(result.governor.recommendation, null, testCase[0]);
        assert.ok(
            result.governor.recommendationGate.reasonCodes.includes(testCase[0]),
            testCase[0]
        );
    });

    const noConfirmation = rules.buildEvidencePackage(base.snapshot, base.measurement, null);
    assert.strictEqual(noConfirmation.governor.recommendation, null);
    assert.ok(noConfirmation.governor.recommendationGate.reasonCodes.includes(
        "CONFIRMATION_CONTEXT_REQUIRED"
    ));
    const staleConfirmation = buildConfirmedRuleResult(
        base.snapshot,
        base.measurement,
        function(confirmations) { confirmations.configurationKey = "stale"; }
    );
    assert.ok(staleConfirmation.governor.recommendationGate.reasonCodes.includes(
        "CONFIRMATION_CONTEXT_MISMATCH"
    ));
    const missingSession = buildConfirmedRuleResult(
        base.snapshot,
        base.measurement,
        function(confirmations) { delete confirmations.sessionId; }
    );
    assert.ok(missingSession.governor.recommendationGate.reasonCodes.includes(
        "CONFIRMATION_SESSION_REQUIRED"
    ));
    const missingMechanical = buildConfirmedRuleResult(
        base.snapshot,
        base.measurement,
        function(confirmations) { confirmations.mechanicalInspection = false; }
    );
    assert.ok(missingMechanical.governor.recommendationGate.reasonCodes.includes(
        "CONFIRMATION_MECHANICAL_INSPECTION_REQUIRED"
    ));

    const upperLimit = clone(base.snapshot);
    upperLimit.governorConfiguration.fGain = 245;
    const upperResult = buildConfirmedRuleResult(upperLimit, clone(base.measurement));
    assert.strictEqual(upperResult.governor.recommendation, null);
    assert.ok(upperResult.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_F_FULL_STEP_OUT_OF_RANGE"
    ));
    const lowerInputs = makeEligibleRuleInputs("decrease");
    lowerInputs.snapshot.governorConfiguration.fGain = 5;
    const lowerResult = buildConfirmedRuleResult(lowerInputs.snapshot, lowerInputs.measurement);
    assert.strictEqual(lowerResult.governor.recommendation, null);
    assert.ok(lowerResult.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_F_FULL_STEP_OUT_OF_RANGE"
    ));

}

async function assertCancellation() {
    let error = null;
    try {
        await engine.analyzeFlightLog({}, {
            isCancelled: function() { return true; }
        });
    } catch (caught) {
        error = caught;
    }

    assert.ok(error);
    assert.strictEqual(error.code, "ANALYSIS_CANCELLED");
}

async function assertRangeRejected(flightLog, timeRangeUs, expectedCode) {
    let error = null;
    try {
        await engine.analyzeFlightLog(flightLog, {
            timeRangeUs,
            isCancelled: function() { return false; }
        });
    } catch (caught) {
        error = caught;
    }

    assert.ok(error);
    assert.strictEqual(error.code, expectedCode);
}

async function assertGapBoundaryScoping() {
    const chunk = {
        index: 0,
        frames: [[0, 100000, 500], [0, 150000, 500]],
        events: [{ event: 13, time: 25000, data: {} }],
        gapStartsHere: { 0: true }
    };
    const flightLog = {
        getMinTime: function() { return 0; },
        getMaxTime: function() { return 200000; },
        getSysConfig: function() {
            return {
                firmwareType: 5,
                firmwareVersion: "4.3.0",
                debug_mode: 0,
                looptime: 1000,
                frameIntervalPNum: 1,
                frameIntervalPDenom: 1
            };
        },
        getMainFieldIndexByName: function(name) {
            if (name === "time") {
                return 1;
            }
            if (name === "flightModeFlags") {
                return 0;
            }
            return name === "motor[0]" ? 2 : undefined;
        },
        getChunksInTimeRange: function() { return [chunk]; },
        getLogIndex: function() { return 0; },
        getNumCellsEstimate: function() { return false; },
        rcMotorRawToPct: function(value) { return value / 10; }
    };

    const gapOutsideRange = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: { startTimeUs: 50000, endTimeUs: 125000 },
        isCancelled: function() { return false; }
    });
    assert.strictEqual(
        gapOutsideRange.quality.discontinuities,
        0,
        "A gap whose resumed frame lies after Out must not be attributed to the selected range"
    );
    assert.ok(!gapOutsideRange.governor.recommendationGate.reasonCodes.includes(
        "INFLIGHT_ADJUSTMENT_IN_SELECTION"
    ));

    const gapInsideRange = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: { startTimeUs: 50000, endTimeUs: 175000 },
        isCancelled: function() { return false; }
    });
    assert.strictEqual(
        gapInsideRange.quality.discontinuities,
        1,
        "A gap with both boundary frames inside I/O must remain visible"
    );

    const eventInsideRange = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: { startTimeUs: 10000, endTimeUs: 125000 },
        isCancelled: function() { return false; }
    });
    assert.ok(eventInsideRange.governor.recommendationGate.reasonCodes.includes(
        "INFLIGHT_ADJUSTMENT_IN_SELECTION"
    ));

    chunk.frames[0][0] = 1 << 23;
    const unsafeFrameRange = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: { startTimeUs: 50000, endTimeUs: 125000 },
        isCancelled: function() { return false; }
    });
    assert.ok(unsafeFrameRange.governor.recommendationGate.reasonCodes.includes(
        "UNSAFE_FLIGHT_MODE_IN_SELECTION"
    ));
    chunk.frames[0][0] = 0;
}

function makeSyntheticGovernorFlightLog(inheritedHeaders, overrides) {
    const settings = Object.assign({
        pumpStarts: [1000000, 2200000, 3400000, 4600000]
    }, overrides);
    const fields = [
        "time",
        "setpoint[0]",
        "setpoint[1]",
        "setpoint[2]",
        "setpoint[3]",
        "gyroADC[0]",
        "gyroADC[1]",
        "gyroADC[2]",
        "Vbat",
        "headspeed",
        "motor[0]",
        "failsafePhase",
        "rxSignalReceived",
        "rxFlightChannelsValid",
        "flightModeFlags",
        "govRequest",
        "govTarget"
    ];
    const fieldMap = Object.create(null);
    fields.forEach(function(name, index) { fieldMap[name] = index; });
    const inherited = {
        govPID: [10, 20, 0, 100, 50],
        yaw_tta: [0, 20],
        collectiveRange: [-1000, 1000],
        vbatref: 2400,
        vbatmincellvoltage: 330,
        vbatwarningcellvoltage: 350,
        vbatmaxcellvoltage: 435
    };
    const sysConfig = inheritedHeaders ? Object.create(inherited) : {};
    Object.assign(sysConfig, {
        firmwareType: 5,
        firmwareVersion: "4.6.0",
        "Firmware revision": "Rotorflight 4.6.0 (118e912) STM32F7X2",
        debug_mode: 31,
        fields_mask: 0,
        looptime: 1000,
        frameIntervalPNum: 1,
        frameIntervalPDenom: 1
    });
    if (!inheritedHeaders) {
        Object.assign(sysConfig, inherited);
    }

    const pumpStarts = settings.pumpStarts;
    const frames = [];
    for (let timeUs = 0; timeUs <= 6000000; timeUs += 1000) {
        let collective = 0;
        let headspeed = 2000;
        let yawError = 3;
        pumpStarts.forEach(function(startUs) {
            if (timeUs >= startUs && timeUs <= startUs + 450000) {
                collective = 800;
                if (timeUs >= startUs + 50000) {
                    headspeed = 1880;
                    yawError = 4;
                }
            }
        });
        const frame = new Array(fields.length).fill(0);
        frame[fieldMap.time] = timeUs;
        frame[fieldMap["setpoint[3]"]] = collective;
        frame[fieldMap["gyroADC[2]"]] = -yawError;
        frame[fieldMap.Vbat] = 2400;
        frame[fieldMap.headspeed] = headspeed;
        frame[fieldMap["motor[0]"]] = 720;
        frame[fieldMap.failsafePhase] = 0;
        frame[fieldMap.rxSignalReceived] = 1;
        frame[fieldMap.rxFlightChannelsValid] = 1;
        frame[fieldMap.flightModeFlags] = 1;
        frame[fieldMap.govRequest] = 2000;
        frame[fieldMap.govTarget] = 2000;
        frames.push(frame);
    }
    const chunk = {
        index: 0,
        frames,
        events: [
            { event: 50, time: 0, data: { govState: 2 } },
            { event: 50, time: 100000, data: { govState: 4 } }
        ],
        gapStartsHere: {}
    };

    return {
        _testFrames: frames,
        _testFieldMap: fieldMap,
        _testSysConfig: sysConfig,
        getMinTime: function() { return 0; },
        getMaxTime: function() { return 6000000; },
        getSysConfig: function() { return sysConfig; },
        getMainFieldIndexByName: function(name) { return fieldMap[name]; },
        getChunksInTimeRange: function() { return [chunk]; },
        getLogIndex: function() { return 0; },
        getNumCellsEstimate: function() { return 6; },
        rcMotorRawToPct: function(value) { return value / 10; }
    };
}

async function assertAdapterGovernorRecommendationContract() {
    const selectedRange = { startTimeUs: 0, endTimeUs: 5800000 };
    const flightLog = makeSyntheticGovernorFlightLog(false);
    const first = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: selectedRange,
        userInputs: { governorMaxThrottlePct: 90 },
        isCancelled: function() { return false; }
    });
    assert.strictEqual(first.governor.recommendation, null);
    assert.ok(first.governor.recommendationGate.reasonCodes.includes(
        "CONFIRMATION_CONTEXT_REQUIRED"
    ));

    const confirmed = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: selectedRange,
        userInputs: { governorMaxThrottlePct: 90 },
        confirmations: allConfirmations(first.governor.recommendationGate.configurationKey),
        isCancelled: function() { return false; }
    });
    assert.strictEqual(confirmed.governor.recommendationGate.status, "eligible");
    assert.strictEqual(confirmed.governor.recommendation.setting, "gov_f_gain");
    assert.strictEqual(confirmed.governor.recommendation.currentValue, 100);
    assert.strictEqual(confirmed.governor.recommendation.proposedValue, 110);
    assert.strictEqual(confirmed.governor.recommendation.delta, 10);
    assert.strictEqual(confirmed.governor.recommendation.directWriteAllowed, false);
    assert.strictEqual(confirmed.range.startTimeUs, selectedRange.startTimeUs);
    assert.strictEqual(confirmed.range.endTimeUs, selectedRange.endTimeUs);
    confirmed.evidence.forEach(function(item) {
        if (!Array.isArray(item.timeRangeUs)) {
            return;
        }
        assert.ok(item.timeRangeUs[0] >= selectedRange.startTimeUs);
        assert.ok(item.timeRangeUs[1] <= selectedRange.endTimeUs);
    });

    const inherited = await engine.analyzeFlightLog(
        makeSyntheticGovernorFlightLog(true),
        {
            timeRangeUs: selectedRange,
            userInputs: { governorMaxThrottlePct: 90 },
            confirmations: {},
            isCancelled: function() { return false; }
        }
    );
    assert.strictEqual(inherited.governor.recommendation, null);
    [
        "GOVERNOR_SETTINGS_MISSING_OR_INVALID",
        "GOVERNOR_TTA_MISSING_OR_INVALID",
        "COLLECTIVE_RANGE_HEADER_MISSING",
        "BATTERY_CONFIGURATION_HEADER_MISSING"
    ].forEach(function(code) {
        assert.ok(inherited.governor.recommendationGate.reasonCodes.includes(code), code);
    });

    const invalidCeiling = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: selectedRange,
        userInputs: { governorMaxThrottlePct: 90.5 },
        confirmations: {},
        isCancelled: function() { return false; }
    });
    assert.ok(invalidCeiling.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_MAX_THROTTLE_INVALID"
    ));

    const missingValueLog = makeSyntheticGovernorFlightLog(false);
    for (let timeUs = 4600000; timeUs <= 5400000; timeUs += 1000) {
        missingValueLog._testFrames[timeUs / 1000][
            missingValueLog._testFieldMap.govTarget
        ] = NaN;
    }
    const missingFirst = await engine.analyzeFlightLog(missingValueLog, {
        timeRangeUs: selectedRange,
        userInputs: { governorMaxThrottlePct: 90 },
        isCancelled: function() { return false; }
    });
    const missingConfirmed = await engine.analyzeFlightLog(missingValueLog, {
        timeRangeUs: selectedRange,
        userInputs: { governorMaxThrottlePct: 90 },
        confirmations: allConfirmations(
            missingFirst.governor.recommendationGate.configurationKey
        ),
        isCancelled: function() { return false; }
    });
    assert.ok(missingConfirmed.governor.pitchPumpCount >= 3);
    assert.strictEqual(missingConfirmed.governor.recommendation, null);
    assert.ok(missingConfirmed.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_VALUES_INVALID_IN_SELECTION"
    ));

    const allNanSafetyLog = makeSyntheticGovernorFlightLog(false);
    allNanSafetyLog._testFrames.forEach(function(frame) {
        ["failsafePhase", "rxSignalReceived", "rxFlightChannelsValid",
            "flightModeFlags", "Vbat"].forEach(function(field) {
            frame[allNanSafetyLog._testFieldMap[field]] = NaN;
        });
    });
    const allNanSafety = await analyzeSyntheticWithFreshConfirmations(
        allNanSafetyLog,
        selectedRange
    );
    assert.strictEqual(allNanSafety.governor.recommendation, null);
    [
        "FAILSAFE_SAMPLES_INCOMPLETE",
        "RX_SIGNAL_SAMPLES_INCOMPLETE",
        "RX_CHANNEL_SAMPLES_INCOMPLETE",
        "FLIGHT_MODE_SAMPLES_INCOMPLETE",
        "BATTERY_SAMPLES_INCOMPLETE",
        "ARM_EVIDENCE_INCOMPLETE"
    ].forEach(function(code) {
        assert.ok(allNanSafety.governor.recommendationGate.reasonCodes.includes(code), code);
    });

    const partialSafetyLog = makeSyntheticGovernorFlightLog(false);
    partialSafetyLog._testFrames.forEach(function(frame, index) {
        if (index % 100 !== 0) {
            return;
        }
        ["failsafePhase", "rxSignalReceived", "rxFlightChannelsValid",
            "flightModeFlags", "Vbat"].forEach(function(field) {
            frame[partialSafetyLog._testFieldMap[field]] = NaN;
        });
    });
    const partialSafety = await analyzeSyntheticWithFreshConfirmations(
        partialSafetyLog,
        selectedRange
    );
    assert.strictEqual(partialSafety.governor.recommendation, null);
    [
        "FAILSAFE_SAMPLES_INCOMPLETE",
        "RX_SIGNAL_SAMPLES_INCOMPLETE",
        "RX_CHANNEL_SAMPLES_INCOMPLETE",
        "FLIGHT_MODE_SAMPLES_INCOMPLETE",
        "BATTERY_SAMPLES_INCOMPLETE"
    ].forEach(function(code) {
        assert.ok(partialSafety.governor.recommendationGate.reasonCodes.includes(code), code);
    });

    const oneBatterySampleLog = makeSyntheticGovernorFlightLog(false);
    oneBatterySampleLog._testFrames.forEach(function(frame) {
        frame[oneBatterySampleLog._testFieldMap.Vbat] = NaN;
    });
    oneBatterySampleLog._testFrames[3000][oneBatterySampleLog._testFieldMap.Vbat] = 2400;
    const oneBatterySample = await analyzeSyntheticWithFreshConfirmations(
        oneBatterySampleLog,
        selectedRange
    );
    assert.strictEqual(oneBatterySample.battery.status, "limited");
    assert.strictEqual(oneBatterySample.governor.recommendation, null);
    assert.ok(oneBatterySample.governor.recommendationGate.reasonCodes.includes(
        "BATTERY_SAMPLES_INCOMPLETE"
    ));

    const isolatedGlitchLog = makeSyntheticGovernorFlightLog(false);
    const syntheticPumpStarts = [1000000, 2200000, 3400000, 4600000];
    isolatedGlitchLog._testFrames.forEach(function(frame) {
        const timeUs = frame[isolatedGlitchLog._testFieldMap.time];
        const inPump = syntheticPumpStarts.some(function(startUs) {
            return timeUs >= startUs && timeUs <= startUs + 450000;
        });
        if (inPump) {
            frame[isolatedGlitchLog._testFieldMap.headspeed] = 2000;
        }
        if (syntheticPumpStarts.some(function(startUs) {
            return timeUs === startUs + 100000;
        })) {
            frame[isolatedGlitchLog._testFieldMap.headspeed] = 1880;
        }
    });
    const isolatedGlitch = await analyzeSyntheticWithFreshConfirmations(
        isolatedGlitchLog,
        selectedRange
    );
    assert.strictEqual(isolatedGlitch.governor.recommendation, null);
    assert.ok(isolatedGlitch.governor.recommendationGate.reasonCodes.includes(
        "INCONSISTENT_PITCH_PUMPS"
    ));

    const droppedTimingLog = makeSyntheticGovernorFlightLog(false);
    for (let index = droppedTimingLog._testFrames.length - 2; index > 0; index--) {
        if (index % 10 === 0) {
            droppedTimingLog._testFrames.splice(index, 1);
        }
    }
    const droppedTiming = await analyzeSyntheticWithFreshConfirmations(
        droppedTimingLog,
        selectedRange
    );
    assert.strictEqual(droppedTiming.governor.recommendation, null);
    assert.ok(
        droppedTiming.governor.recommendationGate.reasonCodes.includes(
            "EFFECTIVE_SAMPLE_RATE_BELOW_900_HZ"
        ) || droppedTiming.governor.recommendationGate.reasonCodes.includes(
            "TIMING_P99_TOO_HIGH"
        ) || droppedTiming.governor.recommendationGate.reasonCodes.includes(
            "TIMING_JITTER_TOO_HIGH"
        )
    );

    const rareGapLog = makeSyntheticGovernorFlightLog(false);
    for (let index = rareGapLog._testFrames.length - 1; index >= 0; index--) {
        const timeUs = rareGapLog._testFrames[index][rareGapLog._testFieldMap.time];
        if (timeUs >= 550000 && timeUs < 570000) {
            rareGapLog._testFrames.splice(index, 1);
        }
    }
    const rareGap = await analyzeSyntheticWithFreshConfirmations(
        rareGapLog,
        selectedRange
    );
    assert.strictEqual(rareGap.governor.recommendation, null);
    assert.ok(rareGap.governor.recommendationGate.reasonCodes.includes(
        "MAX_FRAME_INTERVAL_TOO_HIGH"
    ));

    const earlyPumpLog = makeSyntheticGovernorFlightLog(false, {
        pumpStarts: [610000, 1810000, 3010000, 4210000]
    });
    const earlyPump = await analyzeSyntheticWithFreshConfirmations(
        earlyPumpLog,
        selectedRange
    );
    assert.ok(earlyPump.governor.pitchPumpCount >= 3);
    assert.strictEqual(earlyPump.governor.recommendation, null);
    assert.ok(earlyPump.governor.recommendationGate.reasonCodes.includes(
        "TRUNCATED_PUMP_WINDOW_IN_SELECTION"
    ));

    const unarmedLog = makeSyntheticGovernorFlightLog(false);
    unarmedLog._testFrames.forEach(function(frame) {
        frame[unarmedLog._testFieldMap.flightModeFlags] = 0;
    });
    const unarmedResult = await analyzeSyntheticWithFreshConfirmations(
        unarmedLog,
        selectedRange
    );
    assert.strictEqual(unarmedResult.governor.recommendation, null);
    assert.ok(unarmedResult.governor.recommendationGate.reasonCodes.includes(
        "UNARMED_PUMP_WINDOW"
    ));

    const invalidSafetyDomainLog = makeSyntheticGovernorFlightLog(false);
    invalidSafetyDomainLog._testFrames[2500][
        invalidSafetyDomainLog._testFieldMap.rxSignalReceived
    ] = 2;
    invalidSafetyDomainLog._testFrames[2501][
        invalidSafetyDomainLog._testFieldMap.rxFlightChannelsValid
    ] = -1;
    invalidSafetyDomainLog._testFrames[2502][
        invalidSafetyDomainLog._testFieldMap.flightModeFlags
    ] = 1.5;
    invalidSafetyDomainLog._testFrames[2503][
        invalidSafetyDomainLog._testFieldMap.failsafePhase
    ] = 7;
    const invalidSafetyDomain = await analyzeSyntheticWithFreshConfirmations(
        invalidSafetyDomainLog,
        selectedRange
    );
    assert.strictEqual(invalidSafetyDomain.governor.recommendation, null);
    [
        "FAILSAFE_SAMPLES_INCOMPLETE",
        "RX_SIGNAL_SAMPLES_INCOMPLETE",
        "RX_CHANNEL_SAMPLES_INCOMPLETE",
        "FLIGHT_MODE_SAMPLES_INCOMPLETE"
    ].forEach(function(code) {
        assert.ok(
            invalidSafetyDomain.governor.recommendationGate.reasonCodes.includes(code),
            code
        );
    });

    const duplicateTimeLog = makeSyntheticGovernorFlightLog(false);
    duplicateTimeLog._testFrames.splice(
        2001,
        0,
        duplicateTimeLog._testFrames[2000].slice()
    );
    const duplicateTime = await analyzeSyntheticWithFreshConfirmations(
        duplicateTimeLog,
        selectedRange
    );
    assert.strictEqual(duplicateTime.governor.recommendation, null);
    assert.ok(duplicateTime.governor.recommendationGate.reasonCodes.includes(
        "NON_MONOTONIC_TIMESTAMP_IN_SELECTION"
    ));

    const invalidNumericLog = makeSyntheticGovernorFlightLog(false);
    invalidNumericLog._testFrames[2500][invalidNumericLog._testFieldMap["motor[0]"]] = 1200;
    invalidNumericLog._testFrames[2501][invalidNumericLog._testFieldMap.govRequest] = 60000;
    invalidNumericLog._testFrames[2502][invalidNumericLog._testFieldMap["setpoint[3]"]] = 2000;
    const invalidNumeric = await analyzeSyntheticWithFreshConfirmations(
        invalidNumericLog,
        selectedRange
    );
    assert.strictEqual(invalidNumeric.governor.recommendation, null);
    assert.ok(invalidNumeric.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_NUMERIC_VALUES_IMPLAUSIBLE"
    ));

    const invalidGainLog = makeSyntheticGovernorFlightLog(false);
    invalidGainLog._testSysConfig.govPID = [10, 20, 0, 100.5, 50];
    const invalidGain = await analyzeSyntheticWithFreshConfirmations(
        invalidGainLog,
        selectedRange
    );
    assert.ok(invalidGain.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_NUMERIC_VALUES_IMPLAUSIBLE"
    ));

    const invalidBatteryHeaderLog = makeSyntheticGovernorFlightLog(false);
    invalidBatteryHeaderLog._testSysConfig.vbatwarningcellvoltage = 500;
    const invalidBatteryHeader = await analyzeSyntheticWithFreshConfirmations(
        invalidBatteryHeaderLog,
        selectedRange
    );
    assert.ok(invalidBatteryHeader.governor.recommendationGate.reasonCodes.includes(
        "BATTERY_CONFIGURATION_INVALID"
    ));

    const invalidTimingHeaderLog = makeSyntheticGovernorFlightLog(false);
    invalidTimingHeaderLog._testSysConfig.looptime = 0;
    const invalidTimingHeader = await analyzeSyntheticWithFreshConfirmations(
        invalidTimingHeaderLog,
        selectedRange
    );
    assert.ok(invalidTimingHeader.governor.recommendationGate.reasonCodes.includes(
        "LOGGING_HEADER_INCOMPLETE"
    ));

    const inheritedTimingLog = makeSyntheticGovernorFlightLog(false);
    const inheritedTiming = {
        looptime: inheritedTimingLog._testSysConfig.looptime,
        frameIntervalPNum: inheritedTimingLog._testSysConfig.frameIntervalPNum,
        frameIntervalPDenom: inheritedTimingLog._testSysConfig.frameIntervalPDenom
    };
    delete inheritedTimingLog._testSysConfig.looptime;
    delete inheritedTimingLog._testSysConfig.frameIntervalPNum;
    delete inheritedTimingLog._testSysConfig.frameIntervalPDenom;
    Object.setPrototypeOf(inheritedTimingLog._testSysConfig, inheritedTiming);
    const inheritedTimingResult = await analyzeSyntheticWithFreshConfirmations(
        inheritedTimingLog,
        selectedRange
    );
    assert.ok(inheritedTimingResult.governor.recommendationGate.reasonCodes.includes(
        "LOGGING_HEADER_INCOMPLETE"
    ));

    assert.strictEqual(
        first.governor.recommendationGate.configurationKey,
        confirmed.governor.recommendationGate.configurationKey
    );
    const changedDataLog = makeSyntheticGovernorFlightLog(false);
    changedDataLog._testFrames[2500][changedDataLog._testFieldMap.govTarget] = 2001;
    const changedData = await engine.analyzeFlightLog(changedDataLog, {
        timeRangeUs: selectedRange,
        userInputs: { governorMaxThrottlePct: 90 },
        confirmations: allConfirmations(
            first.governor.recommendationGate.configurationKey
        ),
        isCancelled: function() { return false; }
    });
    assert.notStrictEqual(
        changedData.governor.recommendationGate.configurationKey,
        first.governor.recommendationGate.configurationKey
    );
    assert.ok(changedData.governor.recommendationGate.reasonCodes.includes(
        "CONFIRMATION_CONTEXT_MISMATCH"
    ));
}

async function assertRotorflightFixture() {
    const fixturePath = path.join(
        repositoryRoot,
        "test/fixtures/third-party/propwash/LOG246.TXT"
    );
    const fixture = fs.readFileSync(fixturePath);
    const checksum = crypto.createHash("sha256").update(fixture).digest("hex");
    assert.strictEqual(
        checksum,
        "d7d2861e1823ef6b60783517a60cd84a1f9b1ca7a127cdd2dfbb0a11ed0f9cc8"
    );

    const runtime = loadParserRuntime();
    const flightLog = new runtime.FlightLog(Uint8Array.from(fixture));
    assert.strictEqual(flightLog.openLog(0), true);

    const logMinTimeUs = flightLog.getMinTime();
    const logMaxTimeUs = flightLog.getMaxTime();
    await assertRangeRejected(flightLog, null, "ANALYSIS_RANGE_REQUIRED");
    await assertRangeRejected(
        flightLog,
        { startTimeUs: logMinTimeUs },
        "ANALYSIS_RANGE_REQUIRED"
    );
    await assertRangeRejected(
        flightLog,
        { startTimeUs: logMinTimeUs + 1000000, endTimeUs: logMinTimeUs + 1000000 },
        "ANALYSIS_RANGE_INVALID"
    );
    await assertRangeRejected(
        flightLog,
        { startTimeUs: logMinTimeUs + 2000000, endTimeUs: logMinTimeUs + 1000000 },
        "ANALYSIS_RANGE_INVALID"
    );
    await assertRangeRejected(
        flightLog,
        { startTimeUs: logMinTimeUs - 1, endTimeUs: logMinTimeUs + 6000000 },
        "ANALYSIS_RANGE_INVALID"
    );

    const selectedRange = {
        startTimeUs: logMinTimeUs + 6000000,
        endTimeUs: Math.min(logMaxTimeUs, logMinTimeUs + 18000000)
    };

    const progress = [];
    const result = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: selectedRange,
        isCancelled: function() { return false; },
        onProgress: function(update) { progress.push(update); }
    });

    assert.strictEqual(result.schemaVersion, 3);
    assert.strictEqual(result.analysisMode, "deterministic-local");
    assert.strictEqual(result.capabilities.cloudRequired, false);
    assert.strictEqual(result.capabilities.directSettingWrites, false);
    assert.strictEqual(result.capabilities.settingDirectionAdvice, true);
    assert.strictEqual(result.capabilities.selectedRangeRequired, true);
    assert.strictEqual(result.capabilities.rawLogIncluded, false);
    assert.ok(["blocked", "limited", "supported"].includes(result.grade.overall));
    assert.ok(!JSON.stringify(result.grade).match(/"[ACF]"/));
    assert.strictEqual(result.log.firmwareType, "Rotorflight");
    assert.strictEqual(result.log.firmwareVersion, "4.3.0");
    assert.strictEqual(result.range.startTimeUs, selectedRange.startTimeUs);
    assert.strictEqual(result.range.endTimeUs, selectedRange.endTimeUs);
    assert.strictEqual(result.range.durationUs, 12000000);
    assert.ok(result.range.sampleCount > 5000 && result.range.sampleCount < 7000);
    assert.ok(result.range.sampleRateHz > 490 && result.range.sampleRateHz < 510);
    assert.ok(result.range.sampleCount < 9377, "Only the selected subset may be scanned");
    assert.strictEqual(result.quality.corruptFrames, null);
    assert.strictEqual(result.quality.discontinuities, 0);
    assert.strictEqual(result.quality.missingEndMarker, null);
    assert.strictEqual(result.tracking.status, "available");
    assert.deepStrictEqual(
        result.tracking.axes.map(function(axis) { return axis.axis; }),
        ["roll", "pitch", "yaw"]
    );
    assert.strictEqual(result.coverage.debugMode, "GOVERNOR");
    assert.strictEqual(result.governor.source, "debug-governor");
    assert.ok(result.governor.targetRpm > 0);
    assert.ok(result.governor.rmseRpm >= 0);
    assert.strictEqual(result.governor.recommendation, null);
    assert.strictEqual(result.governor.recommendationGate.status, "withheld");
    assert.ok(result.governor.recommendationGate.reasonCodes.includes("UNSUPPORTED_FIRMWARE"));
    assert.ok(result.governor.recommendationGate.reasonCodes.includes("SAMPLE_RATE_BELOW_900_HZ"));
    assert.ok(result.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_SETTINGS_MISSING_OR_INVALID"
    ));
    assert.ok(result.governor.recommendationGate.reasonCodes.includes(
        "COLLECTIVE_RANGE_HEADER_MISSING"
    ));
    assert.ok(result.governor.recommendationGate.reasonCodes.includes(
        "GOVERNOR_MAX_THROTTLE_REQUIRED"
    ));
    assert.ok(result.evidence.length > 0);
    result.evidence.forEach(function(item) {
        if (!Array.isArray(item.timeRangeUs)) {
            return;
        }
        assert.ok(
            item.timeRangeUs[0] >= selectedRange.startTimeUs,
            "Evidence must not begin before the selected In marker"
        );
        assert.ok(
            item.timeRangeUs[1] <= selectedRange.endTimeUs,
            "Evidence must not end after the selected Out marker"
        );
    });
    assert.ok(result.findings.some(function(item) {
        return item.id === "governor-prerequisites-required"
            || item.id === "governor-targeted-log-needed";
    }));

    const fullSelectedResult = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: {
            startTimeUs: logMinTimeUs,
            endTimeUs: logMaxTimeUs
        },
        isCancelled: function() { return false; }
    });
    assert.strictEqual(
        fullSelectedResult.quality.missingEndMarker,
        null,
        "A trailing end event outside the graph-selectable time domain must not create a false warning"
    );
    assert.strictEqual(
        fullSelectedResult.quality.corruptFrames,
        null,
        "Untimestamped whole-file corruption counts must not leak into selected-range evidence"
    );
    assert.ok(!fullSelectedResult.findings.some(function(item) {
        return item.id === "missing-end-marker";
    }));
    assert.ok(progress.some(function(item) { return item.phase === "quality"; }));
    assert.ok(progress.some(function(item) { return item.phase === "tracking"; }));
    assert.ok(progress.some(function(item) { return item.phase === "governor"; }));
    assert.ok(progress.some(function(item) { return item.phase === "findings"; }));

    const serialized = JSON.stringify(result);
    assert.ok(serialized.length < 50000, "Evidence package must remain compact");
    assert.ok(!serialized.includes("governorRecords"));
    assert.ok(!serialized.includes("axisAccumulators"));
    assert.ok(!/"frames"\s*:/.test(serialized));
    assert.ok(!/"samples"\s*:/.test(serialized));
}

module.exports = (async function main() {
    assertPitchPumpRules();
    assertGovernorRequiresExplicitActiveState();
    assertGovernorRecommendationTruthTable();
    await assertCancellation();
    await assertGapBoundaryScoping();
    await assertAdapterGovernorRecommendationContract();
    await assertRotorflightFixture();
    console.log("Tune Advisor tests passed: deterministic rules and Rotorflight fixture evidence");
}());
