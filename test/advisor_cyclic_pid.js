"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cyclic = require("../js/advisor/cyclic_pid_analysis");

const AXIS_INDEX = { roll: 0, pitch: 1, yaw: 2 };
const TERM_INDEX = { P: 0, I: 1, D: 2 };

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function defaultStops() {
    return [
        { startUs: 200000, stopUs: 450000, sign: 1 },
        { startUs: 1700000, stopUs: 1950000, sign: -1 },
        { startUs: 3200000, stopUs: 3450000, sign: 1 },
        { startUs: 4700000, stopUs: 4950000, sign: -1 }
    ];
}

function ownConfig(settings) {
    const config = {
        firmwareType: settings.firmwareType === undefined ? 5 : settings.firmwareType,
        firmwareVersion: settings.firmwareVersion || "4.6.0",
        "Firmware revision": "Rotorflight 4.6.0 (118e912) TEST",
        looptime: 250,
        gyro_sync_denom: 1,
        gyro_decimation_hz: 500,
        pid_process_denom: 2,
        filter_process_denom: 2,
        frameIntervalPNum: 1,
        frameIntervalPDenom: 1,
        fields_mask: 8388607,
        gyro_to_use: 0,
        govPID: [40, 50, 0, 0, 0],
        rollPID: [50, 90, 30, 100, 0],
        pitchPID: [55, 95, 35, 100, 0],
        yawPID: [300, 120, 25, 5, 1],
        rollBW: [15, 20, 25],
        pitchBW: [15, 20, 25],
        yawBW: [15, 20, 25],
        pidProfile: 0,
        pidController: 4,
        rates: [420, 420, 600],
        rate_limits: [900, 900, 1000],
        rates_type: 6,
        rc_rates: [100, 100, 100],
        rc_expo: [20, 20, 20],
        accel_limit: [0, 0, 0],
        response_time: [0, 0, 0],
        iterm_relax_type: 2,
        iterm_relax_cutoff: [15, 15, 20],
        error_limit: [45, 45, 60],
        error_decay: [8, 8],
        error_decay_ground: 15,
        cyclic_coupling: [0, 0, 0],
        yaw_stop_gain: [100, 100],
        yaw_precomp: [0, 0, 0],
        yaw_precomp_impulse: [0, 0],
        yaw_inertia_precomp: [0, 0],
        yaw_tta: [0, 20],
        hsi_gain: [0, 0],
        hsi_limit: [0, 0],
        pitch_compensation: 0,
        dterm_lpf_hz: 80,
        dterm_lpf_dyn_hz: [60, 120],
        dterm_lpf2_hz: 120,
        dterm_differentiator: 1,
        gyro_lowpass_hz: 100,
        gyro_lowpass_dyn_hz: [80, 160],
        gyro_lowpass2_hz: 180,
        gyro_soft_type: 1,
        gyro_soft2_type: 0,
        gyro_notch_hz: [0, 0],
        gyro_notch_cutoff: [0, 0],
        dyn_notch_count: 3,
        dyn_notch_q: 25,
        dyn_notch_min_hz: 21,
        dyn_notch_max_hz: 240,
        dterm_filter_type: 1,
        gyro_rpm_notch_preset: 0,
        gyro_rpm_notch_min_hz: 20,
        gyro_rpm_notch_source_pitch: new Array(16).fill(0),
        gyro_rpm_notch_center_pitch: new Array(16).fill(0),
        gyro_rpm_notch_q_pitch: new Array(16).fill(0),
        gyro_rpm_notch_source_roll: new Array(16).fill(0),
        gyro_rpm_notch_center_roll: new Array(16).fill(0),
        gyro_rpm_notch_q_roll: new Array(16).fill(0),
        gyro_rpm_notch_source_yaw: new Array(16).fill(0),
        gyro_rpm_notch_center_yaw: new Array(16).fill(0),
        gyro_rpm_notch_q_yaw: new Array(16).fill(0),
        collectiveRange: [-1000, 1000]
    };
    Object.keys(settings.pidChanges || {}).forEach(function(path) {
        const parts = path.split(".");
        config[parts[0] + "PID"][Number(parts[1])] = settings.pidChanges[path];
    });
    Object.assign(config, settings.contextChanges || {});
    if (settings.firmwareRevision) {
        config["Firmware revision"] = settings.firmwareRevision;
    }
    return config;
}

