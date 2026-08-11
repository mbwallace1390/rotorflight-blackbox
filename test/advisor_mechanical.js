"use strict";

const assert = require("assert");
const mechanical = require("../js/advisor/mechanical_analysis");

function deterministicNoise(index, amplitude) {
    let value = (Math.imul(index + 1, 1103515245) + 12345) >>> 0;
    value = ((value >>> 8) & 0xFFFF) / 32767.5 - 1;
    return value * amplitude;
}

function makeSeries(options) {
    const settings = Object.assign({
        durationSeconds: 8,
        sampleRateHz: 1000,
        frequencyHz: 120,
        amplitudeDps: 20,
        noiseDps: 0.35,
        headspeedRpm: 3600,
        tailspeedRpm: 8400,
        gyroSource: "gyroUnfilt",
        transientStartSeconds: null,
        transientDurationSeconds: 0
    }, options);
    const count = settings.durationSeconds * settings.sampleRateHz + 1;
    const timeUs = new Array(count);
    const gyro = { roll: new Array(count), pitch: new Array(count), yaw: new Array(count) };
    const headspeedRpm = new Array(count);
    const tailspeedRpm = new Array(count);

    for (let index = 0; index < count; index++) {
        const seconds = index / settings.sampleRateHz;
        const inTransient = settings.transientStartSeconds === null
            || (seconds >= settings.transientStartSeconds
                && seconds < settings.transientStartSeconds
                    + settings.transientDurationSeconds);
        const sine = inTransient
            ? settings.amplitudeDps * Math.sin(2 * Math.PI * settings.frequencyHz * seconds)
            : 0;
        timeUs[index] = Math.round(seconds * 1000000);
        gyro.roll[index] = sine + deterministicNoise(index, settings.noiseDps);
        gyro.pitch[index] = deterministicNoise(index + 31, settings.noiseDps);
        gyro.yaw[index] = deterministicNoise(index + 79, settings.noiseDps);
        headspeedRpm[index] = settings.headspeedRpm;
        tailspeedRpm[index] = settings.tailspeedRpm;
    }

    return {
        timeUs,
        gyro,
        gyroSource: settings.gyroSource,
        headspeedRpm,
        tailspeedRpm
    };
}

function peakNear(axis, frequencyHz, toleranceHz) {
    return axis.peaks.find(function(peak) {
        return Math.abs(peak.frequencyHz - frequencyHz) <= toleranceHz;
    });
}

