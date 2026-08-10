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

function makePitchPumpRecords(responseKind) {
    const records = [];
    const pumpStarts = [1000000, 2200000, 3400000, 4600000];

    for (let timeUs = 0; timeUs <= 5800000; timeUs += 50000) {
        let collective = 0;
        let actualRpm = 2000;
        pumpStarts.forEach(function(startUs) {
            if (timeUs >= startUs && timeUs <= startUs + 450000) {
                collective = 800;
                if (timeUs >= startUs + 50000) {
                    actualRpm += responseKind === "droop" ? -120 : 120;
                }
            }
        });
        records.push({
            timeUs,
            collective,
            targetRpm: 2000,
            actualRpm,
            motorPct: 72,
            active: true
        });
    }
    return records;
}

function assertPitchPumpRules() {
    const droop = metrics.detectPitchPumps(makePitchPumpRecords("droop"));
    const overshoot = metrics.detectPitchPumps(makePitchPumpRecords("overshoot"));
    const highOutput = makePitchPumpRecords("droop").map(function(record) {
        return Object.assign({}, record, { motorPct: 97 });
    });
    const unknownOutput = makePitchPumpRecords("droop").map(function(record) {
        return Object.assign({}, record, { motorPct: null });
    });

    assert.strictEqual(droop.sufficient, true);
    assert.strictEqual(droop.direction, "increase");
    assert.ok(droop.eligibleCount >= 3);
    assert.strictEqual(overshoot.sufficient, true);
    assert.strictEqual(overshoot.direction, "decrease");
    assert.strictEqual(metrics.detectPitchPumps(highOutput).sufficient, false);
    assert.strictEqual(metrics.detectPitchPumps(unknownOutput).sufficient, false);
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

function assertV1WithholdsSettingDirections() {
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
        firmwareVersion: "4.3.0",
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
        corruptFrames: 0,
        discontinuities: 0,
        hasEndMarker: true,
        endMarkerEvaluable: true,
        poweredSampleCount: 10000,
        failsafeSampleCount: 0,
        rxLossSampleCount: 0,
        invalidRxChannelsSampleCount: 0,
        configurationWarnings: [],
        coverage: { failsafePhase: true, rxHealth: true },
        debugName: "GOVERNOR",
        governorSource: "debug-governor"
    };
    const measurement = {
        quality: { sampleRateHz: 1000 },
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
            source: "debug-governor",
            targetRpm: 2000,
            actualRpm: 1950,
            rmseRpm: 80,
            maxDroopRpm: 150,
            maxOvershootRpm: 20,
            motorP95Pct: 75,
            headroomSufficient: true,
            pitchPumps: {
                sufficient: true,
                candidateCount: 4,
                direction: "increase",
                windows: [{ startTimeUs: 1000000, endTimeUs: 1800000 }]
            }
        }
    };

    const result = rules.buildEvidencePackage(snapshot, measurement);
    assert.strictEqual(result.capabilities.settingDirectionAdvice, false);
    assert.strictEqual(result.governor.direction, null);
    assert.ok(!result.findings.some(function(item) {
        return item.id === "governor-f-direction";
    }));
    assert.ok(result.findings.some(function(item) {
        return item.id === "governor-prerequisites-required";
    }));

    const unknownRxSnapshot = Object.assign({}, snapshot, {
        coverage: { failsafePhase: false, rxHealth: false }
    });
    const unknownRxResult = rules.buildEvidencePackage(unknownRxSnapshot, measurement);
    assert.ok(unknownRxResult.findings.some(function(item) {
        return item.id === "rx-safety-unknown";
    }));
    assert.strictEqual(
        unknownRxResult.evidence.find(function(item) { return item.id === "safety.rx-health"; }).value,
        null
    );

    const briefFailsafeResult = rules.buildEvidencePackage(
        Object.assign({}, snapshot, { failsafeSampleCount: 1 }),
        measurement
    );
    assert.strictEqual(briefFailsafeResult.grade.overall, "blocked");
    assert.ok(briefFailsafeResult.findings.some(function(item) {
        return item.id === "rx-safety-blocker";
    }));

    const unknownBatteryResult = rules.buildEvidencePackage(snapshot, Object.assign({}, measurement, {
        battery: {
            available: true,
            belowConfiguredWarning: null,
            cellCount: null,
            minimumVolts: 23,
            maximumVolts: 25,
            minimumCellVolts: null,
            warningCellVolts: null
        }
    }));
    assert.strictEqual(unknownBatteryResult.battery.status, "limited");
    assert.ok(unknownBatteryResult.findings.some(function(item) {
        return item.id === "battery-safety-unknown";
    }));
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
        frames: [[0, 100000], [0, 150000]],
        events: [],
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
            return name === "time" ? 1 : undefined;
        },
        getChunksInTimeRange: function() { return [chunk]; },
        getLogIndex: function() { return 0; },
        getNumCellsEstimate: function() { return false; }
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

    const gapInsideRange = await engine.analyzeFlightLog(flightLog, {
        timeRangeUs: { startTimeUs: 50000, endTimeUs: 175000 },
        isCancelled: function() { return false; }
    });
    assert.strictEqual(
        gapInsideRange.quality.discontinuities,
        1,
        "A gap with both boundary frames inside I/O must remain visible"
    );
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

    assert.strictEqual(result.schemaVersion, 2);
    assert.strictEqual(result.analysisMode, "deterministic-local");
    assert.strictEqual(result.capabilities.cloudRequired, false);
    assert.strictEqual(result.capabilities.directSettingWrites, false);
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
    assertV1WithholdsSettingDirections();
    await assertCancellation();
    await assertGapBoundaryScoping();
    await assertRotorflightFixture();
    console.log("Tune Advisor tests passed: deterministic rules and Rotorflight fixture evidence");
}());