function makeSyntheticFlightLog(overrides) {
    const settings = Object.assign({
        axis: "roll",
        stops: defaultStops(),
        commandDps: 180,
        trackingFactor: 0.84,
        fastAmplitudeDps: 24,
        slowAmplitudeDps: 9,
        rawNoiseDps: 2,
        headspeedRpm: 2000,
        collectiveValue: 0,
        collectiveSource: "setpoint[3]",
        batteryValue: 2400,
        rawGyroSource: "gyroRAW",
        commandTailUs: 0,
        commandTailDps: 50,
        offAxisGyroDps: 0,
        pidTermScale: 1,
        sampleIntervalUs: 1000,
        missingFields: [],
        mixedAxis: false,
        nanField: null,
        nanTimeUs: 2600000,
        dropStartUs: null,
        dropEndUs: null,
        events: []
    }, overrides);
    const axisIndex = AXIS_INDEX[settings.axis];
    const fields = ["time"];
    for (let axis = 0; axis < 3; axis++) {
        fields.push("setpoint[" + axis + "]");
    }
    fields.push(settings.collectiveSource);
    for (let axis = 0; axis < 3; axis++) {
        fields.push("gyroADC[" + axis + "]");
    }
    for (let axis = 0; axis < 3; axis++) {
        fields.push(settings.rawGyroSource + "[" + axis + "]");
    }
    ["P", "I", "D", "F", "B", "O"].forEach(function(term) {
        for (let axis = 0; axis < 3; axis++) {
            fields.push("axis" + term + "[" + axis + "]");
        }
    });
    fields.push(
        "headspeed", "motor[0]", "Vbat", "failsafePhase",
        "flightModeFlags", "rxSignalReceived", "rxFlightChannelsValid"
    );
    const keptFields = fields.filter(function(name) {
        return settings.missingFields.indexOf(name) === -1;
    });
    const fieldMap = Object.create(null);
    keptFields.forEach(function(name, index) { fieldMap[name] = index; });
    const config = ownConfig(settings);
    const lastStopUs = settings.stops.length
        ? settings.stops[settings.stops.length - 1].stopUs : 2000000;
    const maxTimeUs = Math.max(6200000, lastStopUs + 1250000);
    const frames = [];

    function set(frame, name, value) {
        if (fieldMap[name] !== undefined) {
            frame[fieldMap[name]] = value;
        }
    }

    function activeStop(timeUs) {
        for (const stop of settings.stops) {
            if (timeUs >= stop.startUs && timeUs < stop.stopUs) {
                return { phase: "command", stop };
            }
            if (timeUs >= stop.stopUs && timeUs < stop.stopUs + 1000000) {
                return { phase: "response", stop };
            }
        }
        return null;
    }

    for (let timeUs = 0; timeUs <= maxTimeUs; timeUs += settings.sampleIntervalUs) {
        if (Number.isFinite(settings.dropStartUs)
                && timeUs >= settings.dropStartUs && timeUs < settings.dropEndUs) {
            continue;
        }
        const frame = new Array(keptFields.length).fill(0);
        const active = activeStop(timeUs);
        const setpoints = [0, 0, 0];
        const gyros = [0, 0, 0];
        const rawGyros = [0, 0, 0];
        if (active && active.phase === "command") {
            const inCommandTail = settings.commandTailUs > 0
                && timeUs >= active.stop.stopUs - settings.commandTailUs;
            setpoints[axisIndex] = (inCommandTail
                ? settings.commandTailDps : settings.commandDps) * active.stop.sign;
            gyros[axisIndex] = setpoints[axisIndex] * settings.trackingFactor
                + Math.sin(timeUs / 17000) * 0.5;
        } else if (active && active.phase === "response") {
            const elapsedSeconds = (timeUs - active.stop.stopUs) / 1000000;
            gyros[axisIndex] = active.stop.sign * (
                settings.fastAmplitudeDps * Math.exp(-elapsedSeconds / 0.18)
                    * Math.sin(2 * Math.PI * 12 * elapsedSeconds)
                + settings.slowAmplitudeDps * Math.exp(-elapsedSeconds / 0.8)
                    * Math.sin(2 * Math.PI * 2 * elapsedSeconds)
            );
        }
        if (settings.mixedAxis && active) {
            setpoints[(axisIndex + 1) % 3] = 90;
        }
        if (active && settings.offAxisGyroDps) {
            gyros[(axisIndex + 1) % 3] = settings.offAxisGyroDps;
        }
        for (let axis = 0; axis < 3; axis++) {
            rawGyros[axis] = gyros[axis]
                + (timeUs / settings.sampleIntervalUs % 2 ? 1 : -1)
                    * settings.rawNoiseDps;
        }
        set(frame, "time", timeUs);
        for (let axis = 0; axis < 3; axis++) {
            set(frame, "setpoint[" + axis + "]", setpoints[axis]);
            set(frame, "gyroADC[" + axis + "]", gyros[axis]);
            set(frame, settings.rawGyroSource + "[" + axis + "]", rawGyros[axis]);
            const error = setpoints[axis] - gyros[axis];
            set(frame, "axisP[" + axis + "]", error * 0.5 * settings.pidTermScale);
            set(frame, "axisI[" + axis + "]", (setpoints[axis] === 0 ? 0 : 4)
                * settings.pidTermScale);
            set(frame, "axisD[" + axis + "]", -gyros[axis] * 0.1
                * settings.pidTermScale);
            set(frame, "axisF[" + axis + "]", setpoints[axis] * 0.2
                * settings.pidTermScale);
            set(frame, "axisB[" + axis + "]", 0);
            set(frame, "axisO[" + axis + "]", 0);
        }
        set(frame, settings.collectiveSource, typeof settings.collectiveValue === "function"
            ? settings.collectiveValue(timeUs, active) : settings.collectiveValue);
        set(frame, "headspeed", typeof settings.headspeedRpm === "function"
            ? settings.headspeedRpm(timeUs, active) : settings.headspeedRpm);
        set(frame, "motor[0]", 700);
        set(frame, "Vbat", typeof settings.batteryValue === "function"
            ? settings.batteryValue(timeUs, active) : settings.batteryValue);
        set(frame, "failsafePhase", 0);
        set(frame, "flightModeFlags", 1);
        set(frame, "rxSignalReceived", 1);
        set(frame, "rxFlightChannelsValid", 1);
        if (settings.nanField && timeUs === settings.nanTimeUs
                && fieldMap[settings.nanField] !== undefined) {
            frame[fieldMap[settings.nanField]] = NaN;
        }
        frames.push(frame);
    }

    const chunk = {
        index: 0,
        frames,
        events: settings.events,
        gapStartsHere: {}
    };
    return {
        _testFrames: frames,
        _testFieldMap: fieldMap,
        _testConfig: config,
        _testMaxTimeUs: maxTimeUs,
        getMinTime: function() { return 0; },
        getMaxTime: function() { return maxTimeUs; },
        getSysConfig: function() { return config; },
        getActivitySummary: function() {
            return {
                times: [0],
                hasEvent: [settings.events.length > 0]
            };
        },
        getMainFieldIndexByName: function(name) { return fieldMap[name]; },
        // Deliberately returns the whole chunk. The engine must enforce I/O.
        getChunksInTimeRange: function() { return [chunk]; }
    };
}

