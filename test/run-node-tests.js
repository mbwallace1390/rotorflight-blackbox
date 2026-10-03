"use strict";

// Load the browser's real scripts in one shared scope, without bundling or mocks
// of the decoder/math implementations. No NW.js or third-party packages needed.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const alerts = [];
const context = vm.createContext({
    alert: message => alerts.push(message),
    // tools.js selects one notification element at load time. DOM methods stay
    // absent so an unexpected attempt to exercise browser UI fails clearly.
    $: selector => ({selector})
});
for (const file of ["js/tools.js", "js/datastream.js", "js/decoders.js", "js/expo.js", "test/index.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {filename: file});
}
// The existing browser harness catches exceptions. Make a reported failure fail CI.
assert.deepStrictEqual(alerts, ["All tests pass"], "Existing browser math tests failed");

let checks = 2; // Existing expo-curve and straight-line tests.
function test(name, check) {
    check();
    checks++;
    console.log("PASS " + name);
}
function stream(bytes) {
    return new context.ArrayDataStream(bytes);
}

test("unsigned variable-byte boundaries", () => {
    for (const [bytes, expected] of [
        [[0], 0], [[0x7f], 127], [[0x80, 1], 128], [[0x80, 0x80, 1], 16384],
        [[0xff, 0xff, 0xff, 0xff, 0x0f], 4294967295]
    ]) {
        const input = stream(bytes);
        assert.strictEqual(input.readUnsignedVB(), expected);
        assert.strictEqual(input.pos, bytes.length);
    }
});

test("signed variable-byte ZigZag values", () => {
    for (const [bytes, expected] of [
        [[0], 0], [[1], -1], [[2], 1], [[0x7f], -64], [[0x80, 1], 64],
        [[0xff, 0xff, 0xff, 0xff, 0x0f], -2147483648]
    ]) {
        assert.strictEqual(stream(bytes).readSignedVB(), expected);
    }
});

test("truncated and oversized variable-byte data terminate", () => {
    const truncated = stream([0x80]);
    assert.strictEqual(truncated.readUnsignedVB(), 0);
    assert.strictEqual(truncated.eof, true);
    const oversized = stream([0x80, 0x80, 0x80, 0x80, 0x80, 1]);
    assert.strictEqual(oversized.readUnsignedVB(), 0);
    assert.strictEqual(oversized.pos, 5);
});

test("stream respects a bounded subrange", () => {
    const input = new context.ArrayDataStream([99, 65, 66, 99], 1, 3);
    assert.strictEqual(input.readChar(), "A");
    assert.strictEqual(input.readChar(), "B");
    assert.strictEqual(input.readByte(), -1);
    assert.strictEqual(input.pos, 3);
    assert.strictEqual(input.eof, true);
});

test("little-endian signed 16-bit extrema", () => {
    assert.strictEqual(stream([0x00, 0x80]).readS16(), -32768);
    assert.strictEqual(stream([0xff, 0x7f]).readS16(), 32767);
    assert.strictEqual(stream([0xff, 0xff]).readS16(), -1);
});

test("tagged signed values decode all four layouts", () => {
    for (const [bytes, expected] of [
        [[0x1e], [1, -1, -2]],
        [[0x47, 0x8f], [7, -8, -1]],
        [[0xa0, 0x1f, 0x3f], [-32, 31, -1]],
        [[0xe4, 0x80, 0x00, 0x80, 0x00, 0x00, 0x80], [-128, -32768, -8388608]]
    ]) {
        const values = [];
        const input = stream(bytes);
        input.readTag2_3S32(values);
        assert.deepStrictEqual(values, expected);
        assert.strictEqual(input.pos, bytes.length);
    }
});

test("expo interpolation is symmetric, finite and monotone", () => {
    const curve = new context.ExpoCurve(0, 0.7, 750, 1, 12);
    let previous = -Infinity;
    for (let value = 0; value <= 1500; value += 15) {
        const output = curve.lookup(value);
        assert(Number.isFinite(output));
        assert(output >= previous);
        assert(Math.abs(output + curve.lookup(-value)) < 1e-12);
        previous = output;
    }
    assert.strictEqual(curve.lookupRaw(375), 0.5);
});

test("expo offset and output scale", () => {
    const curve = new context.ExpoCurve(100, 1, 500, 2, 1);
    assert.strictEqual(curve.lookup(-100), 0);
    assert.strictEqual(curve.lookup(400), 2);
    assert.strictEqual(curve.lookup(-600), -2);
});

console.log("Passed " + checks + " math/decoder checks");