async function assertPersistentSpectrumAndContract() {
    const range = { startTimeUs: 1000000, endTimeUs: 7000000 };
    const progress = [];
    const result = await mechanical.analyzeTimeSeries(makeSeries({
        frequencyHz: 120,
        amplitudeDps: 20
    }), {
        timeRangeUs: range,
        isCancelled: function() { return false; },
        onProgress: function(update) { progress.push(update); }
    });

    assert.strictEqual(result.analysisMode, "deterministic-local");
    assert.deepStrictEqual(
        { startTimeUs: result.range.startTimeUs, endTimeUs: result.range.endTimeUs },
        range
    );
    assert.strictEqual(result.status, "attention");
    assert.strictEqual(result.attention, true);
    assert.strictEqual(result.capabilities.offline, true);
    assert.strictEqual(result.capabilities.selectedRangeRequired, true);
    assert.strictEqual(result.capabilities.selectedRangeOnly, true);
    assert.strictEqual(result.capabilities.rawLogIncluded, false);
    assert.strictEqual(result.capabilities.componentDiagnosis, false);
    assert.strictEqual(result.capabilities.tuningRecommendations, false);
    assert.strictEqual(result.capabilities.settingDirectionAdvice, false);
    assert.strictEqual(result.capabilities.directSettingWrites, false);
    assert.strictEqual(result.quality.attentionBandRmsThresholdDps, 8);
    assert.strictEqual(mechanical.constants.attentionBandRmsThresholdDps, 8);
    assert.ok(result.quality.totalPossibleWindowCount >= result.quality.validWindowCount);
    assert.ok(result.quality.validWindowCount >= result.quality.windowCount);
    assert.ok(result.quality.validWindowCoverageRatio >= 0.75);
    assert.ok(result.quality.finiteSampleCoverageRatio >= 0.75);
    assert.ok(result.quality.finiteTimeSpanCoverageRatio >= 0.75);
    assert.strictEqual(result.quality.firstSelectedSampleTimeUs, range.startTimeUs);
    assert.strictEqual(result.quality.lastSelectedSampleTimeUs, range.endTimeUs);
    assert.strictEqual(result.quality.leadingSelectedGapUs, 0);
    assert.strictEqual(result.quality.trailingSelectedGapUs, 0);
    assert.strictEqual(result.quality.selectedTimestampSpanCoverageRatio, 1);
    assert.strictEqual(result.quality.resampledStartTimeUs, range.startTimeUs);
    assert.strictEqual(result.quality.resampledEndTimeUs, range.endTimeUs);
    assert.strictEqual(result.quality.resampledRangeCoverageRatio, 1);
    assert.strictEqual(
        result.quality.totalPossibleWindowCount,
        Math.floor(
            (result.quality.resampledSampleCount - result.quality.windowSize)
                / (result.quality.windowSize / 2)
        ) + 1
    );

    const roll = result.axes.find(function(axis) { return axis.axis === "roll"; });
    assert.ok(roll);
    assert.strictEqual(roll.source, "gyroUnfilt");
    assert.strictEqual(roll.amplitudeKind, "unfiltered-gyro-output");
    assert.ok(roll.totalPossibleWindowCount >= roll.validWindowCount);
    assert.ok(roll.validWindowCount >= roll.windowCount);
    assert.ok(roll.validWindowCoverageRatio >= 0.75);
    assert.ok(roll.finiteSampleCoverageRatio >= 0.75);
    assert.ok(roll.finiteTimeSpanCoverageRatio >= 0.75);
    assert.strictEqual(roll.firstFiniteSampleTimeUs, range.startTimeUs);
    assert.strictEqual(roll.lastFiniteSampleTimeUs, range.endTimeUs);
    assert.strictEqual(roll.leadingFiniteGapUs, 0);
    assert.strictEqual(roll.trailingFiniteGapUs, 0);
    const peak = peakNear(roll, 120, result.quality.frequencyResolutionHz * 1.5);
    assert.ok(peak, "Expected a robust peak near the generated 120 Hz tone");
    assert.ok(peak.psdDps2PerHz > 0);
    assert.ok(peak.bandRmsDps > 8);
    assert.ok(peak.supportingWindowCount >= 3);
    assert.ok(peak.persistenceRatio >= mechanical.constants.minimumPersistenceRatio);
    assert.ok(Math.abs(roll.broadbandRmsDps - 20 / Math.sqrt(2)) < 1);
    assert.ok(peak.harmonicMatch);
    assert.strictEqual(peak.harmonicMatch.rotor, "main");
    assert.strictEqual(peak.harmonicMatch.order, 2);
    assert.ok(result.reasonCodes.includes("PERSISTENT_NARROWBAND_ENERGY"));
    assert.ok(result.reasonCodes.includes("MAIN_ROTOR_HARMONIC_CORRELATION"));

    result.findings.forEach(function(finding) {
        assert.deepStrictEqual(finding.timeRangeUs, [range.startTimeUs, range.endTimeUs]);
        assert.ok(finding.sourceIds.length > 0);
    });
    ["collect", "resample", "spectrum", "findings"].forEach(function(phase) {
        assert.ok(progress.some(function(update) { return update.phase === phase; }), phase);
    });
}