function rangeFor(log, startTimeUs) {
    return {
        startTimeUs: startTimeUs || 0,
        endTimeUs: log._testMaxTimeUs
    };
}

async function capture(log, axis, term, startTimeUs, extra) {
    return cyclic.captureFlightLogRange(log, Object.assign({
        timeRangeUs: rangeFor(log, startTimeUs),
        axis: axis || "roll",
        term: term || "P",
        isCancelled: function() { return false; }
    }, extra));
}

function assertHasCode(result, code) {
    assert.ok(result.codes.includes(code), code + " missing from " + result.codes.join(", "));
}

function assertNoAdviceKeys(value) {
    const banned = /^(recommendation|recommendations|direction|delta|proposal|proposedValue|setting|write|directWriteAllowed)$/i;
    function visit(item) {
        if (!item || typeof item !== "object") {
            return;
        }
        Object.keys(item).forEach(function(key) {
            assert.ok(!banned.test(key), "advice key leaked: " + key);
            visit(item[key]);
        });
    }
    visit(value);
}

function loadAdvisorUiHooks() {
    const advisorWindow = {
        __ROTORLENS_ADVISOR_TEST__: true,
        jQuery: function() { return {}; }
    };
    const context = vm.createContext({
        Date,
        Math,
        URL,
        document: {},
        window: advisorWindow
    });
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../js/advisor/advisor_ui.js"), "utf8"),
        context,
        { filename: "js/advisor/advisor_ui.js" }
    );
    return advisorWindow.RotorLensTuneAdvisorUI.testHooks;
}

