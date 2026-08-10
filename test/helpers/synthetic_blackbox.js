"use strict";

const DEFAULT_HEADER = [
    "H Product:Blackbox flight data recorder by Nicholas Sherlock",
    "H Field I name:loopIteration,time",
    "H Field I predictor:0,0",
    "H Field I encoding:1,1",
    "H Field P predictor:0,0",
    "H Field P encoding:1,1",
    ""
].join("\n");

function encodeUnsignedVariableByte(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("Blackbox test values must be non-negative safe integers");
    }

    const bytes = [];

    do {
        let byte = value & 0x7f;
        value = Math.floor(value / 128);

        if (value > 0) {
            byte |= 0x80;
        }

        bytes.push(byte);
    } while (value > 0);

    return Buffer.from(bytes);
}

function dataFrame(type, loopIteration, time) {
    return Buffer.concat([
        Buffer.from(type, "ascii"),
        encodeUnsignedVariableByte(loopIteration),
        encodeUnsignedVariableByte(time)
    ]);
}

function endOfLogEvent() {
    return Buffer.concat([
        Buffer.from(["E".charCodeAt(0), 0xff]),
        Buffer.from("End of log\0", "ascii")
    ]);
}

function createSyntheticLog(options) {
    const settings = Object.assign({
        includeData: true,
        includeEndEvent: true,
        truncateFinalPFrame: false
    }, options);
    const parts = [Buffer.from(DEFAULT_HEADER, "ascii")];

    if (settings.includeData) {
        parts.push(dataFrame("I", 0, 1000000));
        parts.push(dataFrame("P", 1, 1010000));
        parts.push(dataFrame("I", 2, 1020000));
    }

    if (settings.truncateFinalPFrame) {
        parts.push(Buffer.from(["P".charCodeAt(0), 0x81]));
    } else if (settings.includeEndEvent) {
        parts.push(endOfLogEvent());
    }

    return Uint8Array.from(Buffer.concat(parts));
}

module.exports = {
    DEFAULT_HEADER,
    createSyntheticLog,
    dataFrame,
    encodeUnsignedVariableByte,
    endOfLogEvent
};