async function assertAttentionAmplitudeGate() {
    const range = { startTimeUs: 1000000, endTimeUs: 7000000 };
    const clean = await mechanical.analyzeTimeSeries(makeSeries({
        frequencyHz: 140,
        amplitudeDps: 3.4,
        headspeedRpm: 3600,
        tailspeedRpm: 8400
    }), { timeRangeUs: range });
    const problem = await mechanical.analyzeTimeSeries(makeSeries({
        frequencyHz: 140,
        amplitudeDps: 27,
        headspeedRpm: 3600,
        tailspeedRpm: 8400
    }), { timeRangeUs: range });

    const cleanPeak = peakNear(
        clean.axes.find(function(axis) { return axis.axis === "roll"; }),
        140,
        3
    );
    const problemPeak = peakNear(
        problem.axes.find(function(axis) { return axis.axis === "roll"; }),
        140,
        3
    );
    assert.ok(cleanPeak && cleanPeak.bandRmsDps > 2 && cleanPeak.bandRmsDps < 3);
    assert.strictEqual(clean.status, "clear");
    assert.strictEqual(clean.attention, false);
    assert.ok(clean.reasonCodes.includes(
        "PERSISTENT_NARROWBAND_ENERGY_BELOW_ATTENTION_THRESHOLD"
    ));
    assert.strictEqual(clean.findings[0].severity, "info");
    assert.ok(problemPeak && problemPeak.bandRmsDps > 18);
    assert.strictEqual(problem.status, "attention");
    assert.strictEqual(problem.attention, true);
}

async function assertTransientDoesNotTripPersistenceGate() {
    const range = { startTimeUs: 0, endTimeUs: 8000000 };
    const result = await mechanical.analyzeTimeSeries(makeSeries({
        frequencyHz: 180,
        amplitudeDps: 80,
        transientStartSeconds: 3,
        transientDurationSeconds: 0.25
    }), { timeRangeUs: range });
    assert.strictEqual(result.status, "clear");
    assert.strictEqual(result.attention, false);
    assert.ok(!result.reasonCodes.includes("PERSISTENT_NARROWBAND_ENERGY"));
}

async function assertSeparatedEndBurstsDoNotLookPersistent() {
    const series = makeSeries({
        durationSeconds: 8,
        amplitudeDps: 0,
        frequencyHz: 180
    });
    for (let index = 0; index < series.timeUs.length; index++) {
        const seconds = series.timeUs[index] / 1000000;
        if (seconds <= 1.3 || seconds >= 6.7) {
            series.gyro.roll[index] += 80 * Math.sin(2 * Math.PI * 180 * seconds);
        }
    }

    const result = await mechanical.analyzeTimeSeries(series, {
        timeRangeUs: { startTimeUs: 0, endTimeUs: 8000000 }
    });
    const roll = result.axes.find(function(axis) { return axis.axis === "roll"; });
    const peak = peakNear(roll, 180, 3);

    assert.ok(peak, "Separated strong bursts should remain visible as information");
    assert.ok(
        peak.attentionSupportingWindowCount
            >= Math.max(3, Math.ceil(peak.evaluatedWindowCount * 0.25)),
        "Regression must exercise the old count/span false-positive path"
    );
    assert.ok(peak.attentionTemporalSpanRatio >= 0.5);
    assert.ok(peak.attentionOccupiedBucketCount < 3);
    assert.ok(peak.attentionMaximumGapRatio > 0.35);
    assert.strictEqual(peak.attentionEligible, false);
    assert.strictEqual(result.status, "clear");
    assert.strictEqual(result.attention, false);
    assert.ok(!result.reasonCodes.includes("PERSISTENT_NARROWBAND_ENERGY"));
}