async function assertStrictInputsAndCaptureFailures() {
    assert.strictEqual(
        typeof cyclic._testOnlyCompareCapturesWithMixerEvidence,
        "function"
    );
    const browserContext = vm.createContext({});
    vm.runInContext(
        fs.readFileSync(
            path.join(__dirname, "../js/advisor/cyclic_pid_analysis.js"),
            "utf8"
        ),
        browserContext,
        { filename: "js/advisor/cyclic_pid_analysis.js" }
    );
    assert.strictEqual(
        typeof browserContext.RotorLensCyclicPidAnalysis
            ._testOnlyCompareCapturesWithMixerEvidence,
        "undefined",
        "The positive comparator capability must not exist in the browser API"
    );

    const log = makeSyntheticFlightLog();
    let error;
    try {
        await cyclic.captureFlightLogRange(log, { axis: "roll", term: "P" });
    } catch (caught) {
        error = caught;
    }
    assert.ok(error);
    assert.strictEqual(error.code, "CYCLIC_RANGE_REQUIRED");

    error = null;
    try {
        await capture(log, "cyclic", "P");
    } catch (caught) {
        error = caught;
    }
    assert.ok(error);
    assert.strictEqual(error.code, "CYCLIC_AXIS_INVALID");

    const missing = await capture(makeSyntheticFlightLog({
        missingFields: ["gyroRAW[1]"]
    }));
    assert.strictEqual(missing.status, "inconclusive");
    assertHasCode(missing, "RAW_GYRO_FIELDS_MISSING");

    const twoStops = await capture(makeSyntheticFlightLog({
        stops: defaultStops().slice(0, 2)
    }));
    assert.strictEqual(twoStops.status, "inconclusive");
    assertHasCode(twoStops, "INSUFFICIENT_ISOLATED_STOPS");

    const mixed = await capture(makeSyntheticFlightLog({ mixedAxis: true }));
    assert.strictEqual(mixed.status, "inconclusive");
    assertHasCode(mixed, "MIXED_AXIS_MANEUVER_IN_SELECTION");

    const gap = await capture(makeSyntheticFlightLog({
        dropStartUs: 2600000,
        dropEndUs: 2620000
    }));
    assert.strictEqual(gap.status, "inconclusive");
    assertHasCode(gap, "FRAME_GAP_IN_SELECTION");

    const nonfinite = await capture(makeSyntheticFlightLog({
        nanField: "axisD[0]"
    }));
    assert.strictEqual(nonfinite.status, "inconclusive");
    assertHasCode(nonfinite, "NONFINITE_SAMPLE_IN_SELECTION");

    const sameSide = await capture(makeSyntheticFlightLog({
        stops: defaultStops().map(function(stop) {
            return Object.assign({}, stop, { sign: 1 });
        })
    }));
    assertHasCode(sameSide, "BIDIRECTIONAL_STOPS_REQUIRED");

    const unbalancedStops = defaultStops().concat([
        { startUs: 6200000, stopUs: 6450000, sign: 1 },
        { startUs: 7700000, stopUs: 7950000, sign: 1 }
    ]);
    const unbalanced = await capture(makeSyntheticFlightLog({ stops: unbalancedStops }));
    assertHasCode(unbalanced, "STOP_DIRECTION_IMBALANCE");
}

async function assertRangeIsolationAndCancellation() {
    const log = makeSyntheticFlightLog({ nanField: "axisP[0]", nanTimeUs: 0 });
    const result = await capture(log, "roll", "P", 1000);
    assert.strictEqual(result.status, "captured", result.codes.join(", "));
    assert.ok(result.range.startTimeUs === 1000);

    const invalidTimeBeforeIn = await capture(makeSyntheticFlightLog({
        nanField: "time",
        nanTimeUs: 0
    }), "roll", "P", 1000);
    assert.strictEqual(invalidTimeBeforeIn.status, "captured",
        invalidTimeBeforeIn.codes.join(", "));
    assert.strictEqual(invalidTimeBeforeIn.quality.invalidTimestampSampleCount, 0);

    let cancelled = false;
    let error;
    try {
        await capture(makeSyntheticFlightLog(), "roll", "P", 0, {
            isCancelled: function() {
                if (cancelled) {
                    return true;
                }
                cancelled = true;
                return false;
            }
        });
    } catch (caught) {
        error = caught;
    }
    assert.ok(error);
    assert.strictEqual(error.code, "CYCLIC_ANALYSIS_CANCELLED");
}

async function assertComparableOneGainPair() {
    const baseline = await capture(makeSyntheticFlightLog());
    const test = await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94,
        fastAmplitudeDps: 15,
        slowAmplitudeDps: 5,
        rawNoiseDps: 1.5
    }));
    assert.strictEqual(baseline.status, "captured", baseline.codes.join(", "));
    assert.strictEqual(test.status, "captured", test.codes.join(", "));
    assert.ok(Object.isFrozen(baseline));
    assert.ok(Object.isFrozen(baseline.configuration.pid.roll));
    assert.ok(Object.isFrozen(test.maneuver.stopTimesUs));
    assert.ok(/^sel-[0-9a-f]{8}-\d+$/.test(baseline.selectedFingerprint));
    assert.notStrictEqual(baseline.selectedFingerprint, test.selectedFingerprint);
    assert.ok(!JSON.stringify(baseline).includes('"frames"'));
    assert.ok(!JSON.stringify(baseline).includes('"records"'));

    const productionComparison = cyclic.compareCaptures(baseline, test);
    assert.strictEqual(productionComparison.status, "inconclusive");
    assertHasCode(productionComparison,
        "MIXER_SATURATION_EVIDENCE_UNAVAILABLE");
    assert.deepStrictEqual(productionComparison.evidence, []);

    const comparison = cyclic._testOnlyCompareCapturesWithMixerEvidence(
        baseline,
        test
    );
    assert.strictEqual(comparison.status, "improved");
    assert.deepStrictEqual(comparison.codes, []);
    assert.strictEqual(comparison.axis, "roll");
    assert.strictEqual(comparison.term, "P");
    assert.deepStrictEqual(comparison.gainValues, { baseline: 50, test: 55 });
    assert.ok(Object.isFrozen(comparison));
    assert.ok(Object.isFrozen(comparison.evidence));
    assertNoAdviceKeys(baseline);
    assertNoAdviceKeys(test);
    assertNoAdviceKeys(comparison);

    const identical = cyclic.compareCaptures(baseline, baseline);
    assert.strictEqual(identical.status, "inconclusive");
    assertHasCode(identical, "IDENTICAL_SELECTED_EVIDENCE");
    assertHasCode(identical, "SELECTED_GAIN_UNCHANGED");
}

