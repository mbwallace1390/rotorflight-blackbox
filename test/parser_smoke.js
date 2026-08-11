"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createSyntheticLog } = require("./helpers/synthetic_blackbox");

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
            const sourceValue = source[key];

            if (deep && sourceValue && !Array.isArray(sourceValue) && typeof sourceValue === "object") {
                const currentValue = target[key];
                const base = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
                    ? currentValue
                    : {};

                target[key] = extendObject(true, base, sourceValue);
            } else {
                target[key] = cloneForExtend(sourceValue, deep);
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
        navigator: { userAgent: "node-parser-smoke-test" },
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
        const absolutePath = path.join(repositoryRoot, relativePath);
        const source = fs.readFileSync(absolutePath, "utf8");

        vm.runInContext(source, context, { filename: relativePath });
    });

    return context;
}

function assertHappyPath(FlightLog) {
    const flightLog = new FlightLog(createSyntheticLog());

    assert.strictEqual(flightLog.getLogCount(), 1);
    assert.strictEqual(flightLog.getLogError(0), false);
    assert.strictEqual(flightLog.openLog(0), true);
    assert.strictEqual(flightLog.getMinTime(), 1000000);
    assert.strictEqual(flightLog.getMaxTime(), 1020000);
}

function assertEmptyLogErrors(FlightLog) {
    const truncated = new FlightLog(createSyntheticLog({
        includeData: false,
        includeEndEvent: false
    }));
    const paused = new FlightLog(createSyntheticLog({
        includeData: false,
        includeEndEvent: true
    }));

    assert.strictEqual(truncated.getLogError(0), "Log truncated, no data");
    assert.strictEqual(truncated.openLog(0), false);
    assert.strictEqual(paused.getLogError(0), "Logging paused, no data");
    assert.strictEqual(paused.openLog(0), false);
}

function assertPartialRecovery(FlightLog) {
    const partial = new FlightLog(createSyntheticLog({
        includeEndEvent: false,
        truncateFinalPFrame: true
    }));

    assert.strictEqual(partial.getLogError(0), false);
    assert.strictEqual(partial.openLog(0), true);
    assert.strictEqual(partial.getMinTime(), 1000000);
    assert.strictEqual(partial.getMaxTime(), 1020000);
}

function assertRealRotorflightFixture(FlightLog) {
    const fixturePath = path.join(
        repositoryRoot,
        "test/fixtures/third-party/propwash/LOG246.TXT"
    );
    const fixture = fs.readFileSync(fixturePath);
    const checksum = crypto.createHash("sha256").update(fixture).digest("hex");

    assert.strictEqual(
        checksum,
        "d7d2861e1823ef6b60783517a60cd84a1f9b1ca7a127cdd2dfbb0a11ed0f9cc8",
        "The pinned Rotorflight fixture checksum changed"
    );

    const flightLog = new FlightLog(Uint8Array.from(fixture));

    assert.strictEqual(flightLog.getLogCount(), 1);
    assert.strictEqual(flightLog.getLogError(0), false);
    assert.strictEqual(flightLog.openLog(0), true);
    const sysConfig = flightLog.getSysConfig();
    assert.strictEqual(sysConfig.firmwareType, 5);
    assert.strictEqual(sysConfig.firmwareVersion, "4.3.0");
    assert.strictEqual(
        sysConfig.gyro_decimation_hz,
        250,
        "Rotorflight gyro_decimation_hz must survive header parsing"
    );
    assert.strictEqual(
        sysConfig.unknownHeaders.some(function(header) {
            return header.name === "gyro_decimation_hz";
        }),
        false,
        "gyro_decimation_hz must be recognized instead of quarantined as unknown"
    );
    assert.ok(flightLog.getMaxTime() > flightLog.getMinTime());
    assert.ok(flightLog.getMainFieldNames().length > 20);
}

function main() {
    const runtime = loadParserRuntime();
    const FlightLog = runtime.FlightLog;

    assert.strictEqual(typeof FlightLog, "function", "FlightLog runtime did not load");
    assertHappyPath(FlightLog);
    assertEmptyLogErrors(FlightLog);
    assertPartialRecovery(FlightLog);
    assertRealRotorflightFixture(FlightLog);

    console.log("Parser smoke tests passed: synthetic edge cases and pinned Rotorflight 4.3 fixture");
}

main();