async function assertSparseFiniteEvidenceIsInsufficient() {
    const sparse = makeSeries({
        durationSeconds: 20,
        frequencyHz: 160,
        amplitudeDps: 30
    });
    const finiteStart = 9000;
    const finiteEndExclusive = finiteStart + 1790;
    ["roll", "pitch", "yaw"].forEach(function(axis) {
        sparse.gyro[axis] = sparse.gyro[axis].map(function(value, index) {
            return index >= finiteStart && index < finiteEndExclusive ? value : NaN;
        });
    });

    const range = { startTimeUs: 0, endTimeUs: 20000000 };
    const result = await mechanical.analyzeTimeSeries(sparse, { timeRangeUs: range });

    assert.strictEqual(result.status, "insufficient");
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.attention, false);
    assert.ok(result.reasonCodes.includes("VALID_WINDOW_COVERAGE_INSUFFICIENT"));
    assert.ok(result.reasonCodes.includes("FINITE_GYRO_SAMPLE_COVERAGE_INSUFFICIENT"));
    assert.ok(result.reasonCodes.includes("FINITE_GYRO_TIME_SPAN_COVERAGE_INSUFFICIENT"));
    assert.ok(result.quality.totalPossibleWindowCount > 70);
    assert.strictEqual(result.quality.validWindowCount, 5);
    assert.ok(result.quality.validWindowCoverageRatio < 0.1);
    assert.ok(result.quality.finiteSampleCoverageRatio < 0.1);
    assert.ok(result.quality.finiteTimeSpanCoverageRatio < 0.1);
    assert.strictEqual(result.quality.minimumCoverageRatio, 0.75);
    assert.strictEqual(result.axes.length, 3);
    result.axes.forEach(function(axis) {
        assert.strictEqual(axis.available, false);
        assert.strictEqual(axis.validWindowCount, 5);
        assert.ok(axis.validWindowCoverageRatio < 0.1);
        assert.deepStrictEqual(axis.peaks, []);
    });
    result.findings.forEach(function(finding) {
        assert.deepStrictEqual(finding.timeRangeUs, [range.startTimeUs, range.endTimeUs]);
    });
}

function makeFlightLog() {
    const fields = [
        "time",
        "gyroUnfilt[0]", "gyroUnfilt[1]", "gyroUnfilt[2]",
        "gyroADC[0]", "gyroADC[1]", "gyroADC[2]",
        "headspeed"
    ];
    const indexes = Object.create(null);
    fields.forEach(function(name, index) { indexes[name] = index; });
    const frames = [];
    for (let index = 0; index <= 6000; index++) {
        const seconds = index / 1000;
        const frame = new Array(fields.length).fill(0);
        frame[indexes.time] = index * 1000;
        frame[indexes["gyroUnfilt[0]"]] = 20 * Math.sin(2 * Math.PI * 150 * seconds);
        frame[indexes["gyroUnfilt[1]"]] = deterministicNoise(index, 0.2);
        frame[indexes["gyroUnfilt[2]"]] = deterministicNoise(index + 5, 0.2);
        frame[indexes["gyroADC[0]"]] = 50 * Math.sin(2 * Math.PI * 50 * seconds);
        frame[indexes.headspeed] = 3000;
        frames.push(frame);
    }
    const chunk = { index: 0, frames };
    return {
        getMinTime: function() { return 0; },
        getMaxTime: function() { return 6000000; },
        getMainFieldIndexByName: function(name) { return indexes[name]; },
        getChunksInTimeRange: function() { return [chunk]; }
    };
}