async function assertRealEngineObjectsPassUiBoundary() {
    const hooks = loadAdvisorUiHooks();
    const baselineLog = makeSyntheticFlightLog({ axis: "pitch" });
    const testLog = makeSyntheticFlightLog({
        axis: "pitch",
        pidChanges: { "pitch.0": 60 },
        trackingFactor: 0.94,
        fastAmplitudeDps: 15,
        slowAmplitudeDps: 5,
        rawNoiseDps: 1.5
    });
    const baseline = await capture(baselineLog, "pitch", "P");
    const test = await capture(testLog, "pitch", "P");
    const baselineRange = rangeFor(baselineLog);
    const testRange = rangeFor(testLog);
    const selection = { axis: "pitch", term: "P" };
    const baselineRequest = hooks.cyclicCaptureRequestPayload(
        "baseline",
        baselineRange,
        { fileName: "baseline.bbl", logIndex: 0, logStartTimeUs: 0 },
        selection
    );
    const testRequest = hooks.cyclicCaptureRequestPayload(
        "test",
        testRange,
        { fileName: "test.bbl", logIndex: 0, logStartTimeUs: 0 },
        selection
    );

    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(baseline, baselineRequest),
        true,
        "A real hardened engine baseline must satisfy the strict UI capture schema"
    );
    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(test, testRequest),
        true,
        "A real hardened engine test must satisfy the strict UI capture schema"
    );
    const baselineMetadata = hooks.cyclicCaptureMetadataFromResult(
        "baseline",
        baseline,
        baselineRequest
    );
    const testMetadata = hooks.cyclicCaptureMetadataFromResult(
        "test",
        test,
        testRequest
    );
    assert.strictEqual(baselineMetadata.captureStatus, "captured");
    assert.strictEqual(testMetadata.captureStatus, "captured");

    const productionComparison = cyclic.compareCaptures(baseline, test);
    const productionNormalized = hooks.normalizeCyclicComparisonState(
        productionComparison
    );
    assert.ok(productionNormalized,
        "A withheld production comparison must satisfy the strict UI schema");
    assert.strictEqual(productionNormalized.status, "inconclusive");
    assertHasCode(productionNormalized,
        "MIXER_SATURATION_EVIDENCE_UNAVAILABLE");
    assert.strictEqual(productionNormalized.evidence.length, 0);

    const testOnlyComparison = cyclic._testOnlyCompareCapturesWithMixerEvidence(
        baseline,
        test
    );
    const testOnlyNormalized = hooks.normalizeCyclicComparisonState(
        testOnlyComparison
    );
    assert.ok(testOnlyNormalized,
        "The internal comparator result must retain the strict evidence schema");
    assert.strictEqual(testOnlyNormalized.status, "improved");
    assert.strictEqual(testOnlyNormalized.evidence.length, 4);
}

async function assertComparisonMismatchCodes() {
    const baseline = await capture(makeSyntheticFlightLog());
    const multi = await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.0": 55, "pitch.1": 105 },
        trackingFactor: 0.94
    }));
    assertHasCode(cyclic.compareCaptures(baseline, multi), "MULTIPLE_GAIN_CHANGES");

    for (const mismatch of [
        { options: { firmwareRevision: "Rotorflight 4.6.0 (different) TEST" }, code: "FIRMWARE_BUILD_MISMATCH" },
        { options: { contextChanges: { pidProfile: 1 } }, code: "CONFIGURATION_CONTEXT_MISMATCH" },
        { options: { contextChanges: { rates: [500, 420, 600] } }, code: "CONFIGURATION_CONTEXT_MISMATCH" },
        { options: { contextChanges: { dterm_lpf_hz: 70 } }, code: "CONFIGURATION_CONTEXT_MISMATCH" }
    ]) {
        const changed = await capture(makeSyntheticFlightLog(Object.assign({
            pidChanges: { "roll.0": 55 },
            trackingFactor: 0.94
        }, mismatch.options)));
        assertHasCode(cyclic.compareCaptures(baseline, changed), mismatch.code);
    }

    const pitch = await capture(makeSyntheticFlightLog({
        axis: "pitch",
        pidChanges: { "pitch.0": 60 },
        trackingFactor: 0.94
    }), "pitch", "P");
    assertHasCode(cyclic.compareCaptures(baseline, pitch), "AXIS_MISMATCH");

    const iTerm = await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.1": 95 },
        trackingFactor: 0.94
    }), "roll", "I");
    assertHasCode(cyclic.compareCaptures(baseline, iTerm), "TERM_MISMATCH");

    const mutated = clone(await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94
    })));
    mutated.range.endTimeUs -= 1000;
    const stale = cyclic.compareCaptures(baseline, mutated);
    assertHasCode(stale, "CAPTURE_SCHEMA_INVALID");
}

