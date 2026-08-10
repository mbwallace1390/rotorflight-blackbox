"use strict";

(function(root, factory) {
    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RotorLensAdvisorMetrics = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function() {
    var AXIS_NAMES = ["roll", "pitch", "yaw"];

    function finiteValues(values) {
        return (values || []).filter(Number.isFinite);
    }

    function mean(values) {
        var source = finiteValues(values);
        if (source.length === 0) {
            return null;
        }

        return source.reduce(function(total, value) {
            return total + value;
        }, 0) / source.length;
    }

    function quantile(values, percentile) {
        var source = finiteValues(values).sort(function(a, b) {
            return a - b;
        });

        if (source.length === 0) {
            return null;
        }

        var p = Math.min(1, Math.max(0, percentile));
        var index = (source.length - 1) * p;
        var lower = Math.floor(index);
        var upper = Math.ceil(index);
        var fraction = index - lower;

        if (upper === lower) {
            return source[lower];
        }

        return source[lower] + (source[upper] - source[lower]) * fraction;
    }

    function rms(values) {
        var source = finiteValues(values);
        if (source.length === 0) {
            return null;
        }

        return Math.sqrt(source.reduce(function(total, value) {
            return total + value * value;
        }, 0) / source.length);
    }

    function summaryFromAccumulator(accumulator) {
        if (!accumulator || accumulator.count === 0) {
            return null;
        }

        return {
            sampleCount: accumulator.count,
            meanAbsErrorDps: accumulator.sumAbs / accumulator.count,
            rmsErrorDps: Math.sqrt(accumulator.sumSquares / accumulator.count),
            p95AbsErrorDps: quantile(accumulator.absErrorSamples, 0.95),
            maxAbsErrorDps: accumulator.maxAbs,
            p95AbsSetpointDps: quantile(accumulator.absSetpointSamples, 0.95)
        };
    }

    function summarizeTracking(axisAccumulators) {
        return (axisAccumulators || []).map(function(axisAccumulator, index) {
            var all = summaryFromAccumulator(axisAccumulator.all);
            var commanded = summaryFromAccumulator(axisAccumulator.commanded);
            var normalizedRmse = null;

            if (commanded && commanded.p95AbsSetpointDps > 0) {
                normalizedRmse = commanded.rmsErrorDps / commanded.p95AbsSetpointDps;
            }

            return {
                axis: AXIS_NAMES[index] || String(index),
                // A powered log with real commanded motion is required. Bench
                // stick movement and steady idle are not tuning evidence.
                available: Boolean(all && commanded && commanded.sampleCount >= 10),
                all: all,
                commanded: commanded,
                normalizedCommandedRmse: normalizedRmse
            };
        });
    }

    function buildActiveRanges(events, maxTimeUs) {
        var sorted = (events || []).filter(function(event) {
            return Number.isFinite(event.timeUs) && Number.isFinite(event.state);
        }).slice().sort(function(a, b) {
            return a.timeUs - b.timeUs;
        });
        var ranges = [];
        var activeStart = null;

        sorted.forEach(function(event) {
            if (event.state === 4 && activeStart === null) {
                activeStart = event.timeUs;
            } else if (event.state !== 4 && activeStart !== null) {
                if (event.timeUs > activeStart) {
                    ranges.push([activeStart, event.timeUs]);
                }
                activeStart = null;
            }
        });

        if (activeStart !== null && Number.isFinite(maxTimeUs) && maxTimeUs > activeStart) {
            ranges.push([activeStart, maxTimeUs]);
        }

        return ranges;
    }

    function timeInRanges(timeUs, ranges, settleUs) {
        var settle = settleUs || 0;
        for (var i = 0; i < ranges.length; i++) {
            if (timeUs >= ranges[i][0] + settle && timeUs < ranges[i][1]) {
                return true;
            }
        }
        return false;
    }

    function recordError(record) {
        return record.actualRpm - record.targetRpm;
    }

    function valuesInTimeRange(records, startUs, endUs) {
        return records.filter(function(record) {
            return record.timeUs >= startUs && record.timeUs <= endUs;
        });
    }

    function detectPitchPumps(records, options) {
        var settings = Object.assign({
            minimumEvents: 3,
            consistencyRatio: 0.75,
            collectiveStep: 400,
            minimumCollective: 550,
            baselineWindowUs: 250000,
            responseWindowUs: 800000,
            debounceUs: 700000,
            minimumEffectPercent: 2,
            maximumMotorPercent: 90
        }, options);
        var source = (records || []).filter(function(record) {
            return Number.isFinite(record.timeUs)
                && Number.isFinite(record.collective)
                && Number.isFinite(record.targetRpm)
                && Number.isFinite(record.actualRpm)
                && record.targetRpm > 500
                && record.active !== false;
        }).slice().sort(function(a, b) {
            return a.timeUs - b.timeUs;
        });
        var events = [];
        var previousCandidateTime = -Infinity;

        for (var i = 0; i < source.length; i++) {
            var current = source[i];
            if (current.timeUs - previousCandidateTime < settings.debounceUs) {
                continue;
            }

            var beforeIndex = i - 1;
            while (beforeIndex >= 0
                    && source[beforeIndex].timeUs > current.timeUs - settings.baselineWindowUs) {
                beforeIndex--;
            }

            if (beforeIndex < 0) {
                continue;
            }

            var before = source[beforeIndex];
            var loadStep = Math.abs(current.collective) - Math.abs(before.collective);
            if (loadStep < settings.collectiveStep
                    || Math.abs(current.collective) < settings.minimumCollective) {
                continue;
            }

            var baseline = valuesInTimeRange(
                source,
                current.timeUs - settings.baselineWindowUs,
                current.timeUs - 1
            );
            var response = valuesInTimeRange(
                source,
                current.timeUs,
                current.timeUs + settings.responseWindowUs
            );

            if (baseline.length < 2 || response.length < 3) {
                continue;
            }

            var targetValues = baseline.concat(response).map(function(record) {
                return record.targetRpm;
            });
            var targetRpm = quantile(targetValues, 0.5);
            var targetRange = Math.max.apply(Math, targetValues) - Math.min.apply(Math, targetValues);
            if (!targetRpm || targetRange / targetRpm > 0.03) {
                continue;
            }

            var baselineError = quantile(baseline.map(recordError), 0.5);
            var responseErrors = response.map(recordError);
            var minimumError = Math.min.apply(Math, responseErrors);
            var maximumError = Math.max.apply(Math, responseErrors);
            var droopRpm = Math.max(0, baselineError - minimumError);
            var overshootRpm = Math.max(0, maximumError - baselineError);
            var droopPercent = droopRpm / targetRpm * 100;
            var overshootPercent = overshootRpm / targetRpm * 100;
            var motorP95Pct = quantile(response.map(function(record) {
                return record.motorPct;
            }), 0.95);
            var classification = "balanced";

            if (droopPercent >= settings.minimumEffectPercent
                    && droopRpm > overshootRpm * 1.25) {
                classification = "droop";
            } else if (overshootPercent >= settings.minimumEffectPercent
                    && overshootRpm > droopRpm * 1.25) {
                classification = "overshoot";
            }

            events.push({
                startTimeUs: current.timeUs,
                endTimeUs: current.timeUs + settings.responseWindowUs,
                loadStep: loadStep,
                targetRpm: targetRpm,
                droopRpm: droopRpm,
                droopPercent: droopPercent,
                overshootRpm: overshootRpm,
                overshootPercent: overshootPercent,
                motorP95Pct: motorP95Pct,
                headroomOk: motorP95Pct !== null && motorP95Pct <= settings.maximumMotorPercent,
                classification: classification
            });
            previousCandidateTime = current.timeUs;
        }

        var eligible = events.filter(function(event) {
            return event.headroomOk;
        });
        var droopCount = eligible.filter(function(event) {
            return event.classification === "droop";
        }).length;
        var overshootCount = eligible.filter(function(event) {
            return event.classification === "overshoot";
        }).length;
        var dominant = droopCount >= overshootCount ? "droop" : "overshoot";
        var dominantCount = Math.max(droopCount, overshootCount);
        var sufficient = eligible.length >= settings.minimumEvents
            && dominantCount >= settings.minimumEvents
            && dominantCount / eligible.length >= settings.consistencyRatio;

        return {
            candidateCount: events.length,
            eligibleCount: eligible.length,
            droopCount: droopCount,
            overshootCount: overshootCount,
            sufficient: sufficient,
            direction: sufficient ? (dominant === "droop" ? "increase" : "decrease") : null,
            reason: sufficient ? dominant : "insufficient-consistency",
            medianDroopRpm: quantile(eligible.map(function(event) {
                return event.droopRpm;
            }), 0.5),
            medianOvershootRpm: quantile(eligible.map(function(event) {
                return event.overshootRpm;
            }), 0.5),
            windows: events.slice(0, 8).map(function(event) {
                return {
                    startTimeUs: event.startTimeUs,
                    endTimeUs: event.endTimeUs,
                    classification: event.classification
                };
            })
        };
    }

    function summarizeGovernor(snapshot) {
        if (!snapshot.governorSource) {
            return {
                available: false,
                source: null,
                guidanceReason: "missing-governor-fields"
            };
        }

        var governorEvents = (snapshot.governorEvents || []).filter(function(event) {
            return Number.isFinite(event.timeUs) && Number.isFinite(event.state);
        });
        var ranges = buildActiveRanges(governorEvents, snapshot.maxTimeUs);
        var hasGovernorStateEvidence = governorEvents.length > 0;
        var records = (snapshot.governorRecords || []).map(function(record) {
            var active = hasGovernorStateEvidence
                ? timeInRanges(record.timeUs, ranges, 500000)
                : record.targetRpm > 500 && record.actualRpm > 0;
            return Object.assign({}, record, { active: active });
        }).filter(function(record) {
            return record.active && record.targetRpm > 500 && record.actualRpm > 0;
        });

        if (records.length < 10) {
            return {
                available: false,
                source: snapshot.governorSource,
                guidanceReason: "insufficient-active-governor-data"
            };
        }

        var errors = records.map(recordError);
        var motorValues = records.map(function(record) {
            return record.motorPct;
        });
        var motorP95Pct = quantile(motorValues, 0.95);
        // Motor[0] is useful measured evidence, but a percentage alone does not
        // reveal Rotorflight's configured governor/max-throttle ceiling. Until
        // that ceiling is parsed and validated, saturation/headroom is unknown.
        var motorSaturationPercent = null;
        var headroomSufficient = null;
        // Directional pitch-pump classification is deliberately out of the v1
        // execution path. It is unnecessary for measurement-only results and
        // avoiding it keeps long-log analysis linear and cancellable.
        var pumps = {
            candidateCount: 0,
            eligibleCount: 0,
            sufficient: false,
            direction: null,
            reason: "measurement-only-v1",
            windows: []
        };

        return {
            available: true,
            source: snapshot.governorSource,
            activeSampleCount: records.length,
            activeDurationUs: ranges.reduce(function(total, range) {
                return total + Math.max(0, range[1] - range[0] - 500000);
            }, 0),
            targetRpm: quantile(records.map(function(record) {
                return record.targetRpm;
            }), 0.5),
            actualRpm: quantile(records.map(function(record) {
                return record.actualRpm;
            }), 0.5),
            meanErrorRpm: mean(errors),
            rmseRpm: rms(errors),
            p95AbsErrorRpm: quantile(errors.map(Math.abs), 0.95),
            maxDroopRpm: Math.max(0, -Math.min.apply(Math, errors)),
            maxOvershootRpm: Math.max(0, Math.max.apply(Math, errors)),
            motorP95Pct: motorP95Pct,
            motorSaturationPercent: motorSaturationPercent,
            headroomSufficient: headroomSufficient,
            pitchPumps: pumps
        };
    }

    function summarizeBattery(snapshot) {
        var accumulator = snapshot.battery;
        if (!accumulator || accumulator.count === 0) {
            return { available: false };
        }

        var minimumVolts = accumulator.minRaw / 100;
        var maximumVolts = accumulator.maxRaw / 100;
        var cellCount = snapshot.cellCount;
        var maximumCellVolts = Number.isFinite(snapshot.maximumCellVoltageRaw)
            ? snapshot.maximumCellVoltageRaw / 100
            : 4.35;

        // The legacy viewer's estimate is not reliable for every Rotorflight
        // header. Never turn a physically impossible estimate into a low-cell
        // blocker; retain the pack-voltage evidence and mark cell data unknown.
        if (cellCount > 0 && maximumVolts / cellCount > maximumCellVolts + 0.15) {
            cellCount = null;
        }
        var warningCellVolts = Number.isFinite(snapshot.warningCellVoltageRaw)
            ? snapshot.warningCellVoltageRaw / 100
            : null;
        var minimumCellVolts = cellCount > 0 ? minimumVolts / cellCount : null;

        return {
            available: true,
            sampleCount: accumulator.count,
            cellCount: cellCount || null,
            minimumVolts: minimumVolts,
            maximumVolts: maximumVolts,
            minimumCellVolts: minimumCellVolts,
            warningCellVolts: warningCellVolts,
            belowConfiguredWarning: minimumCellVolts !== null && warningCellVolts !== null
                ? minimumCellVolts < warningCellVolts
                : null
        };
    }

    function summarizeSnapshot(snapshot) {
        var medianDtUs = quantile(snapshot.dtSamples, 0.5);
        var sampleRateHz = medianDtUs && medianDtUs > 0 ? 1000000 / medianDtUs : null;

        return {
            quality: {
                sampleRateHz: sampleRateHz,
                medianFrameIntervalUs: medianDtUs,
                p99FrameIntervalUs: quantile(snapshot.dtSamples, 0.99),
                sampleCount: snapshot.sampleCount,
                invalidTimeCount: snapshot.invalidTimeCount,
                invalidRequiredValueCount: snapshot.invalidRequiredValueCount,
                corruptFrames: snapshot.corruptFrames,
                discontinuities: snapshot.discontinuities,
                hasEndMarker: snapshot.hasEndMarker
            },
            tracking: summarizeTracking(snapshot.axisAccumulators),
            battery: summarizeBattery(snapshot),
            governor: summarizeGovernor(snapshot)
        };
    }

    return Object.freeze({
        buildActiveRanges: buildActiveRanges,
        detectPitchPumps: detectPitchPumps,
        mean: mean,
        quantile: quantile,
        rms: rms,
        summarizeBattery: summarizeBattery,
        summarizeGovernor: summarizeGovernor,
        summarizeSnapshot: summarizeSnapshot,
        summarizeTracking: summarizeTracking
    });
}));