function makeMiddleIslandFlightLog() {
    const fields = [
        "time",
        "gyroRAW[0]", "gyroRAW[1]", "gyroRAW[2]",
        "headspeed"
    ];
    const indexes = Object.create(null);
    fields.forEach(function(name, index) { indexes[name] = index; });
    const frames = [];
    for (let timeUs = 2000000; timeUs <= 4000000; timeUs += 1000) {
        const seconds = timeUs / 1000000;
        const frame = new Array(fields.length).fill(0);
        frame[indexes.time] = timeUs;
        frame[indexes["gyroRAW[0]"]] = 2 * Math.sin(2 * Math.PI * 120 * seconds);
        frame[indexes["gyroRAW[1]"]] = deterministicNoise(timeUs / 1000, 0.2);
        frame[indexes["gyroRAW[2]"]] = deterministicNoise(timeUs / 1000 + 5, 0.2);
        frame[indexes.headspeed] = 3600;
        frames.push(frame);
    }
    const chunk = { index: 0, frames };
    return {
        getMinTime: function() { return 0; },
        getMaxTime: function() { return 6000000; },
        getMainFieldIndexByName: function(name) { return indexes[name]; },
        getChunksInTimeRange: function() { return [chunk]; }
    };
}

async function assertFlightLogAliasesAndExactRange() {
    const range = { startTimeUs: 1000000, endTimeUs: 5000000 };
    const result = await mechanical.analyzeFlightLog(makeFlightLog(), {
        timeRangeUs: range
    });
    const roll = result.axes.find(function(axis) { return axis.axis === "roll"; });
    assert.ok(roll);
    assert.strictEqual(roll.source, "gyroUnfilt");
    assert.ok(peakNear(roll, 150, 3));
    assert.ok(!peakNear(roll, 50, 3), "Filtered fallback must not override gyroUnfilt");
    assert.strictEqual(result.range.startTimeUs, range.startTimeUs);
    assert.strictEqual(result.range.endTimeUs, range.endTimeUs);
    assert.strictEqual(result.range.sampleCount, 4001);
}

async function assertFlightLogMiddleIslandIsInsufficient() {
    const range = { startTimeUs: 0, endTimeUs: 6000000 };
    const result = await mechanical.analyzeFlightLog(makeMiddleIslandFlightLog(), {
        timeRangeUs: range
    });

    assert.strictEqual(result.status, "insufficient");
    assert.strictEqual(result.available, false);
    assert.ok(result.reasonCodes.includes(
        "SELECTED_TIMESTAMP_SPAN_COVERAGE_INSUFFICIENT"
    ));
    assert.ok(result.reasonCodes.includes("VALID_WINDOW_COVERAGE_INSUFFICIENT"));
    assert.ok(result.reasonCodes.includes("FINITE_GYRO_SAMPLE_COVERAGE_INSUFFICIENT"));
    assert.ok(result.reasonCodes.includes("FINITE_GYRO_TIME_SPAN_COVERAGE_INSUFFICIENT"));
    assert.strictEqual(result.quality.firstSelectedSampleTimeUs, 2000000);
    assert.strictEqual(result.quality.lastSelectedSampleTimeUs, 4000000);
    assert.strictEqual(result.quality.leadingSelectedGapUs, 2000000);
    assert.strictEqual(result.quality.trailingSelectedGapUs, 2000000);
    assert.ok(Math.abs(result.quality.selectedTimestampSpanCoverageRatio - 0.333) < 0.001);
    assert.strictEqual(result.quality.resampledStartTimeUs, range.startTimeUs);
    assert.strictEqual(result.quality.resampledEndTimeUs, range.endTimeUs);
    assert.strictEqual(result.quality.resampledRangeCoverageRatio, 1);
    assert.strictEqual(result.quality.resampledSampleCount, 6001);
    assert.strictEqual(
        result.quality.totalPossibleWindowCount,
        Math.floor(
            (result.quality.resampledSampleCount - result.quality.windowSize)
                / (result.quality.windowSize / 2)
        ) + 1
    );
    result.axes.forEach(function(axis) {
        assert.strictEqual(axis.available, false);
        assert.strictEqual(axis.firstFiniteSampleTimeUs, 2000000);
        assert.strictEqual(axis.lastFiniteSampleTimeUs, 4000000);
        assert.strictEqual(axis.leadingFiniteGapUs, 2000000);
        assert.strictEqual(axis.trailingFiniteGapUs, 2000000);
        assert.ok(Math.abs(axis.finiteTimeSpanCoverageRatio - 0.333) < 0.001);
    });
}