async function assertSupportedFirmwareOnly() {
    for (const options of [
        { firmwareType: 4 },
        { firmwareVersion: "4.5.0" },
        { firmwareRevision: "Betaflight 4.6.0 (118e912) TEST" },
        { firmwareRevision: "Rotorflight 4.6.0 (different) TEST" }
    ]) {
        const result = await capture(makeSyntheticFlightLog(options));
        assert.strictEqual(result.status, "inconclusive");
        assertHasCode(result, "FIRMWARE_BUILD_UNSUPPORTED");
    }

    const supported = await capture(makeSyntheticFlightLog());
    assert.strictEqual(supported.firmware.type, 5);
    assert.strictEqual(supported.firmware.version, "4.6.0");
    assert.strictEqual(supported.configuration.context.dyn_notch_q, 25);
    assert.strictEqual(supported.configuration.context.filter_process_denom, 2);
    assert.strictEqual(supported.configuration.context.dterm_filter_type, 1);
    assert.strictEqual(supported.configuration.context.gyro_soft_type, 1);
    assert.strictEqual(
        supported.configuration.context.gyro_rpm_notch_source_roll.length,
        16
    );
}

async function assertSignalPlausibilityAndLoadGates() {
    const lowRpm = await capture(makeSyntheticFlightLog({ headspeedRpm: 1 }));
    assert.strictEqual(lowRpm.status, "inconclusive");
    assertHasCode(lowRpm, "HEADSPEED_SAMPLE_IMPLAUSIBLE");
    assertHasCode(lowRpm, "POWERED_COVERAGE_INSUFFICIENT");

    const rpmStops = defaultStops().map(function(stop, index) {
        return Object.assign({}, stop, { rpm: index < 2 ? 1000 : 3000 });
    });
    const aliasedRpm = await capture(makeSyntheticFlightLog({
        stops: rpmStops,
        headspeedRpm: function(timeUs, active) {
            return active ? active.stop.rpm : 2000;
        }
    }));
    assert.strictEqual(aliasedRpm.status, "inconclusive");
    assertHasCode(aliasedRpm, "HEADSPEED_UNSTABLE_IN_SELECTION");
    assert.ok(aliasedRpm.maneuver.crossEventHeadspeedVariationRatio > 0.05);

    const unstableCollective = await capture(makeSyntheticFlightLog({
        collectiveValue: function(timeUs) {
            return timeUs < 3000000 ? -500 : 500;
        }
    }));
    assert.strictEqual(unstableCollective.status, "inconclusive");
    assertHasCode(unstableCollective,
        "COLLECTIVE_LOAD_UNSTABLE_IN_SELECTION");

    const missingCollective = await capture(makeSyntheticFlightLog({
        missingFields: ["setpoint[3]"]
    }));
    assertHasCode(missingCollective, "COLLECTIVE_FIELD_MISSING");
    const missingBattery = await capture(makeSyntheticFlightLog({
        missingFields: ["Vbat"]
    }));
    assertHasCode(missingBattery, "BATTERY_FIELD_MISSING");
    assertHasCode(missingBattery, "BATTERY_SAMPLE_INVALID");

    const baseline = await capture(makeSyntheticFlightLog());
    const changedCollective = await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94,
        collectiveValue: 1000
    }));
    assertHasCode(
        cyclic.compareCaptures(baseline, changedCollective),
        "COLLECTIVE_LOAD_MISMATCH"
    );
    const changedBattery = await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94,
        batteryValue: 1800
    }));
    assertHasCode(
        cyclic.compareCaptures(baseline, changedBattery),
        "BATTERY_LOAD_MISMATCH"
    );

    const alternatingBattery = await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94,
        batteryValue: function(timeUs) {
            if (timeUs === 0) {
                return 2400;
            }
            return (timeUs / 1000) % 2 ? 1200 : 3600;
        }
    }));
    assert.strictEqual(alternatingBattery.status, "inconclusive");
    assertHasCode(alternatingBattery, "BATTERY_EVIDENCE_INVALID");
    assert.strictEqual(alternatingBattery.maneuver.selectionBatteryMedian, 2400);
    assert.strictEqual(
        alternatingBattery.maneuver.selectionBatteryVariationRatio,
        1
    );
    assertHasCode(
        cyclic._testOnlyCompareCapturesWithMixerEvidence(
            baseline,
            alternatingBattery
        ),
        "BATTERY_LOAD_MISMATCH"
    );
}

