"use strict";

/*
 * RotorLens selected-range mechanical spectrum analysis.
 *
 * The timestamp-alignment and overlapping Hann/Welch architecture was
 * informed by Iteratrix Propwash (MIT), revision
 * 804d3d5dd447c2e6067b02b7e1723aae8a19d5ff:
 * https://github.com/Iteratrix/propwash
 *
 * This implementation uses independently written PSD calibration, robust
 * peak/persistence gates, Rotorflight rotor-speed correlation, and
 * mechanics-first findings. It never recommends PID, governor, or filter
 * setting changes.
 */

(function(root, factory) {
    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RotorLensMechanicalAnalysis = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function() {
    var AXIS_NAMES = ["roll", "pitch", "yaw"];
    var COLLECTION_WINDOW_US = 1000000;
    var MAX_SELECTION_DURATION_US = 120000000;
    var MAX_INPUT_SAMPLES = 262144;
    var MAX_RESAMPLED_SAMPLES = 262144;
    var MAX_SAMPLE_RATE_HZ = 8000;
    var MAX_WELCH_WINDOWS = 128;
    var MIN_WELCH_WINDOWS = 3;
    var MIN_FREQUENCY_HZ = 5;
    var MAX_FREQUENCY_HZ = 1000;
    var PEAK_PROMINENCE_DB = 8;
    var PEAK_RELATIVE_POWER_DB = 8;
    var WINDOW_PRESENCE_DB = 6;
    var MIN_PERSISTENCE_RATIO = 0.25;
    var MIN_VALID_WINDOW_COVERAGE_RATIO = 0.75;
    var MIN_FINITE_SAMPLE_COVERAGE_RATIO = 0.75;
    var MIN_FINITE_TIME_SPAN_COVERAGE_RATIO = 0.75;
    var ATTENTION_TIME_BUCKET_COUNT = 4;
    var MIN_ATTENTION_OCCUPIED_BUCKETS = 3;
    var MAX_ATTENTION_UNSUPPORTED_GAP_RATIO = 0.35;
    // RotorLens experimental product gate, calibrated conservatively against
    // the bundled synthetic clean/problem fixtures. This is not an official
    // Rotorflight limit and does not diagnose a failed component.
    var ATTENTION_BAND_RMS_THRESHOLD_DPS = 8;
    var MAX_PEAKS_PER_AXIS = 5;
    var TARGET_FREQUENCY_RESOLUTION_HZ = 2;

    var SOURCES = Object.freeze([
        Object.freeze({
            id: "rotorflight-filter-tuning",
            title: "Rotorflight First Flight & Filter Tuning",
            url: "https://rotorflight.org/docs/Tuning/First-Flight-Filter-Tuning"
        }),
        Object.freeze({
            id: "rotorflight-rpm-filters",
            title: "Rotorflight RPM Filters",
            url: "https://rotorflight.org/docs/2.2.0/setup/rpm-filters"
        })
    ]);

    function codedError(ErrorType, code, message) {
        var error = new ErrorType(message);
        error.code = code;
        return error;
    }

    function checkCancelled(options) {
        if (options && typeof options.isCancelled === "function" && options.isCancelled()) {
            throw codedError(Error, "ANALYSIS_CANCELLED", "Mechanical analysis was cancelled");
        }
    }

    function reportProgress(options, phase, completed, total) {
        if (!options || typeof options.onProgress !== "function") {
            return;
        }
        try {
            options.onProgress({ phase: phase, completed: completed, total: total });
        } catch (error) {
            // Rendering progress must never invalidate a completed measurement.
        }
    }

    function yieldToEventLoop() {
        return new Promise(function(resolve) { setTimeout(resolve, 0); });
    }

    function round(value, digits) {
        if (!Number.isFinite(value)) {
            return null;
        }
        var scale = Math.pow(10, digits === undefined ? 3 : digits);
        return Math.round(value * scale) / scale;
    }

    function quantile(values, percentile) {
        if (!values || values.length === 0) {
            return null;
        }
        var sorted = Array.prototype.slice.call(values).filter(Number.isFinite)
            .sort(function(left, right) { return left - right; });
        if (sorted.length === 0) {
            return null;
        }
        var position = (sorted.length - 1) * Math.max(0, Math.min(1, percentile));
        var lower = Math.floor(position);
        var upper = Math.ceil(position);
        var fraction = position - lower;
        return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
    }

    function median(values) {
        return quantile(values, 0.5);
    }

    function addReason(reasons, code) {
        if (reasons.indexOf(code) === -1) {
            reasons.push(code);
        }
    }

    function normalizeRange(timeRangeUs, minimumTimeUs, maximumTimeUs) {
        if (!timeRangeUs
                || !Number.isFinite(timeRangeUs.startTimeUs)
                || !Number.isFinite(timeRangeUs.endTimeUs)) {
            throw codedError(
                RangeError,
                "ANALYSIS_RANGE_REQUIRED",
                "Set finite graph In and Out markers before mechanical analysis"
            );
        }
        if (timeRangeUs.startTimeUs >= timeRangeUs.endTimeUs
                || !Number.isFinite(minimumTimeUs)
                || !Number.isFinite(maximumTimeUs)
                || timeRangeUs.startTimeUs < minimumTimeUs
                || timeRangeUs.endTimeUs > maximumTimeUs) {
            throw codedError(
                RangeError,
                "ANALYSIS_RANGE_INVALID",
                "The selected graph In/Out range is invalid for this log"
            );
        }
        return Object.freeze({
            startTimeUs: timeRangeUs.startTimeUs,
            endTimeUs: timeRangeUs.endTimeUs
        });
    }

    function capabilities() {
        return Object.freeze({
            offline: true,
            selectedRangeRequired: true,
            selectedRangeOnly: true,
            rawLogIncluded: false,
            componentDiagnosis: false,
            tuningRecommendations: false,
            settingDirectionAdvice: false,
            directSettingWrites: false
        });
    }

    function baseResult(range, status, reasonCodes, sampleCount) {
        return {
            schemaVersion: 1,
            engineVersion: "0.1.0",
            analysisMode: "deterministic-local",
            capabilities: capabilities(),
            range: {
                startTimeUs: range.startTimeUs,
                endTimeUs: range.endTimeUs,
                durationUs: range.endTimeUs - range.startTimeUs,
                sampleCount: Number.isFinite(sampleCount) ? sampleCount : null
            },
            status: status,
            attention: status === "attention",
            available: status !== "insufficient",
            reasonCodes: reasonCodes.slice(),
            quality: null,
            rpmEvidence: {
                headspeed: unavailableRpmEvidence("headspeed", "FIELD_MISSING"),
                tailspeed: unavailableRpmEvidence("tailspeed", "FIELD_MISSING")
            },
            axes: [],
            findings: [],
            sources: SOURCES
        };
    }

    function unavailableRpmEvidence(field, reason) {
        return {
            field: field,
            available: false,
            trustworthy: false,
            reasonCode: reason,
            sampleCount: 0,
            coverageRatio: 0,
            medianRpm: null,
            fundamentalHz: null,
            relativeSpread: null
        };
    }

    function insufficientResult(range, reasonCodes, sampleCount, detail) {
        var result = baseResult(range, "insufficient", reasonCodes, sampleCount);
        result.quality = {
            status: "insufficient",
            totalPossibleWindowCount: null,
            validWindowCount: null,
            validWindowCoverageRatio: null,
            finiteSampleCoverageRatio: null,
            finiteTimeSpanCoverageRatio: null,
            minimumCoverageRatio: MIN_VALID_WINDOW_COVERAGE_RATIO,
            attentionBandRmsThresholdDps: ATTENTION_BAND_RMS_THRESHOLD_DPS
        };
        Object.keys(detail || {}).forEach(function(key) {
            result.quality[key] = detail[key];
        });
        result.findings.push({
            id: "mechanical-analysis-insufficient",
            severity: "caution",
            title: "Mechanical spectrum needs a cleaner selection",
            summary: "This exact In/Out range could not produce reliable persistent-frequency evidence.",
            action: "Choose a continuous powered-flight range with logged gyro data and steady timing, then analyze it again.",
            axis: null,
            timeRangeUs: [range.startTimeUs, range.endTimeUs],
            evidence: { reasonCodes: reasonCodes.slice() },
            sourceIds: ["rotorflight-filter-tuning"]
        });
        return result;
    }

    function fieldIndex(flightLog, name) {
        var index = flightLog.getMainFieldIndexByName(name);
        return Number.isInteger(index) && index >= 0 ? index : null;
    }

    function finiteFrameValue(frame, index) {
        if (index === null) {
            return NaN;
        }
        var value = frame[index];
        return Number.isFinite(value) ? value : NaN;
    }

    function findGyroAxis(flightLog, axis) {
        var candidates = [
            { name: "gyroRAW[" + axis + "]", source: "gyroRAW" },
            { name: "gyroUnfilt[" + axis + "]", source: "gyroUnfilt" },
            { name: "gyroADC[" + axis + "]", source: "gyroADC-filtered" }
        ];
        for (var i = 0; i < candidates.length; i++) {
            var index = fieldIndex(flightLog, candidates[i].name);
            if (index !== null) {
                return { index: index, source: candidates[i].source };
            }
        }
        return { index: null, source: "missing" };
    }

    function sameFinite(left, right) {
        return (Number.isNaN(left) && Number.isNaN(right)) || left === right;
    }

    function sameCollectedFrame(collected, values) {
        var last = collected.timeUs.length - 1;
        if (last < 0 || collected.timeUs[last] !== values.timeUs) {
            return false;
        }
        for (var axis = 0; axis < 3; axis++) {
            if (!sameFinite(collected.gyro[axis].values[last], values.gyro[axis])) {
                return false;
            }
        }
        return sameFinite(collected.headspeedRpm[last], values.headspeedRpm)
            && sameFinite(collected.tailspeedRpm[last], values.tailspeedRpm);
    }

    async function collectFlightLogSelection(flightLog, range, options) {
        var gyro = AXIS_NAMES.map(function(name, axis) {
            var resolved = findGyroAxis(flightLog, axis);
            return { axis: name, source: resolved.source, index: resolved.index, values: [] };
        });
        var indexes = {
            time: fieldIndex(flightLog, "time"),
            headspeed: fieldIndex(flightLog, "headspeed"),
            tailspeed: fieldIndex(flightLog, "tailspeed")
        };
        var collected = {
            timeUs: [],
            gyro: gyro,
            headspeedRpm: [],
            tailspeedRpm: [],
            nonMonotonicTimestampCount: 0,
            duplicateTimestampCount: 0,
            limitExceeded: false
        };

        if (indexes.time === null) {
            return collected;
        }

        var durationUs = range.endTimeUs - range.startTimeUs;
        var windowCount = Math.max(1, Math.ceil(durationUs / COLLECTION_WINDOW_US));
        reportProgress(options, "collect", 0, windowCount);

        for (var windowIndex = 0; windowIndex < windowCount; windowIndex++) {
            checkCancelled(options);
            var windowStartUs = range.startTimeUs + windowIndex * COLLECTION_WINDOW_US;
            var windowEndUs = Math.min(
                range.endTimeUs,
                windowStartUs + COLLECTION_WINDOW_US
            );
            var isLastWindow = windowIndex === windowCount - 1;
            var chunks = flightLog.getChunksInTimeRange(windowStartUs, windowEndUs) || [];

            for (var chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                var frames = chunks[chunkIndex].frames || [];
                for (var frameIndex = 0; frameIndex < frames.length; frameIndex++) {
                    var frame = frames[frameIndex];
                    var timeUs = finiteFrameValue(frame, indexes.time);
                    if (!Number.isFinite(timeUs)
                            || timeUs < windowStartUs
                            || (!isLastWindow && timeUs >= windowEndUs)
                            || timeUs > range.endTimeUs) {
                        continue;
                    }
                    var values = {
                        timeUs: timeUs,
                        gyro: gyro.map(function(axisInfo) {
                            return finiteFrameValue(frame, axisInfo.index);
                        }),
                        headspeedRpm: finiteFrameValue(frame, indexes.headspeed),
                        tailspeedRpm: finiteFrameValue(frame, indexes.tailspeed)
                    };
                    var lastTimeUs = collected.timeUs.length > 0
                        ? collected.timeUs[collected.timeUs.length - 1]
                        : null;
                    if (lastTimeUs !== null && timeUs <= lastTimeUs) {
                        if (timeUs === lastTimeUs && sameCollectedFrame(collected, values)) {
                            collected.duplicateTimestampCount++;
                        } else {
                            collected.nonMonotonicTimestampCount++;
                        }
                        continue;
                    }
                    if (collected.timeUs.length >= MAX_INPUT_SAMPLES) {
                        collected.limitExceeded = true;
                        return collected;
                    }
                    collected.timeUs.push(timeUs);
                    for (var axis = 0; axis < 3; axis++) {
                        collected.gyro[axis].values.push(values.gyro[axis]);
                    }
                    collected.headspeedRpm.push(values.headspeedRpm);
                    collected.tailspeedRpm.push(values.tailspeedRpm);
                    if ((collected.timeUs.length & 2047) === 0) {
                        checkCancelled(options);
                    }
                }
            }

            reportProgress(options, "collect", windowIndex + 1, windowCount);
            await yieldToEventLoop();
        }
        return collected;
    }

    function lowerBound(values, target) {
        var low = 0;
        var high = values.length;
        while (low < high) {
            var middle = (low + high) >>> 1;
            if (values[middle] < target) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return low;
    }

    function upperBound(values, target) {
        var low = 0;
        var high = values.length;
        while (low < high) {
            var middle = (low + high) >>> 1;
            if (values[middle] <= target) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return low;
    }

    async function collectTimeSeriesSelection(series, range, options) {
        var times = series && series.timeUs;
        if (!times || typeof times.length !== "number" || times.length === 0) {
            return {
                timeUs: [], gyro: [], headspeedRpm: [], tailspeedRpm: [],
                nonMonotonicTimestampCount: 0, duplicateTimestampCount: 0,
                limitExceeded: false
            };
        }
        var start = lowerBound(times, range.startTimeUs);
        var end = upperBound(times, range.endTimeUs);
        var axisInputs = series.gyro || {};
        var sources = series.gyroSources || {};
        var collected = {
            timeUs: [],
            gyro: AXIS_NAMES.map(function(axis) {
                return {
                    axis: axis,
                    source: sources[axis] || series.gyroSource || "gyroRAW",
                    values: []
                };
            }),
            headspeedRpm: [],
            tailspeedRpm: [],
            nonMonotonicTimestampCount: 0,
            duplicateTimestampCount: 0,
            limitExceeded: false
        };
        reportProgress(options, "collect", 0, Math.max(1, end - start));
        for (var index = start; index < end; index++) {
            var timeUs = times[index];
            if (!Number.isFinite(timeUs)) {
                continue;
            }
            var lastTimeUs = collected.timeUs.length
                ? collected.timeUs[collected.timeUs.length - 1]
                : null;
            if (lastTimeUs !== null && timeUs <= lastTimeUs) {
                if (timeUs === lastTimeUs) {
                    collected.duplicateTimestampCount++;
                } else {
                    collected.nonMonotonicTimestampCount++;
                }
                continue;
            }
            if (collected.timeUs.length >= MAX_INPUT_SAMPLES) {
                collected.limitExceeded = true;
                return collected;
            }
            collected.timeUs.push(timeUs);
            AXIS_NAMES.forEach(function(axis, axisIndex) {
                var values = axisInputs[axis] || axisInputs[axisIndex] || [];
                collected.gyro[axisIndex].values.push(
                    Number.isFinite(values[index]) ? values[index] : NaN
                );
            });
            collected.headspeedRpm.push(
                series.headspeedRpm && Number.isFinite(series.headspeedRpm[index])
                    ? series.headspeedRpm[index] : NaN
            );
            collected.tailspeedRpm.push(
                series.tailspeedRpm && Number.isFinite(series.tailspeedRpm[index])
                    ? series.tailspeedRpm[index] : NaN
            );
            if (((index - start) & 2047) === 0) {
                checkCancelled(options);
            }
        }
        reportProgress(options, "collect", Math.max(1, end - start), Math.max(1, end - start));
        await yieldToEventLoop();
        return collected;
    }

    function sampledIntervals(timeUs) {
        var intervals = [];
        var stride = Math.max(1, Math.ceil((timeUs.length - 1) / 8192));
        for (var index = stride; index < timeUs.length; index += stride) {
            var deltaUs = (timeUs[index] - timeUs[index - stride]) / stride;
            if (Number.isFinite(deltaUs) && deltaUs > 0) {
                intervals.push(deltaUs);
            }
        }
        return intervals;
    }

    function chooseWindowSize(sampleRateHz, sampleCount) {
        var target = Math.ceil(sampleRateHz / TARGET_FREQUENCY_RESOLUTION_HZ);
        var size = 1;
        while (size < target) {
            size *= 2;
        }
        size = Math.max(256, Math.min(4096, size));
        while (size > 256 && sampleCount < size + (size / 2) * (MIN_WELCH_WINDOWS - 1)) {
            size /= 2;
        }
        return size;
    }

    function resampleLinear(timeUs, values, firstTimeUs, sampleIntervalUs, count, maxGapUs) {
        var output = new Float64Array(count);
        var cursor = 0;
        for (var outputIndex = 0; outputIndex < count; outputIndex++) {
            var targetTimeUs = firstTimeUs + outputIndex * sampleIntervalUs;
            if (targetTimeUs < timeUs[0] || targetTimeUs > timeUs[timeUs.length - 1]) {
                output[outputIndex] = NaN;
                continue;
            }
            while (cursor + 1 < timeUs.length && timeUs[cursor + 1] < targetTimeUs) {
                cursor++;
            }
            if (cursor >= timeUs.length || !Number.isFinite(values[cursor])) {
                output[outputIndex] = NaN;
            } else if (timeUs[cursor] === targetTimeUs || cursor + 1 >= timeUs.length) {
                output[outputIndex] = values[cursor];
            } else {
                var next = cursor + 1;
                var spanUs = timeUs[next] - timeUs[cursor];
                if (spanUs <= 0 || spanUs > maxGapUs || !Number.isFinite(values[next])) {
                    output[outputIndex] = NaN;
                } else {
                    var fraction = (targetTimeUs - timeUs[cursor]) / spanUs;
                    output[outputIndex] = values[cursor]
                        + (values[next] - values[cursor]) * fraction;
                }
            }
        }
        return output;
    }

    function hannWindow(size) {
        var result = new Float64Array(size);
        var sumSquares = 0;
        for (var index = 0; index < size; index++) {
            var value = 0.5 * (1 - Math.cos(2 * Math.PI * index / (size - 1)));
            result[index] = value;
            sumSquares += value * value;
        }
        return { values: result, sumSquares: sumSquares };
    }

    function fftInPlace(real, imaginary) {
        var size = real.length;
        var j = 0;
        for (var i = 1; i < size; i++) {
            var bit = size >> 1;
            while (j & bit) {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            if (i < j) {
                var realSwap = real[i];
                real[i] = real[j];
                real[j] = realSwap;
                var imagSwap = imaginary[i];
                imaginary[i] = imaginary[j];
                imaginary[j] = imagSwap;
            }
        }
        for (var length = 2; length <= size; length <<= 1) {
            var angle = -2 * Math.PI / length;
            var baseReal = Math.cos(angle);
            var baseImaginary = Math.sin(angle);
            for (var start = 0; start < size; start += length) {
                var twiddleReal = 1;
                var twiddleImaginary = 0;
                for (var offset = 0; offset < length / 2; offset++) {
                    var even = start + offset;
                    var odd = even + length / 2;
                    var oddReal = real[odd] * twiddleReal
                        - imaginary[odd] * twiddleImaginary;
                    var oddImaginary = real[odd] * twiddleImaginary
                        + imaginary[odd] * twiddleReal;
                    real[odd] = real[even] - oddReal;
                    imaginary[odd] = imaginary[even] - oddImaginary;
                    real[even] += oddReal;
                    imaginary[even] += oddImaginary;
                    var nextTwiddleReal = twiddleReal * baseReal
                        - twiddleImaginary * baseImaginary;
                    twiddleImaginary = twiddleReal * baseImaginary
                        + twiddleImaginary * baseReal;
                    twiddleReal = nextTwiddleReal;
                }
            }
        }
    }

    function chooseWindowStarts(samples, windowSize) {
        var step = windowSize / 2;
        var candidates = [];
        var totalPossible = 0;
        for (var start = 0; start + windowSize <= samples.length; start += step) {
            totalPossible++;
            var valid = true;
            for (var index = start; index < start + windowSize; index++) {
                if (!Number.isFinite(samples[index])) {
                    valid = false;
                    break;
                }
            }
            if (valid) {
                candidates.push(start);
            }
        }
        if (candidates.length <= MAX_WELCH_WINDOWS) {
            return {
                totalPossible: totalPossible,
                candidates: candidates.length,
                starts: candidates
            };
        }
        var selected = [];
        for (var selectedIndex = 0; selectedIndex < MAX_WELCH_WINDOWS; selectedIndex++) {
            var candidateIndex = Math.round(
                selectedIndex * (candidates.length - 1) / (MAX_WELCH_WINDOWS - 1)
            );
            selected.push(candidates[candidateIndex]);
        }
        return {
            totalPossible: totalPossible,
            candidates: candidates.length,
            starts: selected
        };
    }

    function localMedian(psd, bin, radius, exclusion) {
        var values = [];
        var start = Math.max(1, bin - radius);
        var end = Math.min(psd.length - 1, bin + radius);
        for (var index = start; index <= end; index++) {
            if (Math.abs(index - bin) > exclusion && Number.isFinite(psd[index])) {
                values.push(psd[index]);
            }
        }
        return median(values);
    }

    function dbRatio(numerator, denominator) {
        var floor = 1e-30;
        return 10 * Math.log10(Math.max(floor, numerator) / Math.max(floor, denominator));
    }

    function peakBandwidth(psd, peakBin, frequencyResolutionHz) {
        var threshold = psd[peakBin] / 2;
        var left = peakBin;
        var right = peakBin;
        while (left > 1 && psd[left - 1] >= threshold) {
            left--;
        }
        while (right + 1 < psd.length && psd[right + 1] >= threshold) {
            right++;
        }
        return {
            leftBin: left,
            rightBin: right,
            bandwidthHz: Math.max(frequencyResolutionHz, (right - left + 1) * frequencyResolutionHz)
        };
    }

    function detectPeaks(psd, windowPsd, windowStarts, sampleCount, sampleRateHz, windowSize) {
        var frequencyResolutionHz = sampleRateHz / windowSize;
        var minimumBin = Math.max(1, Math.ceil(MIN_FREQUENCY_HZ / frequencyResolutionHz));
        var maximumHz = Math.min(MAX_FREQUENCY_HZ, sampleRateHz * 0.45);
        var maximumBin = Math.min(psd.length - 2, Math.floor(maximumHz / frequencyResolutionHz));
        var bandValues = [];
        for (var bandBin = minimumBin; bandBin <= maximumBin; bandBin++) {
            bandValues.push(psd[bandBin]);
        }
        var globalFloor = median(bandValues);
        var candidates = [];
        var radius = Math.max(6, Math.round(12 / frequencyResolutionHz));
        var exclusion = Math.max(1, Math.round(2 / frequencyResolutionHz));
        for (var bin = minimumBin; bin <= maximumBin; bin++) {
            if (!(psd[bin] > psd[bin - 1] && psd[bin] >= psd[bin + 1])) {
                continue;
            }
            var noiseFloor = localMedian(psd, bin, radius, exclusion);
            var prominenceDb = dbRatio(psd[bin], noiseFloor);
            var relativePowerDb = dbRatio(psd[bin], globalFloor);
            if (prominenceDb < PEAK_PROMINENCE_DB
                    || relativePowerDb < PEAK_RELATIVE_POWER_DB) {
                continue;
            }
            var supportingWindowCount = 0;
            for (var windowIndex = 0; windowIndex < windowPsd.length; windowIndex++) {
                var row = windowPsd[windowIndex];
                var rowPeak = Math.max(
                    row[Math.max(1, bin - 1)],
                    row[bin],
                    row[Math.min(row.length - 1, bin + 1)]
                );
                var rowFloor = localMedian(row, bin, radius, exclusion);
                if (dbRatio(rowPeak, rowFloor) >= WINDOW_PRESENCE_DB) {
                    supportingWindowCount++;
                }
            }
            var persistenceRatio = windowPsd.length > 0
                ? supportingWindowCount / windowPsd.length : 0;
            var requiredWindows = Math.max(
                MIN_WELCH_WINDOWS,
                Math.ceil(windowPsd.length * MIN_PERSISTENCE_RATIO)
            );
            if (supportingWindowCount < requiredWindows) {
                continue;
            }
            var bandwidth = peakBandwidth(psd, bin, frequencyResolutionHz);
            var bandPower = 0;
            for (var powerBin = bandwidth.leftBin;
                    powerBin <= bandwidth.rightBin; powerBin++) {
                bandPower += psd[powerBin] * frequencyResolutionHz;
            }
            // The averaged Welch spectrum can be raised by one short event.
            // Require the absolute 8 deg/s band-RMS gate to pass in the same
            // minimum number of individual windows before it can block tuning.
            var attentionSupportingWindowCount = 0;
            var firstAttentionWindow = null;
            var lastAttentionWindow = null;
            var attentionWindowStarts = [];
            for (var attentionWindowIndex = 0;
                    attentionWindowIndex < windowPsd.length; attentionWindowIndex++) {
                var attentionRow = windowPsd[attentionWindowIndex];
                var attentionBandPower = 0;
                for (var attentionBin = bandwidth.leftBin;
                        attentionBin <= bandwidth.rightBin; attentionBin++) {
                    attentionBandPower += attentionRow[attentionBin]
                        * frequencyResolutionHz;
                }
                if (Math.sqrt(Math.max(0, attentionBandPower))
                        >= ATTENTION_BAND_RMS_THRESHOLD_DPS) {
                    attentionSupportingWindowCount++;
                    if (firstAttentionWindow === null) {
                        firstAttentionWindow = attentionWindowIndex;
                    }
                    lastAttentionWindow = attentionWindowIndex;
                    attentionWindowStarts.push(windowStarts[attentionWindowIndex]);
                }
            }
            var attentionPersistenceRatio = windowPsd.length > 0
                ? attentionSupportingWindowCount / windowPsd.length : 0;
            var attentionTemporalSpanRatio = firstAttentionWindow === null
                ? 0
                : (lastAttentionWindow - firstAttentionWindow + 1) / windowPsd.length;
            attentionTemporalSpanRatio = round(attentionTemporalSpanRatio, 3);
            var occupiedBuckets = Object.create(null);
            var maximumWindowStart = Math.max(1, sampleCount - windowSize);
            attentionWindowStarts.forEach(function(attentionStart) {
                var bucket = Math.min(
                    ATTENTION_TIME_BUCKET_COUNT - 1,
                    Math.floor(attentionStart * ATTENTION_TIME_BUCKET_COUNT
                        / (maximumWindowStart + 1))
                );
                occupiedBuckets[bucket] = true;
            });
            var attentionOccupiedBucketCount = Object.keys(occupiedBuckets).length;
            var evaluatedStepSizes = [];
            for (var evaluatedIndex = 1; evaluatedIndex < windowStarts.length;
                    evaluatedIndex++) {
                evaluatedStepSizes.push(
                    windowStarts[evaluatedIndex] - windowStarts[evaluatedIndex - 1]
                );
            }
            var nominalEvaluatedStep = median(evaluatedStepSizes) || windowSize / 2;
            var maximumUnsupportedGapSamples = 0;
            for (var supportIndex = 1; supportIndex < attentionWindowStarts.length;
                    supportIndex++) {
                maximumUnsupportedGapSamples = Math.max(
                    maximumUnsupportedGapSamples,
                    Math.max(0, attentionWindowStarts[supportIndex]
                        - attentionWindowStarts[supportIndex - 1]
                        - nominalEvaluatedStep)
                );
            }
            var attentionMaximumGapRatio = round(
                maximumUnsupportedGapSamples / maximumWindowStart,
                3
            );
            candidates.push({
                bin: bin,
                frequencyHz: bin * frequencyResolutionHz,
                psdDps2PerHz: psd[bin],
                localNoisePsdDps2PerHz: noiseFloor,
                relativePowerDb: relativePowerDb,
                prominenceDb: prominenceDb,
                bandwidthHz: bandwidth.bandwidthHz,
                bandPowerDps2: bandPower,
                bandRmsDps: Math.sqrt(Math.max(0, bandPower)),
                supportingWindowCount: supportingWindowCount,
                evaluatedWindowCount: windowPsd.length,
                persistenceRatio: persistenceRatio,
                attentionSupportingWindowCount: attentionSupportingWindowCount,
                attentionPersistenceRatio: attentionPersistenceRatio,
                attentionTemporalSpanRatio: attentionTemporalSpanRatio,
                attentionOccupiedBucketCount: attentionOccupiedBucketCount,
                attentionMaximumGapRatio: attentionMaximumGapRatio,
                attentionEligible: attentionSupportingWindowCount >= requiredWindows
                    && attentionTemporalSpanRatio >= 0.5
                    && attentionOccupiedBucketCount >= MIN_ATTENTION_OCCUPIED_BUCKETS
                    && attentionMaximumGapRatio <= MAX_ATTENTION_UNSUPPORTED_GAP_RATIO,
                harmonicMatch: null
            });
        }
        candidates.sort(function(left, right) {
            if (right.persistenceRatio !== left.persistenceRatio) {
                return right.persistenceRatio - left.persistenceRatio;
            }
            return right.prominenceDb - left.prominenceDb;
        });
        var selected = [];
        candidates.forEach(function(candidate) {
            var tooClose = selected.some(function(existing) {
                var separation = Math.max(
                    frequencyResolutionHz * 2,
                    Math.min(candidate.frequencyHz, existing.frequencyHz) * 0.025
                );
                return Math.abs(candidate.frequencyHz - existing.frequencyHz) < separation;
            });
            if (!tooClose && selected.length < MAX_PEAKS_PER_AXIS) {
                selected.push(candidate);
            }
        });
        return { peaks: selected, globalNoiseFloor: globalFloor, maximumHz: maximumHz };
    }

    async function spectrumForAxis(
        axisInfo,
        samples,
        sampleRateHz,
        windowSize,
        resampledStartTimeUs,
        sampleIntervalUs,
        selectedRange,
        options
    ) {
        var selection = chooseWindowStarts(samples, windowSize);
        var windowStarts = selection.starts;
        var sum = 0;
        var sumSquares = 0;
        var finiteCount = 0;
        var firstFiniteIndex = null;
        var lastFiniteIndex = null;
        for (var sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
            if (Number.isFinite(samples[sampleIndex])) {
                sum += samples[sampleIndex];
                sumSquares += samples[sampleIndex] * samples[sampleIndex];
                finiteCount++;
                if (firstFiniteIndex === null) {
                    firstFiniteIndex = sampleIndex;
                }
                lastFiniteIndex = sampleIndex;
            }
        }
        var finiteSampleCoverageRatio = samples.length > 0
            ? finiteCount / samples.length : 0;
        var firstFiniteSampleTimeUs = firstFiniteIndex === null
            ? null : resampledStartTimeUs + firstFiniteIndex * sampleIntervalUs;
        var lastFiniteSampleTimeUs = lastFiniteIndex === null
            ? null : resampledStartTimeUs + lastFiniteIndex * sampleIntervalUs;
        var selectedDurationUs = selectedRange.endTimeUs - selectedRange.startTimeUs;
        var finiteTimeSpanCoverageRatio = firstFiniteSampleTimeUs === null
                || lastFiniteSampleTimeUs === null || selectedDurationUs <= 0
            ? 0
            : Math.min(
                1,
                Math.max(0, lastFiniteSampleTimeUs - firstFiniteSampleTimeUs)
                    / selectedDurationUs
            );
        var leadingFiniteGapUs = firstFiniteSampleTimeUs === null
            ? selectedDurationUs
            : Math.max(0, firstFiniteSampleTimeUs - selectedRange.startTimeUs);
        var trailingFiniteGapUs = lastFiniteSampleTimeUs === null
            ? selectedDurationUs
            : Math.max(0, selectedRange.endTimeUs - lastFiniteSampleTimeUs);
        var validWindowCoverageRatio = selection.totalPossible > 0
            ? selection.candidates / selection.totalPossible : 0;
        if (windowStarts.length < MIN_WELCH_WINDOWS) {
            return {
                axis: axisInfo.axis,
                source: axisInfo.source,
                available: false,
                reasonCode: "INSUFFICIENT_CONTIGUOUS_GYRO_DATA",
                windowCount: windowStarts.length,
                candidateWindowCount: selection.candidates,
                totalPossibleWindowCount: selection.totalPossible,
                validWindowCount: selection.candidates,
                validWindowCoverageRatio: validWindowCoverageRatio,
                finiteSampleCoverageRatio: finiteSampleCoverageRatio,
                finiteTimeSpanCoverageRatio: finiteTimeSpanCoverageRatio,
                firstFiniteSampleTimeUs: firstFiniteSampleTimeUs,
                lastFiniteSampleTimeUs: lastFiniteSampleTimeUs,
                leadingFiniteGapUs: leadingFiniteGapUs,
                trailingFiniteGapUs: trailingFiniteGapUs,
                peaks: []
            };
        }
        var hann = hannWindow(windowSize);
        var binCount = windowSize / 2 + 1;
        var averagedPsd = new Float64Array(binCount);
        var windowPsd = [];
        var mean = finiteCount ? sum / finiteCount : 0;
        var acVariance = finiteCount
            ? Math.max(0, sumSquares / finiteCount - mean * mean) : 0;
        for (var windowIndex = 0; windowIndex < windowStarts.length; windowIndex++) {
            checkCancelled(options);
            var start = windowStarts[windowIndex];
            var windowMean = 0;
            for (var meanIndex = 0; meanIndex < windowSize; meanIndex++) {
                windowMean += samples[start + meanIndex];
            }
            windowMean /= windowSize;
            var real = new Float64Array(windowSize);
            var imaginary = new Float64Array(windowSize);
            for (var fftIndex = 0; fftIndex < windowSize; fftIndex++) {
                real[fftIndex] = (samples[start + fftIndex] - windowMean)
                    * hann.values[fftIndex];
            }
            fftInPlace(real, imaginary);
            var row = new Float64Array(binCount);
            for (var bin = 0; bin < binCount; bin++) {
                var power = (real[bin] * real[bin] + imaginary[bin] * imaginary[bin])
                    / (sampleRateHz * hann.sumSquares);
                if (bin > 0 && bin < windowSize / 2) {
                    power *= 2;
                }
                row[bin] = power;
                averagedPsd[bin] += power;
            }
            windowPsd.push(row);
            if ((windowIndex & 7) === 7) {
                await yieldToEventLoop();
            }
        }
        for (var averageBin = 0; averageBin < binCount; averageBin++) {
            averagedPsd[averageBin] /= windowStarts.length;
        }
        var detected = detectPeaks(
            averagedPsd,
            windowPsd,
            windowStarts,
            samples.length,
            sampleRateHz,
            windowSize
        );
        var resolutionHz = sampleRateHz / windowSize;
        var broadbandPower = 0;
        var maximumPowerBin = Math.min(
            averagedPsd.length - 1,
            Math.floor(detected.maximumHz / resolutionHz)
        );
        for (var integrationBin = 1; integrationBin <= maximumPowerBin; integrationBin++) {
            broadbandPower += averagedPsd[integrationBin] * resolutionHz;
        }
        return {
            axis: axisInfo.axis,
            source: axisInfo.source,
            amplitudeKind: axisInfo.source === "gyroADC-filtered"
                ? "filtered-gyro-output" : "unfiltered-gyro-output",
            available: true,
            reasonCode: null,
            sampleCount: finiteCount,
            rmsDps: Math.sqrt(acVariance),
            broadbandPowerDps2: broadbandPower,
            broadbandRmsDps: Math.sqrt(Math.max(0, broadbandPower)),
            medianNoisePsdDps2PerHz: detected.globalNoiseFloor,
            windowCount: windowStarts.length,
            candidateWindowCount: selection.candidates,
            totalPossibleWindowCount: selection.totalPossible,
            validWindowCount: selection.candidates,
            validWindowCoverageRatio: validWindowCoverageRatio,
            finiteSampleCoverageRatio: finiteSampleCoverageRatio,
            finiteTimeSpanCoverageRatio: finiteTimeSpanCoverageRatio,
            firstFiniteSampleTimeUs: firstFiniteSampleTimeUs,
            lastFiniteSampleTimeUs: lastFiniteSampleTimeUs,
            leadingFiniteGapUs: leadingFiniteGapUs,
            trailingFiniteGapUs: trailingFiniteGapUs,
            windowCoverageRatio: selection.candidates > 0
                ? windowStarts.length / selection.candidates : 0,
            peaks: detected.peaks
        };
    }

    function rpmEvidence(values, field, range, totalSamples) {
        var finite = [];
        var firstIndex = null;
        var lastIndex = null;
        for (var index = 0; index < values.length; index++) {
            if (Number.isFinite(values[index]) && values[index] > 0 && values[index] <= 50000) {
                finite.push(values[index]);
                if (firstIndex === null) {
                    firstIndex = index;
                }
                lastIndex = index;
            }
        }
        if (finite.length === 0) {
            return unavailableRpmEvidence(field, "FIELD_MISSING");
        }
        var medianRpm = median(finite);
        var p05 = quantile(finite, 0.05);
        var p95 = quantile(finite, 0.95);
        var relativeSpread = medianRpm > 0 ? (p95 - p05) / medianRpm : Infinity;
        var coverageRatio = totalSamples > 0 ? finite.length / totalSamples : 0;
        var minimumRequired = Math.max(20, Math.ceil(totalSamples * 0.8));
        var reason = null;
        if (finite.length < minimumRequired || coverageRatio < 0.8) {
            reason = "INSUFFICIENT_COVERAGE";
        } else if (medianRpm < 100 || medianRpm > 50000) {
            reason = "RPM_OUT_OF_RANGE";
        } else if (relativeSpread > 0.12) {
            reason = "RPM_UNSTABLE_IN_SELECTION";
        }
        return {
            field: field,
            available: true,
            trustworthy: reason === null,
            reasonCode: reason,
            sampleCount: finite.length,
            coverageRatio: coverageRatio,
            medianRpm: medianRpm,
            p05Rpm: p05,
            p95Rpm: p95,
            fundamentalHz: reason === null ? medianRpm / 60 : null,
            relativeSpread: relativeSpread,
            timeRangeUs: [range.startTimeUs, range.endTimeUs]
        };
    }

    function bestHarmonicMatch(peak, rpmSources, frequencyResolutionHz) {
        var matches = [];
        ["headspeed", "tailspeed"].forEach(function(rotor) {
            var evidence = rpmSources[rotor];
            if (!evidence || !evidence.trustworthy) {
                return;
            }
            var maximumOrder = rotor === "headspeed" ? 8 : 6;
            for (var order = 1; order <= maximumOrder; order++) {
                var predictedHz = evidence.fundamentalHz * order;
                var spreadHz = evidence.relativeSpread * predictedHz / 2;
                var toleranceHz = Math.max(
                    frequencyResolutionHz * 1.5,
                    predictedHz * 0.025,
                    spreadHz
                );
                var deltaHz = Math.abs(peak.frequencyHz - predictedHz);
                if (deltaHz <= toleranceHz) {
                    matches.push({
                        rotor: rotor === "headspeed" ? "main" : "tail",
                        order: order,
                        predictedHz: predictedHz,
                        deltaHz: deltaHz,
                        toleranceHz: toleranceHz,
                        normalizedError: deltaHz / toleranceHz
                    });
                }
            }
        });
        matches.sort(function(left, right) {
            return left.normalizedError - right.normalizedError;
        });
        if (matches.length === 0) {
            return null;
        }
        var best = matches[0];
        delete best.normalizedError;
        return best;
    }

    function compactPeak(peak) {
        return {
            frequencyHz: round(peak.frequencyHz, 2),
            psdDps2PerHz: round(peak.psdDps2PerHz, 6),
            localNoisePsdDps2PerHz: round(peak.localNoisePsdDps2PerHz, 6),
            relativePowerDb: round(peak.relativePowerDb, 2),
            prominenceDb: round(peak.prominenceDb, 2),
            bandwidthHz: round(peak.bandwidthHz, 2),
            bandPowerDps2: round(peak.bandPowerDps2, 4),
            bandRmsDps: round(peak.bandRmsDps, 3),
            supportingWindowCount: peak.supportingWindowCount,
            evaluatedWindowCount: peak.evaluatedWindowCount,
            persistenceRatio: round(peak.persistenceRatio, 3),
            attentionSupportingWindowCount: peak.attentionSupportingWindowCount,
            attentionPersistenceRatio: round(peak.attentionPersistenceRatio, 3),
            attentionTemporalSpanRatio: round(peak.attentionTemporalSpanRatio, 3),
            attentionOccupiedBucketCount: peak.attentionOccupiedBucketCount,
            attentionMaximumGapRatio: round(peak.attentionMaximumGapRatio, 3),
            attentionEligible: peak.attentionEligible === true,
            harmonicMatch: peak.harmonicMatch ? {
                rotor: peak.harmonicMatch.rotor,
                order: peak.harmonicMatch.order,
                predictedHz: round(peak.harmonicMatch.predictedHz, 2),
                deltaHz: round(peak.harmonicMatch.deltaHz, 2),
                toleranceHz: round(peak.harmonicMatch.toleranceHz, 2)
            } : null
        };
    }

    function buildFindings(result) {
        var rangeArray = [result.range.startTimeUs, result.range.endTimeUs];
        if (result.reasonCodes.indexOf("UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE") >= 0) {
            result.findings.push({
                id: "mechanical-unfiltered-gyro-required-for-clear-gate",
                severity: "caution",
                title: "Unfiltered gyro is required for a clear result",
                summary: "Raw or unfiltered gyro was not verified on all three axes. Filtered output can suppress vibration evidence, so this range cannot safely establish a clear mechanical gate.",
                action: "Enable raw or unfiltered gyro logging on all three axes, repeat the same controlled condition, and analyze a new exact In/Out range before requesting tuning guidance.",
                axis: null,
                timeRangeUs: rangeArray,
                evidence: {
                    requiredSources: ["gyroRAW", "gyroUnfilt"],
                    reasonCode: "UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE"
                },
                sourceIds: ["rotorflight-filter-tuning"]
            });
            return;
        }
        var prominent = [];
        result.axes.forEach(function(axis) {
            axis.peaks.forEach(function(peak) {
                prominent.push({ axis: axis, peak: peak });
            });
        });
        prominent.sort(function(left, right) {
            if (right.peak.persistenceRatio !== left.peak.persistenceRatio) {
                return right.peak.persistenceRatio - left.peak.persistenceRatio;
            }
            return right.peak.prominenceDb - left.peak.prominenceDb;
        });
        if (prominent.length === 0) {
            result.findings.push({
                id: "mechanical-no-persistent-narrowband-peak",
                severity: "info",
                title: "No persistent narrow-band peak detected",
                summary: "The analyzed gyro signal has no narrow-band peak that passed both prominence and across-window persistence gates in this exact range.",
                action: "Keep this range as a comparison baseline and repeat the same controlled flight condition after any mechanical work.",
                axis: null,
                timeRangeUs: rangeArray,
                evidence: { analyzedAxes: result.axes.length },
                sourceIds: ["rotorflight-filter-tuning"]
            });
            return;
        }
        var attentionPeaks = prominent.filter(function(item) {
            return item.peak.attentionEligible === true;
        });
        if (attentionPeaks.length === 0) {
            var informational = prominent[0];
            result.findings.push({
                id: "mechanical-persistent-peak-below-attention-threshold",
                severity: "info",
                title: "Persistent narrow-band energy is below the attention gate",
                summary: "A " + round(informational.peak.frequencyHz, 1) + " Hz peak on "
                    + informational.axis.axis + " persisted across the selection, but its "
                    + round(informational.peak.bandRmsDps, 2) + " deg/s averaged band RMS did not "
                    + "pass the " + ATTENTION_BAND_RMS_THRESHOLD_DPS + " deg/s RotorLens "
                    + "experimental gate persistently across the selection.",
                action: "Keep this exact range as a baseline and compare it with the same flight condition after mechanical work; no control-setting change is recommended from this result.",
                axis: informational.axis.axis,
                timeRangeUs: rangeArray,
                evidence: {
                    gyroSource: informational.axis.source,
                    frequencyHz: round(informational.peak.frequencyHz, 2),
                    bandRmsDps: round(informational.peak.bandRmsDps, 3),
                    attentionBandRmsThresholdDps: ATTENTION_BAND_RMS_THRESHOLD_DPS,
                    persistenceRatio: round(informational.peak.persistenceRatio, 3),
                    harmonicMatch: informational.peak.harmonicMatch
                },
                sourceIds: ["rotorflight-filter-tuning"]
            });
            return;
        }
        attentionPeaks.sort(function(left, right) {
            return right.peak.bandRmsDps - left.peak.bandRmsDps;
        });
        var strongest = attentionPeaks[0];
        var match = strongest.peak.harmonicMatch;
        var filtered = strongest.axis.source === "gyroADC-filtered";
        result.findings.push({
            id: match
                ? "mechanical-persistent-" + match.rotor + "-rotor-harmonic"
                : "mechanical-persistent-unmatched-narrowband-peak",
            severity: "caution",
            title: match
                ? "Persistent " + match.rotor + "-rotor harmonic correlation"
                : "Persistent narrow-band gyro energy",
            summary: "A " + round(strongest.peak.frequencyHz, 1) + " Hz peak on "
                + strongest.axis.axis + " persisted in "
                + Math.round(strongest.peak.persistenceRatio * 100) + "% of evaluated windows"
                + (match ? " and aligns with the logged " + match.rotor
                    + "-rotor harmonic " + match.order : "")
                + ". This is correlation evidence, not a component diagnosis."
                + (filtered ? " It was measured after the logged gyro filtering path."
                    : " It was measured from the unfiltered gyro field."),
            action: match && match.rotor === "main"
                ? "Before changing control settings, inspect main blades and tracking, the main shaft, head bearings, gears, and sensor mounting; then repeat the same selected-range test."
                : (match && match.rotor === "tail"
                    ? "Before changing control settings, inspect tail blades, tail shaft and bearings, belt or torque-tube drive, gears, and sensor mounting; then repeat the test."
                    : "Before changing control settings, inspect blades, shafts, bearings, gears, skids, tail fin, loose hardware, and sensor mounting; then repeat the same test."),
            axis: strongest.axis.axis,
            timeRangeUs: rangeArray,
            evidence: {
                gyroSource: strongest.axis.source,
                frequencyHz: round(strongest.peak.frequencyHz, 2),
                prominenceDb: round(strongest.peak.prominenceDb, 2),
                persistenceRatio: round(strongest.peak.persistenceRatio, 3),
                harmonicMatch: match
            },
            sourceIds: match
                ? ["rotorflight-filter-tuning", "rotorflight-rpm-filters"]
                : ["rotorflight-filter-tuning"]
        });
    }

    async function analyzeCollected(collected, range, options) {
        checkCancelled(options);
        if (range.endTimeUs - range.startTimeUs > MAX_SELECTION_DURATION_US) {
            return insufficientResult(range, ["SELECTION_DURATION_LIMIT_EXCEEDED"], null, {
                maximumSelectionDurationUs: MAX_SELECTION_DURATION_US
            });
        }
        if (collected.limitExceeded) {
            return insufficientResult(range, ["SELECTION_SAMPLE_LIMIT_EXCEEDED"], null, {
                maximumInputSamples: MAX_INPUT_SAMPLES
            });
        }
        if (collected.timeUs.length < 256) {
            return insufficientResult(
                range,
                ["INSUFFICIENT_TIMESTAMPED_SAMPLES"],
                collected.timeUs.length,
                { minimumTimestampedSamples: 256 }
            );
        }
        if (collected.nonMonotonicTimestampCount > 0) {
            return insufficientResult(
                range,
                ["NON_MONOTONIC_TIMESTAMPS"],
                collected.timeUs.length,
                { nonMonotonicTimestampCount: collected.nonMonotonicTimestampCount }
            );
        }
        var intervals = sampledIntervals(collected.timeUs);
        var medianIntervalUs = median(intervals);
        var p95IntervalUs = quantile(intervals, 0.95);
        var measuredRateHz = medianIntervalUs > 0 ? 1000000 / medianIntervalUs : null;
        if (!Number.isFinite(measuredRateHz) || measuredRateHz < 50) {
            return insufficientResult(
                range,
                ["SAMPLE_RATE_UNAVAILABLE"],
                collected.timeUs.length,
                { medianIntervalUs: medianIntervalUs }
            );
        }
        if (measuredRateHz > MAX_SAMPLE_RATE_HZ) {
            return insufficientResult(
                range,
                ["SAMPLE_RATE_LIMIT_EXCEEDED"],
                collected.timeUs.length,
                { measuredSampleRateHz: measuredRateHz, maximumSampleRateHz: MAX_SAMPLE_RATE_HZ }
            );
        }
        if (p95IntervalUs > medianIntervalUs * 4) {
            return insufficientResult(
                range,
                ["TIMING_GAPS_EXCESSIVE"],
                collected.timeUs.length,
                { medianIntervalUs: medianIntervalUs, p95IntervalUs: p95IntervalUs }
            );
        }
        var sampleIntervalUs = medianIntervalUs;
        var firstSelectedSampleTimeUs = collected.timeUs[0];
        var lastSelectedSampleTimeUs = collected.timeUs[collected.timeUs.length - 1];
        var selectedDurationUs = range.endTimeUs - range.startTimeUs;
        var leadingSelectedGapUs = Math.max(
            0,
            firstSelectedSampleTimeUs - range.startTimeUs
        );
        var trailingSelectedGapUs = Math.max(
            0,
            range.endTimeUs - lastSelectedSampleTimeUs
        );
        var selectedTimestampSpanCoverageRatio = Math.min(
            1,
            Math.max(0, lastSelectedSampleTimeUs - firstSelectedSampleTimeUs)
                / selectedDurationUs
        );
        var resampledStartTimeUs = range.startTimeUs;
        var resampledCount = Math.floor(selectedDurationUs / sampleIntervalUs) + 1;
        var resampledEndTimeUs = resampledStartTimeUs
            + (resampledCount - 1) * sampleIntervalUs;
        var resampledTimeSpanUs = resampledEndTimeUs - resampledStartTimeUs;
        var resampledRangeCoverageRatio = Math.min(
            1,
            Math.max(0, resampledTimeSpanUs) / selectedDurationUs
        );
        if (resampledCount > MAX_RESAMPLED_SAMPLES) {
            return insufficientResult(
                range,
                ["RESAMPLED_SAMPLE_LIMIT_EXCEEDED"],
                collected.timeUs.length,
                { maximumResampledSamples: MAX_RESAMPLED_SAMPLES }
            );
        }
        var resampledRateHz = 1000000 / sampleIntervalUs;
        var windowSize = chooseWindowSize(resampledRateHz, resampledCount);
        var maxGapUs = medianIntervalUs * 4;
        var resampledAxes = [];
        reportProgress(options, "resample", 0, 3);
        for (var axisIndex = 0; axisIndex < 3; axisIndex++) {
            checkCancelled(options);
            var axisInfo = collected.gyro[axisIndex];
            if (axisInfo && axisInfo.source !== "missing") {
                resampledAxes.push({
                    info: axisInfo,
                    values: resampleLinear(
                        collected.timeUs,
                        axisInfo.values,
                        resampledStartTimeUs,
                        sampleIntervalUs,
                        resampledCount,
                        maxGapUs
                    )
                });
            }
            reportProgress(options, "resample", axisIndex + 1, 3);
            await yieldToEventLoop();
        }
        if (resampledAxes.length !== 3) {
            return insufficientResult(
                range,
                ["GYRO_FIELDS_MISSING"],
                collected.timeUs.length,
                {
                    requiredGyroAxisCount: 3,
                    availableGyroAxisCount: resampledAxes.length,
                    gyroSources: collected.gyro.map(function(axis) { return axis.source; })
                }
            );
        }
        var axes = [];
        reportProgress(options, "spectrum", 0, resampledAxes.length);
        for (var spectrumIndex = 0; spectrumIndex < resampledAxes.length; spectrumIndex++) {
            checkCancelled(options);
            axes.push(await spectrumForAxis(
                resampledAxes[spectrumIndex].info,
                resampledAxes[spectrumIndex].values,
                resampledRateHz,
                windowSize,
                resampledStartTimeUs,
                sampleIntervalUs,
                range,
                options
            ));
            reportProgress(options, "spectrum", spectrumIndex + 1, resampledAxes.length);
            await yieldToEventLoop();
        }
        var availableAxes = axes.filter(function(axis) { return axis.available; });
        var coverageReasons = [];
        if (selectedTimestampSpanCoverageRatio < MIN_FINITE_TIME_SPAN_COVERAGE_RATIO) {
            addReason(coverageReasons, "SELECTED_TIMESTAMP_SPAN_COVERAGE_INSUFFICIENT");
        }
        if (availableAxes.length !== 3) {
            addReason(coverageReasons, "INSUFFICIENT_CONTIGUOUS_GYRO_DATA");
        }
        axes.forEach(function(axis) {
            if (axis.validWindowCoverageRatio < MIN_VALID_WINDOW_COVERAGE_RATIO) {
                addReason(coverageReasons, "VALID_WINDOW_COVERAGE_INSUFFICIENT");
            }
            if (axis.finiteSampleCoverageRatio < MIN_FINITE_SAMPLE_COVERAGE_RATIO) {
                addReason(coverageReasons, "FINITE_GYRO_SAMPLE_COVERAGE_INSUFFICIENT");
            }
            if (axis.finiteTimeSpanCoverageRatio < MIN_FINITE_TIME_SPAN_COVERAGE_RATIO) {
                addReason(coverageReasons, "FINITE_GYRO_TIME_SPAN_COVERAGE_INSUFFICIENT");
            }
        });
        if (coverageReasons.length > 0) {
            var coverageResult = insufficientResult(
                range,
                coverageReasons,
                collected.timeUs.length,
                {
                    measuredSampleRateHz: round(measuredRateHz, 3),
                    resampledRateHz: round(resampledRateHz, 3),
                    resampledSampleCount: resampledCount,
                    firstSelectedSampleTimeUs: firstSelectedSampleTimeUs,
                    lastSelectedSampleTimeUs: lastSelectedSampleTimeUs,
                    leadingSelectedGapUs: round(leadingSelectedGapUs, 3),
                    trailingSelectedGapUs: round(trailingSelectedGapUs, 3),
                    selectedTimestampSpanCoverageRatio: round(
                        selectedTimestampSpanCoverageRatio,
                        3
                    ),
                    resampledStartTimeUs: resampledStartTimeUs,
                    resampledEndTimeUs: round(resampledEndTimeUs, 3),
                    resampledTimeSpanUs: round(resampledTimeSpanUs, 3),
                    resampledRangeCoverageRatio: round(
                        resampledRangeCoverageRatio,
                        3
                    ),
                    windowSize: windowSize,
                    overlapSamples: windowSize / 2,
                    windowCount: axes.length ? Math.min.apply(null, axes.map(function(axis) {
                        return axis.windowCount;
                    })) : 0,
                    totalPossibleWindowCount: axes.length
                        ? Math.min.apply(null, axes.map(function(axis) {
                            return axis.totalPossibleWindowCount;
                        })) : 0,
                    validWindowCount: axes.length
                        ? Math.min.apply(null, axes.map(function(axis) {
                            return axis.validWindowCount;
                        })) : 0,
                    validWindowCoverageRatio: axes.length
                        ? round(Math.min.apply(null, axes.map(function(axis) {
                            return axis.validWindowCoverageRatio;
                        })), 3) : 0,
                    finiteSampleCoverageRatio: axes.length
                        ? round(Math.min.apply(null, axes.map(function(axis) {
                            return axis.finiteSampleCoverageRatio;
                        })), 3) : 0,
                    finiteTimeSpanCoverageRatio: axes.length
                        ? round(Math.min.apply(null, axes.map(function(axis) {
                            return axis.finiteTimeSpanCoverageRatio;
                        })), 3) : 0,
                    minimumWindowCount: MIN_WELCH_WINDOWS,
                    minimumCoverageRatio: MIN_VALID_WINDOW_COVERAGE_RATIO,
                    frequencyResolutionHz: round(resampledRateHz / windowSize, 4),
                    attentionBandRmsThresholdDps: ATTENTION_BAND_RMS_THRESHOLD_DPS,
                    axisCoverage: axes.map(function(axis) {
                        return {
                            axis: axis.axis,
                            source: axis.source,
                            totalPossibleWindowCount: axis.totalPossibleWindowCount,
                            validWindowCount: axis.validWindowCount,
                            validWindowCoverageRatio: round(
                                axis.validWindowCoverageRatio,
                                3
                            ),
                            finiteSampleCoverageRatio: round(
                                axis.finiteSampleCoverageRatio,
                                3
                            ),
                            finiteTimeSpanCoverageRatio: round(
                                axis.finiteTimeSpanCoverageRatio,
                                3
                            ),
                            firstFiniteSampleTimeUs: round(
                                axis.firstFiniteSampleTimeUs,
                                3
                            ),
                            lastFiniteSampleTimeUs: round(
                                axis.lastFiniteSampleTimeUs,
                                3
                            ),
                            leadingFiniteGapUs: round(axis.leadingFiniteGapUs, 3),
                            trailingFiniteGapUs: round(axis.trailingFiniteGapUs, 3)
                        };
                    })
                }
            );
            coverageResult.axes = axes.map(function(axis) {
                return {
                    axis: axis.axis,
                    source: axis.source,
                    available: false,
                    reasonCode: axis.reasonCode || "GYRO_COVERAGE_INSUFFICIENT",
                    totalPossibleWindowCount: axis.totalPossibleWindowCount,
                    validWindowCount: axis.validWindowCount,
                    validWindowCoverageRatio: round(axis.validWindowCoverageRatio, 3),
                    finiteSampleCoverageRatio: round(axis.finiteSampleCoverageRatio, 3),
                    finiteTimeSpanCoverageRatio: round(
                        axis.finiteTimeSpanCoverageRatio,
                        3
                    ),
                    firstFiniteSampleTimeUs: round(axis.firstFiniteSampleTimeUs, 3),
                    lastFiniteSampleTimeUs: round(axis.lastFiniteSampleTimeUs, 3),
                    leadingFiniteGapUs: round(axis.leadingFiniteGapUs, 3),
                    trailingFiniteGapUs: round(axis.trailingFiniteGapUs, 3),
                    windowCount: axis.windowCount,
                    candidateWindowCount: axis.candidateWindowCount,
                    windowCoverageRatio: axis.candidateWindowCount > 0
                        ? round(axis.windowCount / axis.candidateWindowCount, 3) : 0,
                    peaks: []
                };
            });
            return coverageResult;
        }
        var rpmSources = {
            headspeed: rpmEvidence(
                collected.headspeedRpm,
                "headspeed",
                range,
                collected.timeUs.length
            ),
            tailspeed: rpmEvidence(
                collected.tailspeedRpm,
                "tailspeed",
                range,
                collected.timeUs.length
            )
        };
        var resolutionHz = resampledRateHz / windowSize;
        availableAxes.forEach(function(axis) {
            axis.peaks.forEach(function(peak) {
                peak.harmonicMatch = bestHarmonicMatch(peak, rpmSources, resolutionHz);
            });
        });
        var hasPersistentPeak = availableAxes.some(function(axis) {
            return axis.peaks.length > 0;
        });
        var hasAttentionPeak = availableAxes.some(function(axis) {
            return axis.peaks.some(function(peak) {
                return peak.attentionEligible === true;
            });
        });
        var reasons = [];
        if (hasAttentionPeak) {
            addReason(reasons, "PERSISTENT_NARROWBAND_ENERGY");
            if (availableAxes.some(function(axis) {
                return axis.peaks.some(function(peak) {
                    return peak.attentionEligible === true
                        && peak.harmonicMatch && peak.harmonicMatch.rotor === "main";
                });
            })) {
                addReason(reasons, "MAIN_ROTOR_HARMONIC_CORRELATION");
            }
            if (availableAxes.some(function(axis) {
                return axis.peaks.some(function(peak) {
                    return peak.attentionEligible === true
                        && peak.harmonicMatch && peak.harmonicMatch.rotor === "tail";
                });
            })) {
                addReason(reasons, "TAIL_ROTOR_HARMONIC_CORRELATION");
            }
        } else if (hasPersistentPeak) {
            addReason(reasons, "PERSISTENT_NARROWBAND_ENERGY_BELOW_ATTENTION_THRESHOLD");
        }
        var filteredSourceUsed = availableAxes.some(function(axis) {
            return axis.source === "gyroADC-filtered";
        });
        var allAxesUnfiltered = availableAxes.length === 3
            && availableAxes.every(function(axis) {
                return axis.source === "gyroRAW" || axis.source === "gyroUnfilt";
            });
        if (filteredSourceUsed) {
            addReason(reasons, "FILTERED_GYRO_SOURCE_USED");
        }
        var unfilteredClearBlocked = !hasAttentionPeak && !allAxesUnfiltered;
        if (unfilteredClearBlocked) {
            addReason(reasons, "UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE");
        }
        var result = baseResult(
            range,
            hasAttentionPeak ? "attention" : (unfilteredClearBlocked ? "insufficient" : "clear"),
            reasons,
            collected.timeUs.length
        );
        result.rpmEvidence = rpmSources;
        result.quality = {
            status: unfilteredClearBlocked ? "insufficient" : "accepted",
            sourceSampleCount: collected.timeUs.length,
            duplicateTimestampCount: collected.duplicateTimestampCount,
            measuredSampleRateHz: round(measuredRateHz, 3),
            resampledRateHz: round(resampledRateHz, 3),
            resampledSampleCount: resampledCount,
            firstSelectedSampleTimeUs: firstSelectedSampleTimeUs,
            lastSelectedSampleTimeUs: lastSelectedSampleTimeUs,
            leadingSelectedGapUs: round(leadingSelectedGapUs, 3),
            trailingSelectedGapUs: round(trailingSelectedGapUs, 3),
            selectedTimestampSpanCoverageRatio: round(
                selectedTimestampSpanCoverageRatio,
                3
            ),
            resampledStartTimeUs: resampledStartTimeUs,
            resampledEndTimeUs: round(resampledEndTimeUs, 3),
            resampledTimeSpanUs: round(resampledTimeSpanUs, 3),
            resampledRangeCoverageRatio: round(resampledRangeCoverageRatio, 3),
            medianIntervalUs: round(medianIntervalUs, 3),
            p95IntervalUs: round(p95IntervalUs, 3),
            interpolationGapLimitUs: round(maxGapUs, 3),
            windowSize: windowSize,
            overlapSamples: windowSize / 2,
            windowCount: Math.min.apply(null, availableAxes.map(function(axis) {
                return axis.windowCount;
            })),
            totalPossibleWindowCount: Math.min.apply(null, availableAxes.map(function(axis) {
                return axis.totalPossibleWindowCount;
            })),
            validWindowCount: Math.min.apply(null, availableAxes.map(function(axis) {
                return axis.validWindowCount;
            })),
            validWindowCoverageRatio: round(Math.min.apply(null, availableAxes.map(
                function(axis) { return axis.validWindowCoverageRatio; }
            )), 3),
            finiteSampleCoverageRatio: round(Math.min.apply(null, availableAxes.map(
                function(axis) { return axis.finiteSampleCoverageRatio; }
            )), 3),
            finiteTimeSpanCoverageRatio: round(Math.min.apply(null, availableAxes.map(
                function(axis) { return axis.finiteTimeSpanCoverageRatio; }
            )), 3),
            minimumCoverageRatio: MIN_VALID_WINDOW_COVERAGE_RATIO,
            frequencyResolutionHz: round(resolutionHz, 4),
            maximumAnalyzedFrequencyHz: round(
                Math.min(MAX_FREQUENCY_HZ, resampledRateHz * 0.45),
                2
            ),
            maximumWelchWindowsPerAxis: MAX_WELCH_WINDOWS,
            attentionBandRmsThresholdDps: ATTENTION_BAND_RMS_THRESHOLD_DPS
        };
        result.axes = availableAxes.map(function(axis) {
            if (unfilteredClearBlocked) {
                return {
                    axis: axis.axis,
                    source: axis.source,
                    available: false,
                    reasonCode: "UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE",
                    totalPossibleWindowCount: axis.totalPossibleWindowCount,
                    validWindowCount: axis.validWindowCount,
                    validWindowCoverageRatio: round(axis.validWindowCoverageRatio, 3),
                    finiteSampleCoverageRatio: round(axis.finiteSampleCoverageRatio, 3),
                    finiteTimeSpanCoverageRatio: round(
                        axis.finiteTimeSpanCoverageRatio,
                        3
                    ),
                    firstFiniteSampleTimeUs: round(axis.firstFiniteSampleTimeUs, 3),
                    lastFiniteSampleTimeUs: round(axis.lastFiniteSampleTimeUs, 3),
                    leadingFiniteGapUs: round(axis.leadingFiniteGapUs, 3),
                    trailingFiniteGapUs: round(axis.trailingFiniteGapUs, 3),
                    windowCount: axis.windowCount,
                    candidateWindowCount: axis.candidateWindowCount,
                    windowCoverageRatio: round(axis.windowCoverageRatio, 3),
                    peaks: []
                };
            }
            return {
                axis: axis.axis,
                source: axis.source,
                amplitudeKind: axis.amplitudeKind,
                available: true,
                sampleCount: axis.sampleCount,
                rmsDps: round(axis.rmsDps, 3),
                broadbandPowerDps2: round(axis.broadbandPowerDps2, 4),
                broadbandRmsDps: round(axis.broadbandRmsDps, 3),
                medianNoisePsdDps2PerHz: round(axis.medianNoisePsdDps2PerHz, 6),
                windowCount: axis.windowCount,
                candidateWindowCount: axis.candidateWindowCount,
                windowCoverageRatio: round(axis.windowCoverageRatio, 3),
                totalPossibleWindowCount: axis.totalPossibleWindowCount,
                validWindowCount: axis.validWindowCount,
                validWindowCoverageRatio: round(axis.validWindowCoverageRatio, 3),
                finiteSampleCoverageRatio: round(axis.finiteSampleCoverageRatio, 3),
                finiteTimeSpanCoverageRatio: round(axis.finiteTimeSpanCoverageRatio, 3),
                firstFiniteSampleTimeUs: round(axis.firstFiniteSampleTimeUs, 3),
                lastFiniteSampleTimeUs: round(axis.lastFiniteSampleTimeUs, 3),
                leadingFiniteGapUs: round(axis.leadingFiniteGapUs, 3),
                trailingFiniteGapUs: round(axis.trailingFiniteGapUs, 3),
                peaks: axis.peaks.map(compactPeak)
            };
        });
        reportProgress(options, "findings", 0, 1);
        buildFindings(result);
        reportProgress(options, "findings", 1, 1);
        return result;
    }

    async function analyzeFlightLog(flightLog, options) {
        var settings = options || {};
        checkCancelled(settings);
        if (!flightLog
                || typeof flightLog.getMinTime !== "function"
                || typeof flightLog.getMaxTime !== "function"
                || typeof flightLog.getChunksInTimeRange !== "function"
                || typeof flightLog.getMainFieldIndexByName !== "function") {
            throw new TypeError("A parsed FlightLog is required");
        }
        var range = normalizeRange(
            settings.timeRangeUs,
            flightLog.getMinTime(),
            flightLog.getMaxTime()
        );
        if (range.endTimeUs - range.startTimeUs > MAX_SELECTION_DURATION_US) {
            return insufficientResult(range, ["SELECTION_DURATION_LIMIT_EXCEEDED"], null, {
                maximumSelectionDurationUs: MAX_SELECTION_DURATION_US
            });
        }
        var collected = await collectFlightLogSelection(flightLog, range, settings);
        return analyzeCollected(collected, range, settings);
    }

    async function analyzeTimeSeries(series, options) {
        var settings = options || {};
        checkCancelled(settings);
        var times = series && series.timeUs;
        if (!times || typeof times.length !== "number" || times.length === 0) {
            throw new TypeError("A timestamped gyro series is required");
        }
        var minimumTimeUs = times[0];
        var maximumTimeUs = times[times.length - 1];
        var range = normalizeRange(settings.timeRangeUs, minimumTimeUs, maximumTimeUs);
        if (range.endTimeUs - range.startTimeUs > MAX_SELECTION_DURATION_US) {
            return insufficientResult(range, ["SELECTION_DURATION_LIMIT_EXCEEDED"], null, {
                maximumSelectionDurationUs: MAX_SELECTION_DURATION_US
            });
        }
        var collected = await collectTimeSeriesSelection(series, range, settings);
        return analyzeCollected(collected, range, settings);
    }

    return Object.freeze({
        analyzeFlightLog: analyzeFlightLog,
        analyzeTimeSeries: analyzeTimeSeries,
        SOURCES: SOURCES,
        constants: Object.freeze({
            collectionWindowUs: COLLECTION_WINDOW_US,
            maximumSelectionDurationUs: MAX_SELECTION_DURATION_US,
            maximumInputSamples: MAX_INPUT_SAMPLES,
            maximumResampledSamples: MAX_RESAMPLED_SAMPLES,
            maximumSampleRateHz: MAX_SAMPLE_RATE_HZ,
            maximumWelchWindows: MAX_WELCH_WINDOWS,
            minimumWelchWindows: MIN_WELCH_WINDOWS,
            minimumPersistenceRatio: MIN_PERSISTENCE_RATIO,
            minimumValidWindowCoverageRatio: MIN_VALID_WINDOW_COVERAGE_RATIO,
            minimumFiniteSampleCoverageRatio: MIN_FINITE_SAMPLE_COVERAGE_RATIO,
            minimumFiniteTimeSpanCoverageRatio: MIN_FINITE_TIME_SPAN_COVERAGE_RATIO,
            attentionTimeBucketCount: ATTENTION_TIME_BUCKET_COUNT,
            minimumAttentionOccupiedBuckets: MIN_ATTENTION_OCCUPIED_BUCKETS,
            maximumAttentionUnsupportedGapRatio: MAX_ATTENTION_UNSUPPORTED_GAP_RATIO,
            attentionBandRmsThresholdDps: ATTENTION_BAND_RMS_THRESHOLD_DPS
        })
    });
}));