async function assertFilteredSourceIsLabeled() {
    const series = makeSeries({ gyroSource: "gyroADC-filtered", amplitudeDps: 2 });
    const result = await mechanical.analyzeTimeSeries(series, {
        timeRangeUs: { startTimeUs: 1000000, endTimeUs: 7000000 }
    });
    assert.strictEqual(result.status, "insufficient");
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.attention, false);
    assert.strictEqual(result.quality.status, "insufficient");
    assert.ok(result.reasonCodes.includes("FILTERED_GYRO_SOURCE_USED"));
    assert.ok(result.reasonCodes.includes("UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE"));
    result.axes.forEach(function(axis) {
        assert.strictEqual(axis.source, "gyroADC-filtered");
        assert.strictEqual(axis.available, false);
        assert.deepStrictEqual(axis.peaks, []);
    });
    assert.strictEqual(
        result.findings[0].id,
        "mechanical-unfiltered-gyro-required-for-clear-gate"
    );
    assert.ok(result.findings.every(function(finding) {
        return !/raw amplitude/i.test(finding.summary + " " + finding.action);
    }));

    const filteredAttention = await mechanical.analyzeTimeSeries(makeSeries({
        gyroSource: "gyroADC-filtered",
        amplitudeDps: 27,
        frequencyHz: 140
    }), {
        timeRangeUs: { startTimeUs: 1000000, endTimeUs: 7000000 }
    });
    assert.strictEqual(filteredAttention.status, "attention");
    assert.strictEqual(filteredAttention.available, true);
    assert.strictEqual(filteredAttention.attention, true);
    assert.ok(filteredAttention.reasonCodes.includes("FILTERED_GYRO_SOURCE_USED"));
    assert.ok(!filteredAttention.reasonCodes.includes(
        "UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE"
    ));
    filteredAttention.axes.forEach(function(axis) {
        assert.strictEqual(axis.source, "gyroADC-filtered");
        assert.strictEqual(axis.amplitudeKind, "filtered-gyro-output");
    });
}

async function assertRangeAndCancellationFailures() {
    const series = makeSeries();
    let missingRange = null;
    try {
        await mechanical.analyzeTimeSeries(series, {});
    } catch (error) {
        missingRange = error;
    }
    assert.ok(missingRange);
    assert.strictEqual(missingRange.code, "ANALYSIS_RANGE_REQUIRED");

    let invalidRange = null;
    try {
        await mechanical.analyzeTimeSeries(series, {
            timeRangeUs: { startTimeUs: -1, endTimeUs: 1000000 }
        });
    } catch (error) {
        invalidRange = error;
    }
    assert.ok(invalidRange);
    assert.strictEqual(invalidRange.code, "ANALYSIS_RANGE_INVALID");

    let cancelled = null;
    try {
        await mechanical.analyzeTimeSeries(series, {
            timeRangeUs: { startTimeUs: 0, endTimeUs: 8000000 },
            isCancelled: function() { return true; }
        });
    } catch (error) {
        cancelled = error;
    }
    assert.ok(cancelled);
    assert.strictEqual(cancelled.code, "ANALYSIS_CANCELLED");
}

(async function run() {
    await assertPersistentSpectrumAndContract();
    await assertAttentionAmplitudeGate();
    await assertTransientDoesNotTripPersistenceGate();
    await assertSeparatedEndBurstsDoNotLookPersistent();
    await assertSparseFiniteEvidenceIsInsufficient();
    await assertFlightLogAliasesAndExactRange();
    await assertFlightLogMiddleIslandIsInsufficient();
    await assertFilteredSourceIsLabeled();
    await assertRangeAndCancellationFailures();
    console.log("Advisor mechanical tests passed: exact-range Welch PSD and safe mechanics gate");
}());