async function assertMeasurementSourcesAndConfigurationMatch() {
    const baseline = await capture(makeSyntheticFlightLog());
    for (const key of [
        "dyn_notch_q",
        "filter_process_denom",
        "gyro_decimation_hz",
        "dterm_filter_type",
        "gyro_soft_type",
        "gyro_rpm_notch_source_roll"
    ]) {
        const original = ownConfig({})[key];
        const changedValue = Array.isArray(original)
            ? original.map(function(value, index) { return index === 0 ? value + 1 : value; })
            : original + 1;
        const test = await capture(makeSyntheticFlightLog({
            pidChanges: { "roll.0": 55 },
            trackingFactor: 0.94,
            contextChanges: { [key]: changedValue }
        }));
        assertHasCode(
            cyclic.compareCaptures(baseline, test),
            "CONFIGURATION_CONTEXT_MISMATCH"
        );
    }

    const unfiltered = await capture(makeSyntheticFlightLog({
        rawGyroSource: "gyroUnfilt",
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94
    }));
    assertHasCode(cyclic.compareCaptures(baseline, unfiltered),
        "RAW_GYRO_SOURCE_MISMATCH");

    const mixerCollective = await capture(makeSyntheticFlightLog({
        collectiveSource: "mixer[3]",
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94
    }));
    assertHasCode(cyclic.compareCaptures(baseline, mixerCollective),
        "COLLECTIVE_SOURCE_MISMATCH");
}

async function assertStopTimingAndTimestampIntegrity() {
    const tapered = await capture(makeSyntheticFlightLog({
        commandTailUs: 100000,
        commandTailDps: 50
    }));
    assert.strictEqual(tapered.status, "inconclusive");
    assertHasCode(tapered, "COMMAND_RELEASE_NOT_SUSTAINED");
    assertHasCode(tapered, "INSUFFICIENT_ISOLATED_STOPS");

    const reboundLog = makeSyntheticFlightLog();
    const reboundTimeIndex = reboundLog._testFieldMap.time;
    const reboundSetpointIndex = reboundLog._testFieldMap["setpoint[0]"];
    reboundLog._testFrames.forEach(function(frame) {
        const timeUs = frame[reboundTimeIndex];
        defaultStops().forEach(function(stop) {
            if (timeUs > stop.stopUs && timeUs < stop.stopUs + 20000) {
                frame[reboundSetpointIndex] = 180 * stop.sign;
            }
        });
    });
    const rebound = await capture(reboundLog);
    assert.strictEqual(rebound.status, "inconclusive");
    assertHasCode(rebound, "COMMAND_RELEASE_NOT_SUSTAINED");
    assert.strictEqual(rebound.maneuver.stopCount, 0);

    const invalidTime = await capture(makeSyntheticFlightLog({
        nanField: "time",
        nanTimeUs: 2600000
    }));
    assert.strictEqual(invalidTime.status, "inconclusive");
    assertHasCode(invalidTime, "INVALID_TIMESTAMP_IN_CANDIDATE_CHUNK");
    assert.strictEqual(invalidTime.quality.invalidTimestampSampleCount, 1);

    const preselectionAdjustment = await capture(makeSyntheticFlightLog({
        events: [{ event: 13, time: 0, data: { func: 2, value: 1 } }]
    }), "roll", "P", 1000);
    assert.strictEqual(preselectionAdjustment.status, "inconclusive");
    assertHasCode(preselectionAdjustment, "PRESELECTION_INFLIGHT_ADJUSTMENT");
}

