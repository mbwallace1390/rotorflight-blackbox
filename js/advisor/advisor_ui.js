"use strict";

(function(window, document, $) {
    var PHASES = ["quality", "tracking", "governor", "findings"];
    var PHASE_LABELS = {
        quality: "Checking log quality",
        tracking: "Measuring control tracking",
        gyro: "Measuring control tracking",
        governor: "Measuring governor response",
        findings: "Building evidence-backed findings"
    };

    var currentLog = null;
    var currentContext = {};
    var currentPackage = null;
    var activeJob = null;
    var generation = 0;
    var isBound = false;

    var modal;
    var logSummary;
    var progressContainer;
    var progressLabel;
    var progressBar;
    var errorBox;
    var results;
    var findingsContainer;
    var measurementsContainer;
    var overallStatus;
    var rerunButton;

    function cacheElements() {
        if (modal && modal.length) {
            return true;
        }

        modal = $("#dlgTuneAdvisor");
        if (!modal.length) {
            return false;
        }

        logSummary = modal.find(".tune-advisor-log-summary");
        progressContainer = modal.find(".tune-advisor-progress");
        progressLabel = modal.find(".tune-advisor-progress-label");
        progressBar = modal.find(".progress-bar");
        errorBox = modal.find(".tune-advisor-error");
        results = modal.find(".tune-advisor-results");
        findingsContainer = modal.find(".tune-advisor-findings");
        measurementsContainer = modal.find(".tune-advisor-measurements");
        overallStatus = modal.find(".tune-advisor-overall-status");
        rerunButton = modal.find(".tune-advisor-rerun");
        return true;
    }

    function element(tagName, className, text) {
        var node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = String(text);
        }
        return node;
    }

    function append(parent, child) {
        if (child) {
            parent.appendChild(child);
        }
        return child;
    }

    function isFiniteNumber(value) {
        return typeof value === "number" && Number.isFinite(value);
    }

    function formatNumber(value, digits) {
        if (!isFiniteNumber(value)) {
            return "—";
        }

        var precision = digits === undefined ? 1 : digits;
        return value.toLocaleString(undefined, {
            maximumFractionDigits: precision,
            minimumFractionDigits: 0
        });
    }

    function formatDuration(microseconds) {
        if (!isFiniteNumber(microseconds)) {
            return "—";
        }

        var seconds = microseconds / 1000000;
        if (seconds < 60) {
            return formatNumber(seconds, 1) + " s";
        }

        var minutes = Math.floor(seconds / 60);
        return minutes + " min " + formatNumber(seconds % 60, 0) + " s";
    }

    function readSelectedRange() {
        if (!currentContext || typeof currentContext.getSelectedRange !== "function") {
            return null;
        }

        var range = currentContext.getSelectedRange();
        if (!range
                || !isFiniteNumber(range.startTimeUs)
                || !isFiniteNumber(range.endTimeUs)
                || range.startTimeUs >= range.endTimeUs) {
            return null;
        }

        return {
            startTimeUs: range.startTimeUs,
            endTimeUs: range.endTimeUs
        };
    }

    function rangesEqual(left, right) {
        return Boolean(left && right
            && left.startTimeUs === right.startTimeUs
            && left.endTimeUs === right.endTimeUs);
    }

    function rangeLabel(range, logStartTimeUs) {
        if (!range
                || !isFiniteNumber(range.startTimeUs)
                || !isFiniteNumber(range.endTimeUs)
                || range.startTimeUs >= range.endTimeUs) {
            return "Set both graph In and Out markers";
        }

        var origin = isFiniteNumber(logStartTimeUs) ? logStartTimeUs : 0;
        var startSeconds = Math.max(0, range.startTimeUs - origin) / 1000000;
        var endSeconds = Math.max(0, range.endTimeUs - origin) / 1000000;
        return "Selected I " + formatNumber(startSeconds, 1)
            + " s → O " + formatNumber(endSeconds, 1)
            + " s (" + formatDuration(range.endTimeUs - range.startTimeUs) + ")";
    }

    function humanizeMetric(value) {
        return String(value || "Measurement")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[._-]+/g, " ")
            .replace(/^./, function(first) { return first.toUpperCase(); });
    }

    function setTriggerEnabled(enabled) {
        $(".open-tune-advisor").each(function() {
            var trigger = $(this);
            if (this.tagName.toLowerCase() === "button") {
                trigger.prop("disabled", !enabled);
            } else {
                trigger.toggleClass("disabled", !enabled);
                trigger.attr("aria-disabled", enabled ? "false" : "true");
            }
        });
    }

    function renderPendingLogSummary() {
        if (!cacheElements()) {
            return;
        }

        logSummary.empty();
        if (!currentLog) {
            append(logSummary[0], element("span", null, "Open a Blackbox log to use Tune Advisor."));
            return;
        }

        append(logSummary[0], element("strong", null, currentContext.fileName || "Current Blackbox log"));
        if (Number.isInteger(currentContext.logIndex)) {
            append(logSummary[0], element("span", null, "Embedded log " + (currentContext.logIndex + 1)));
        }
        var pendingRange = readSelectedRange();
        var pendingLogStart = typeof currentLog.getMinTime === "function" ? currentLog.getMinTime() : 0;
        append(logSummary[0], element("span", null, rangeLabel(pendingRange, pendingLogStart)));
        append(logSummary[0], element("span", null, "Analysis stays inside this viewer"));
    }

    function renderAnalyzedLogSummary(log, range) {
        if (!logSummary || !logSummary.length) {
            return;
        }

        logSummary.empty();
        append(logSummary[0], element("strong", null, currentContext.fileName || "Current Blackbox log"));

        if (log) {
            var firmware = [log.firmwareType, log.firmwareVersion]
                .filter(function(value) { return value !== undefined && value !== null && value !== ""; })
                .join(" ");
            if (firmware) {
                append(logSummary[0], element("span", null, firmware));
            }
            if (isFiniteNumber(log.durationUs)) {
                append(logSummary[0], element("span", null, "Full log " + formatDuration(log.durationUs)));
            }
        }
        if (range) {
            append(logSummary[0], element("span", null, rangeLabel(range, log && log.startTimeUs)));
            if (isFiniteNumber(range.sampleRateHz)) {
                append(logSummary[0], element("span", null, formatNumber(range.sampleRateHz, 1) + " Hz selected rate"));
            }
        }
    }

    function setProgress(label, percent) {
        if (!cacheElements()) {
            return;
        }

        var safePercent = Math.max(0, Math.min(100, isFiniteNumber(percent) ? percent : 0));
        progressLabel.text(label);
        progressBar.css("width", safePercent + "%");
        progressBar.attr("aria-valuenow", Math.round(safePercent));
        progressBar.attr("aria-valuetext", label);
    }

    function progressPercent(progress) {
        var phase = progress && progress.phase === "gyro" ? "tracking" : progress && progress.phase;
        var phaseIndex = PHASES.indexOf(phase);
        if (phaseIndex < 0) {
            return 0;
        }

        var ratio = 0;
        if (isFiniteNumber(progress.total) && progress.total > 0 && isFiniteNumber(progress.completed)) {
            ratio = Math.max(0, Math.min(1, progress.completed / progress.total));
        }

        return ((phaseIndex + ratio) / PHASES.length) * 100;
    }

    function showError(message) {
        if (!cacheElements()) {
            return;
        }

        progressContainer.attr("hidden", true);
        results.attr("hidden", true);
        errorBox.text(message || "Tune Advisor could not analyze this log.");
        errorBox.removeAttr("hidden");
        rerunButton.prop("disabled", !(currentLog && readSelectedRange()));
        modal.attr("aria-busy", "false");
    }

    function resetPresentation() {
        if (!cacheElements()) {
            return;
        }

        renderPendingLogSummary();
        errorBox.attr("hidden", true).empty();
        results.attr("hidden", true);
        findingsContainer.empty();
        measurementsContainer.empty();
        overallStatus.removeClass("status-pass status-caution status-blocked").empty();
        progressContainer.removeAttr("hidden");
        setProgress(currentLog ? "Ready to analyze this log." : "Open a log to begin.", 0);
        rerunButton.prop("disabled", !(currentLog && readSelectedRange()));
        modal.attr("aria-busy", "false");
    }

    function metricLine(label, value) {
        var line = element("li");
        append(line, element("span", null, label));
        append(line, element("strong", null, value));
        return line;
    }

    function measurementCard(title, status, lines) {
        var column = element("div", "col-sm-6 tune-advisor-measurement-column");
        var card = append(column, element("article", "tune-advisor-measurement-card"));
        append(card, element("h6", null, title));
        if (status) {
            append(card, element("p", "tune-advisor-measurement-status", status));
        }

        var list = append(card, element("ul", "tune-advisor-metric-list"));
        lines.forEach(function(line) {
            append(list, metricLine(line.label, line.value));
        });
        return column;
    }

    function presentBoolean(value, yesText, noText) {
        if (value === true) {
            return yesText;
        }
        if (value === false) {
            return noText;
        }
        return "—";
    }

    function presentAxisCoverage(value) {
        if (!Array.isArray(value)) {
            return "Unknown";
        }
        var available = value.filter(function(item) { return item === true; }).length;
        return available + " / " + value.length + " axes";
    }

    function renderMeasurements(evidencePackage) {
        measurementsContainer.empty();

        var log = evidencePackage.log || {};
        var range = evidencePackage.range || {};
        var quality = evidencePackage.quality || {};
        var sampleCount = isFiniteNumber(range.sampleCount) ? range.sampleCount : quality.sampleCount;
        var sampleRateHz = isFiniteNumber(range.sampleRateHz) ? range.sampleRateHz : quality.sampleRateHz;
        append(measurementsContainer[0], measurementCard("Selected graph range", null, [
            { label: "In", value: formatDuration(range.startOffsetUs) },
            { label: "Out", value: formatDuration(range.endOffsetUs) },
            { label: "Duration", value: formatDuration(range.durationUs) },
            { label: "Samples", value: formatNumber(sampleCount, 0) },
            { label: "Sample rate", value: isFiniteNumber(sampleRateHz) ? formatNumber(sampleRateHz, 1) + " Hz" : "—" }
        ]));

        var invalidSamples = quality.invalidSampleCount;
        if (!isFiniteNumber(invalidSamples)) {
            invalidSamples = (Number(quality.invalidTimeCount) || 0)
                + (Number(quality.invalidRequiredValueCount) || 0);
        }
        var missingEndMarker = quality.missingEndMarker;
        if (missingEndMarker === undefined && quality.hasEndMarker !== undefined) {
            missingEndMarker = !quality.hasEndMarker;
        }
        append(measurementsContainer[0], measurementCard("Quality gate", quality.status, [
            { label: "Corrupt frames", value: formatNumber(quality.corruptFrames, 0) },
            { label: "Discontinuities", value: formatNumber(quality.discontinuities, 0) },
            { label: "Invalid samples", value: formatNumber(invalidSamples, 0) },
            { label: "End marker missing", value: presentBoolean(missingEndMarker, "Yes", "No") }
        ]));

        var tracking = evidencePackage.tracking || {};
        var trackingAxes = Array.isArray(tracking) ? tracking : tracking.axes;
        var trackingLines = [];
        if (tracking.source) {
            trackingLines.push({ label: "Source", value: tracking.source });
        }
        (Array.isArray(trackingAxes) ? trackingAxes : []).forEach(function(axis) {
            var values = [];
            if (isFiniteNumber(axis.rmsErrorDps)) {
                values.push("RMS " + formatNumber(axis.rmsErrorDps, 1));
            }
            if (isFiniteNumber(axis.p95AbsErrorDps)) {
                values.push("P95 " + formatNumber(axis.p95AbsErrorDps, 1));
            }
            trackingLines.push({
                label: humanizeMetric(axis.axis),
                value: values.length ? values.join(" · ") + " °/s" : "—"
            });
            if (isFiniteNumber(axis.commandedRmsErrorDps)) {
                trackingLines.push({
                    label: humanizeMetric(axis.axis) + " commanded RMS",
                    value: formatNumber(axis.commandedRmsErrorDps, 1) + " °/s"
                });
            }
        });
        if (!trackingLines.length) {
            trackingLines.push({ label: "Measurement", value: "Not available" });
        }
        append(measurementsContainer[0], measurementCard(
            "Control tracking",
            tracking.status || (Array.isArray(trackingAxes) ? "available" : "unsupported"),
            trackingLines
        ));

        var battery = evidencePackage.battery || {};
        var batteryLines = [];
        if (isFiniteNumber(battery.minimumVolts)) {
            batteryLines.push({ label: "Minimum", value: formatNumber(battery.minimumVolts, 2) + " V" });
        }
        if (isFiniteNumber(battery.maximumVolts)) {
            batteryLines.push({ label: "Maximum", value: formatNumber(battery.maximumVolts, 2) + " V" });
        }
        if (isFiniteNumber(battery.minimumCellVolts)) {
            batteryLines.push({ label: "Minimum per cell", value: formatNumber(battery.minimumCellVolts, 2) + " V" });
        }
        if (isFiniteNumber(battery.warningCellVolts)) {
            batteryLines.push({ label: "Configured warning", value: formatNumber(battery.warningCellVolts, 2) + " V/cell" });
        }
        if (!batteryLines.length) {
            batteryLines.push({ label: "Measurement", value: "Not available" });
        }
        append(measurementsContainer[0], measurementCard(
            "Battery",
            battery.status || (battery.available === true ? "available" : "unsupported"),
            batteryLines
        ));

        var governor = evidencePackage.governor || {};
        var governorLines = [];
        if (governor.source) {
            governorLines.push({ label: "Source", value: governor.source });
        }
        if (isFiniteNumber(governor.targetRpm)) {
            governorLines.push({ label: "Target", value: formatNumber(governor.targetRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.actualRpm)) {
            governorLines.push({ label: "Actual mean", value: formatNumber(governor.actualRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.rmseRpm)) {
            governorLines.push({ label: "Tracking RMSE", value: formatNumber(governor.rmseRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.maxDroopRpm)) {
            governorLines.push({ label: "Maximum droop", value: formatNumber(governor.maxDroopRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.maxOvershootRpm)) {
            governorLines.push({ label: "Maximum overshoot", value: formatNumber(governor.maxOvershootRpm, 0) + " rpm" });
        }
        if (isFiniteNumber(governor.motorP95Pct)) {
            governorLines.push({ label: "Motor 1 P95", value: formatNumber(governor.motorP95Pct, 1) + " %" });
        }
        if (!governorLines.length) {
            governorLines.push({ label: "Measurement", value: "Not available" });
        }
        append(measurementsContainer[0], measurementCard(
            "Governor",
            governor.status || (governor.available === true ? "available" : "unsupported"),
            governorLines
        ));

        var coverage = evidencePackage.coverage;
        if (coverage && typeof coverage === "object") {
            var coverageLines = [
                { label: "Setpoint", value: presentAxisCoverage(coverage.setpointAxes) },
                { label: "Filtered gyro", value: presentAxisCoverage(coverage.gyroAxes) },
                { label: "Raw gyro", value: presentAxisCoverage(coverage.rawGyroAxes) },
                { label: "Battery voltage", value: presentBoolean(coverage.battery, "Present", "Missing") },
                { label: "Headspeed", value: presentBoolean(coverage.headspeed, "Present", "Missing") },
                { label: "Collective", value: presentBoolean(coverage.collective, "Present", "Missing") },
                { label: "Motor outputs", value: isFiniteNumber(coverage.motorCount) ? formatNumber(coverage.motorCount, 0) : "Unknown" },
                { label: "Failsafe phase", value: presentBoolean(coverage.failsafePhase, "Present", "Missing") },
                { label: "RX signal + channels", value: presentBoolean(coverage.rxHealth, "Present", "Missing") },
                { label: "RX safety gate", value: coverage.rxSafety || "unknown" },
                { label: "Battery safety gate", value: coverage.batterySafety || "unknown" },
                { label: "Governor fields", value: presentBoolean(coverage.governor, "Present", "Missing") },
                { label: "Governor source", value: coverage.governorSource || "None" },
                { label: "Debug mode", value: coverage.debugMode || "Unknown" }
            ];
            if (coverageLines.length) {
                append(measurementsContainer[0], measurementCard("Analysis coverage", coverage.status, coverageLines));
            }
        }
    }

    function normalizeTimeRange(value) {
        var start;
        var end;

        if (Array.isArray(value) && value.length >= 2) {
            start = value[0];
            end = value[1];
        } else if (value && typeof value === "object") {
            start = value.startTimeUs;
            if (!isFiniteNumber(start)) {
                start = value.startUs;
            }
            if (!isFiniteNumber(start)) {
                start = value.start;
            }

            end = value.endTimeUs;
            if (!isFiniteNumber(end)) {
                end = value.endUs;
            }
            if (!isFiniteNumber(end)) {
                end = value.end;
            }
        }

        if (!isFiniteNumber(start) || !isFiniteNumber(end)) {
            return null;
        }

        if (end < start) {
            var swap = start;
            start = end;
            end = swap;
        }

        return { startTimeUs: start, endTimeUs: end };
    }

    function evidenceDescription(evidence) {
        var description = humanizeMetric(evidence.metric);
        if (evidence.scope) {
            description += " (" + evidence.scope + ")";
        }
        if (evidence.value !== undefined && evidence.value !== null) {
            description += ": " + (isFiniteNumber(evidence.value) ? formatNumber(evidence.value, 2) : String(evidence.value));
            if (evidence.unit) {
                description += " " + evidence.unit;
            }
        }
        return description;
    }

    function safeGuidanceSource(finding, sourceById) {
        var source = finding && finding.source;
        if (!source && finding && Array.isArray(finding.sources)) {
            source = finding.sources[0];
        }
        if (typeof source === "string") {
            source = sourceById[source];
        }
        if (!source && finding && Array.isArray(finding.sourceIds)) {
            source = sourceById[finding.sourceIds[0]];
        }
        if (!source || typeof source !== "object" || typeof source.url !== "string") {
            return null;
        }

        try {
            var parsed = new URL(source.url, window.location.href);
            if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
                return null;
            }
            return {
                label: "Official guidance",
                title: source.label || source.title || "Official guidance",
                url: parsed.href
            };
        } catch (error) {
            return null;
        }
    }

    function findingFocusRange(finding, evidenceById) {
        var directRange = normalizeTimeRange(finding.timeRangeUs);
        if (directRange) {
            return directRange;
        }

        var ids = Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [];
        for (var i = 0; i < ids.length; i++) {
            var evidence = evidenceById[ids[i]];
            var range = evidence && normalizeTimeRange(evidence.timeRangeUs);
            if (range) {
                return range;
            }
        }
        return null;
    }

    function focusEvidence(range, finding) {
        if (!range || typeof currentContext.focusTime !== "function") {
            return;
        }

        var midpoint = range.startTimeUs + ((range.endTimeUs - range.startTimeUs) / 2);
        modal.modal("hide");
        window.setTimeout(function() {
            currentContext.focusTime(midpoint, {
                startTimeUs: range.startTimeUs,
                endTimeUs: range.endTimeUs,
                findingId: finding.id
            });
        }, 0);
    }

    function renderFinding(finding, evidenceById, sourceById) {
        var severity = ["info", "caution", "stop"].indexOf(finding.severity) >= 0
            ? finding.severity
            : "info";
        var card = element("article", "panel tune-advisor-finding severity-" + severity);
        var body = append(card, element("div", "panel-body"));
        var header = append(body, element("div", "tune-advisor-finding-header"));
        append(header, element("h6", null, finding.title || "Advisor finding"));
        append(header, element("span", "label tune-advisor-severity severity-" + severity, severity));

        if (finding.summary) {
            append(body, element("p", "tune-advisor-summary", finding.summary));
        }
        if (finding.action) {
            var action = append(body, element("p", "tune-advisor-action"));
            append(action, element("strong", null, "Next check: "));
            action.appendChild(document.createTextNode(String(finding.action)));
        }

        var citedEvidence = (Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [])
            .map(function(id) { return evidenceById[id]; })
            .filter(Boolean);
        if (citedEvidence.length) {
            var evidenceList = append(body, element("ul", "tune-advisor-evidence-list"));
            citedEvidence.forEach(function(evidence) {
                append(evidenceList, element("li", null, evidenceDescription(evidence)));
            });
        }

        var guidanceSource = safeGuidanceSource(finding, sourceById);
        if (guidanceSource) {
            var guidanceLink = append(body, element("a", "tune-advisor-guidance", guidanceSource.label));
            guidanceLink.href = guidanceSource.url;
            guidanceLink.target = "_blank";
            guidanceLink.rel = "noopener noreferrer";
            guidanceLink.title = "Open " + guidanceSource.title;
        }

        var range = findingFocusRange(finding, evidenceById);
        if (range && typeof currentContext.focusTime === "function") {
            var focusButton = append(body, element("button", "btn btn-default btn-sm tune-advisor-focus"));
            var rangeMidpointUs = range.startTimeUs + ((range.endTimeUs - range.startTimeUs) / 2);
            var logStartUs = currentPackage && currentPackage.log && isFiniteNumber(currentPackage.log.startTimeUs)
                ? currentPackage.log.startTimeUs
                : 0;
            var focusSeconds = Math.max(0, rangeMidpointUs - logStartUs) / 1000000;
            focusButton.type = "button";
            focusButton.textContent = "View evidence near " + formatNumber(focusSeconds, 1) + " s";
            focusButton.setAttribute("aria-label", "Close Tune Advisor and focus the graph on evidence for " + (finding.title || "this finding"));
            $(focusButton).on("click", function() {
                focusEvidence(range, finding);
            });
        }
        return card;
    }

    function overallState(evidencePackage) {
        var findings = Array.isArray(evidencePackage.findings) ? evidencePackage.findings : [];
        var qualityStatus = evidencePackage.quality && evidencePackage.quality.status;
        var grade = typeof evidencePackage.grade === "string"
            ? evidencePackage.grade
            : evidencePackage.grade && (evidencePackage.grade.overall || evidencePackage.grade.status || evidencePackage.grade.value);

        if (grade === "blocked" || grade === "stop" || qualityStatus === "blocked" || findings.some(function(finding) { return finding.severity === "stop"; })) {
            return { className: "status-blocked", label: "Evidence blocked · Stop / inspect" };
        }
        if (grade === "limited" || grade === "caution" || qualityStatus === "caution" || findings.some(function(finding) { return finding.severity === "caution"; })) {
            return { className: "status-caution", label: "Evidence limited" };
        }
        return { className: "status-pass", label: "Evidence supported" };
    }

    function renderResults(evidencePackage) {
        renderAnalyzedLogSummary(evidencePackage.log || {}, evidencePackage.range || null);
        findingsContainer.empty();

        var evidenceById = {};
        (Array.isArray(evidencePackage.evidence) ? evidencePackage.evidence : []).forEach(function(evidence) {
            if (evidence && evidence.id) {
                evidenceById[evidence.id] = evidence;
            }
        });

        var sourceById = {};
        (Array.isArray(evidencePackage.sources) ? evidencePackage.sources : []).forEach(function(source) {
            if (source && source.id) {
                sourceById[source.id] = source;
            }
        });

        var findings = Array.isArray(evidencePackage.findings) ? evidencePackage.findings : [];
        if (findings.length) {
            findings.forEach(function(finding) {
                append(findingsContainer[0], renderFinding(finding || {}, evidenceById, sourceById));
            });
        } else {
            append(findingsContainer[0], element(
                "p",
                "tune-advisor-empty",
                evidencePackage.quality && evidencePackage.quality.status === "blocked"
                    ? "This log did not pass the quality gate, so Tune Advisor withheld tuning guidance."
                    : "No deterministic tuning findings were produced for this log. Review the measured evidence below."
            ));
        }

        var status = overallState(evidencePackage);
        overallStatus
            .removeClass("status-pass status-caution status-blocked")
            .addClass(status.className)
            .text(status.label);

        renderMeasurements(evidencePackage);
        errorBox.attr("hidden", true).empty();
        results.removeAttr("hidden");
        progressContainer.removeAttr("hidden");
        setProgress("Analysis complete. Results are based only on measured evidence.", 100);
        rerunButton.prop("disabled", false);
        modal.attr("aria-busy", "false");
    }

    function cancelActiveJob() {
        if (activeJob) {
            activeJob.cancelled = true;
            activeJob = null;
        }
    }

    function startAnalysis(force) {
        if (!cacheElements()) {
            return;
        }
        if (!currentLog) {
            showError("Open a Blackbox log before running Tune Advisor.");
            return;
        }
        var selectedRange = readSelectedRange();
        if (!selectedRange) {
            currentPackage = null;
            showError("Set both graph In and Out markers, with In before Out, then run Tune Advisor again.");
            return;
        }
        if (!force && currentPackage && rangesEqual(currentPackage.range, selectedRange)) {
            renderResults(currentPackage);
            return;
        }

        var engine = window.RotorLensTuneAdvisorEngine;
        if (!engine || typeof engine.analyzeFlightLog !== "function") {
            showError("The on-device Tune Advisor engine is unavailable in this build.");
            return;
        }

        cancelActiveJob();
        currentPackage = null;
        var job = {
            cancelled: false,
            generation: generation,
            log: currentLog,
            range: selectedRange
        };
        activeJob = job;

        errorBox.attr("hidden", true).empty();
        results.attr("hidden", true);
        progressContainer.removeAttr("hidden");
        rerunButton.prop("disabled", true);
        modal.attr("aria-busy", "true");
        setProgress("Preparing on-device analysis", 0);

        Promise.resolve().then(function() {
            return engine.analyzeFlightLog(job.log, {
                timeRangeUs: job.range,
                isCancelled: function() {
                    return job.cancelled
                        || job.generation !== generation
                        || job.log !== currentLog
                        || !rangesEqual(readSelectedRange(), job.range);
                },
                onProgress: function(progress) {
                    if (job.cancelled || activeJob !== job) {
                        return;
                    }
                    var label = PHASE_LABELS[progress && progress.phase] || "Analyzing log";
                    setProgress(label, progressPercent(progress));
                }
            });
        }).then(function(evidencePackage) {
            if (job.cancelled || activeJob !== job || job.generation !== generation || job.log !== currentLog) {
                return;
            }
            if (!rangesEqual(readSelectedRange(), job.range)) {
                activeJob = null;
                showError("The graph In/Out range changed. Run Tune Advisor again for the new selection.");
                return;
            }
            activeJob = null;
            if (!evidencePackage || typeof evidencePackage !== "object") {
                throw new Error("Tune Advisor returned an invalid evidence package.");
            }
            currentPackage = evidencePackage;
            renderResults(evidencePackage);
        }).catch(function(error) {
            if (job.cancelled || job.generation !== generation || job.log !== currentLog) {
                return;
            }
            if (activeJob === job) {
                activeJob = null;
            }
            if (error && error.code === "ANALYSIS_CANCELLED"
                    && !rangesEqual(readSelectedRange(), job.range)) {
                showError("The graph In/Out range changed. Run Tune Advisor again for the new selection.");
                return;
            }
            showError(error && error.message
                ? "Tune Advisor could not analyze this log: " + error.message
                : "Tune Advisor could not analyze this log.");
        });
    }

    function openAdvisor() {
        if (!cacheElements()) {
            return;
        }
        if (!currentLog) {
            return;
        }

        modal.modal("show");
        startAnalysis(false);
    }

    function setCurrentLog(flightLog, context) {
        generation++;
        cancelActiveJob();
        currentLog = flightLog || null;
        currentContext = context || {};
        currentPackage = null;
        setTriggerEnabled(Boolean(currentLog));
        resetPresentation();

        if (currentLog && cacheElements() && modal.hasClass("in")) {
            startAnalysis(true);
        }
    }

    function bindUi() {
        if (isBound || !cacheElements()) {
            return;
        }
        isBound = true;

        $(document).on("click.rotorLensTuneAdvisor", ".open-tune-advisor", function(event) {
            event.preventDefault();
            if ($(this).hasClass("disabled") || $(this).prop("disabled")) {
                return;
            }
            openAdvisor();
        });

        rerunButton.on("click.rotorLensTuneAdvisor", function() {
            startAnalysis(true);
        });

        $(document).on("rotorlens:analysis-range-change.rotorLensTuneAdvisor", function() {
            generation++;
            cancelActiveJob();
            currentPackage = null;
            resetPresentation();
            if (modal.hasClass("in") && readSelectedRange()) {
                startAnalysis(true);
            }
        });

        modal.on("hidden.bs.modal.rotorLensTuneAdvisor", function() {
            cancelActiveJob();
            modal.attr("aria-busy", "false");
            $(".open-tune-advisor:visible").first().trigger("focus");
        });

        setTriggerEnabled(Boolean(currentLog));
        resetPresentation();
    }

    window.RotorLensTuneAdvisorUI = {
        setCurrentLog: setCurrentLog,
        open: openAdvisor,
        cancel: cancelActiveJob
    };

    $(bindUi);
})(window, document, window.jQuery);