async function assertManeuverCompatibilityAndSemanticScope() {
    const baseline = await capture(makeSyntheticFlightLog());
    const threeStops = await capture(makeSyntheticFlightLog({
        stops: defaultStops().slice(0, 3)
    }));
    assert.strictEqual(cyclic.constants.minimumStopEvents, 4);
    assert.strictEqual(threeStops.status, "inconclusive");
    assertHasCode(threeStops, "INSUFFICIENT_ISOLATED_STOPS");
    const shorterCommands = defaultStops().map(function(stop) {
        return Object.assign({}, stop, { startUs: stop.startUs + 100000 });
    });
    const durationTest = await capture(makeSyntheticFlightLog({
        stops: shorterCommands,
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94
    }));
    assertHasCode(cyclic.compareCaptures(baseline, durationTest),
        "COMMAND_DURATION_MISMATCH");

    const sixStops = [
        { startUs: 200000, stopUs: 450000, sign: 1 },
        { startUs: 1300000, stopUs: 1550000, sign: -1 },
        { startUs: 2400000, stopUs: 2650000, sign: 1 },
        { startUs: 3500000, stopUs: 3750000, sign: -1 },
        { startUs: 4600000, stopUs: 4850000, sign: 1 },
        { startUs: 5700000, stopUs: 5950000, sign: -1 }
    ];
    const countTest = await capture(makeSyntheticFlightLog({
        stops: sixStops,
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94
    }));
    assertHasCode(cyclic.compareCaptures(baseline, countTest),
        "STOP_COUNT_MISMATCH");
    assertHasCode(cyclic.compareCaptures(baseline, countTest),
        "MANEUVER_SIGN_COUNT_MISMATCH");

    const iTerm = await capture(makeSyntheticFlightLog(), "roll", "I");
    assert.strictEqual(iTerm.status, "inconclusive");
    assertHasCode(iTerm, "I_TERM_HOLD_EVIDENCE_UNSUPPORTED");
    const yaw = await capture(makeSyntheticFlightLog({ axis: "yaw" }), "yaw", "P");
    assert.strictEqual(yaw.status, "inconclusive");
    assertHasCode(yaw, "YAW_DIRECTIONAL_EVIDENCE_UNSUPPORTED");

    const coupled = await capture(makeSyntheticFlightLog({ offAxisGyroDps: 80 }));
    assertHasCode(coupled, "OFF_AXIS_GYRO_RESPONSE_EXCESSIVE");
    const couplingRegression = await capture(makeSyntheticFlightLog({
        offAxisGyroDps: 10,
        pidChanges: { "roll.0": 55 },
        trackingFactor: 0.94
    }));
    assert.strictEqual(couplingRegression.status, "captured",
        couplingRegression.codes.join(", "));
    assertHasCode(cyclic.compareCaptures(baseline, couplingRegression),
        "OFF_AXIS_GYRO_RESPONSE_EXCESSIVE");
    const opposedLog = makeSyntheticFlightLog({
        pidChanges: { "roll.0": 55 },
        pidTermScale: 1.1
    });
    const opposedTimeIndex = opposedLog._testFieldMap.time;
    const opposedSetpointIndex = opposedLog._testFieldMap["setpoint[0]"];
    const opposedGyroIndex = opposedLog._testFieldMap["gyroADC[0]"];
    const opposedRawIndex = opposedLog._testFieldMap["gyroRAW[0]"];
    opposedLog._testFrames.forEach(function(frame) {
        const timeUs = frame[opposedTimeIndex];
        defaultStops().forEach(function(stop) {
            if (timeUs >= stop.startUs && timeUs < stop.stopUs) {
                const factor = stop.sign > 0 ? 1 : 0.68;
                frame[opposedGyroIndex] = frame[opposedSetpointIndex] * factor;
                frame[opposedRawIndex] = frame[opposedGyroIndex]
                    + ((timeUs / 1000) % 2 ? 2 : -2);
            } else if (timeUs >= stop.stopUs
                    && timeUs < stop.stopUs + 1000000) {
                const factor = stop.sign > 0 ? 0.2 : 1.8;
                frame[opposedGyroIndex] *= factor;
                frame[opposedRawIndex] = frame[opposedGyroIndex]
                    + ((timeUs / 1000) % 2 ? 2 : -2);
            }
        });
    });
    const opposed = await capture(opposedLog);
    assert.strictEqual(opposed.status, "captured", opposed.codes.join(", "));
    assertHasCode(
        cyclic._testOnlyCompareCapturesWithMixerEvidence(baseline, opposed),
        "MANEUVER_SIGN_MISMATCH"
    );

    const dBaseline = await capture(makeSyntheticFlightLog(), "roll", "D");
    const dTest = await capture(makeSyntheticFlightLog({
        pidChanges: { "roll.2": 35 },
        trackingFactor: 0.94,
        fastAmplitudeDps: 15,
        slowAmplitudeDps: 5,
        rawNoiseDps: 1.5
    }), "roll", "D");
    assert.strictEqual(dBaseline.status, "captured", dBaseline.codes.join(", "));
    assert.strictEqual(dTest.status, "captured", dTest.codes.join(", "));
    assert.notStrictEqual(
        cyclic._testOnlyCompareCapturesWithMixerEvidence(dBaseline, dTest).status,
        "inconclusive"
    );
}

module.exports = (async function() {
    await assertStrictInputsAndCaptureFailures();
    await assertRangeIsolationAndCancellation();
    await assertComparableOneGainPair();
    await assertRealEngineObjectsPassUiBoundary();
    await assertComparisonMismatchCodes();
    await assertSupportedFirmwareOnly();
    await assertSignalPlausibilityAndLoadGates();
    await assertMeasurementSourcesAndConfigurationMatch();
    await assertStopTimingAndTimestampIntegrity();
    await assertManeuverCompatibilityAndSemanticScope();
    console.log("advisor cyclic PID comparison tests passed");
}());
