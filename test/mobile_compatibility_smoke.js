"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repositoryRoot = path.resolve(__dirname, "..");
const androidDocumentURL = new URL("https://appassets.androidplatform.net/assets/index.html");

function source(relativePath) {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function assertMobileAssetURLs() {
    const craftSource = source("js/craft_3d.js");
    const exporterSource = source("js/csv-exporter.js");
    const workerSource = source("js/webworkers/csv-export-worker.js");
    const spectrumSource = source("js/graph_spectrum.js");

    assert.ok(craftSource.includes('loader.load("resources/models/bell_cw.gltf"'));
    assert.ok(exporterSource.includes('new Worker("js/webworkers/csv-export-worker.js")'));
    assert.ok(workerSource.includes('importScripts("../../node_modules/lodash/lodash.min.js")'));
    assert.ok(spectrumSource.includes("if (fftData)"));

    assert.strictEqual(
        new URL("resources/models/bell_cw.gltf", androidDocumentURL).pathname,
        "/assets/resources/models/bell_cw.gltf"
    );
    assert.strictEqual(
        new URL("js/webworkers/csv-export-worker.js", androidDocumentURL).pathname,
        "/assets/js/webworkers/csv-export-worker.js"
    );
    assert.strictEqual(
        new URL(
            "../../node_modules/lodash/lodash.min.js",
            "https://appassets.androidplatform.net/assets/js/webworkers/csv-export-worker.js"
        ).pathname,
        "/assets/node_modules/lodash/lodash.min.js"
    );
}

function assertNativeOpenSeam() {
    const mainSource = source("js/main.js");
    const platformSource = source("index.js");
    const androidHostSource = source(
        "mobile/android/app/src/main/java/io/github/mbwallace1390/rotorlens/ViewerActivity.java"
    );
    const iosSchemeSource = source(
        "mobile/ios/RotorflightBlackbox/BlackboxURLSchemeHandler.swift"
    );

    assert.ok(mainSource.includes("window.RotorflightBlackboxOpenFiles = loadFiles"));
    assert.ok(mainSource.includes("window.RotorflightBlackboxBeginFileOpen = beginFileOpen"));
    assert.ok(mainSource.includes("return Promise.all(pendingLoads)"));
    assert.ok(mainSource.includes("var logOpenContext = openContext || beginFileOpen()"));
    assert.ok(mainSource.includes("if (!openContext.isCurrent())"));
    assert.ok(mainSource.includes("item === null && RotorflightPlatform.mobile"));
    assert.ok(mainSource.includes("window.openRotorflightSharedFile = function"));
    assert.ok(mainSource.includes('fetch(url, { cache: "no-store" })'));
    assert.ok(platformSource.includes("window.RotorflightBlackboxBeginFileOpen"));
    assert.ok(platformSource.includes("if (!openContext.isCurrent())"));
    assert.ok(platformSource.includes('userAgent.indexOf("RotorflightBlackboxIOS/")'));
    assert.ok(platformSource.includes("mobile: isAndroid || isIos"));
    assert.ok(androidHostSource.includes('"/shared/"'));
    assert.ok(androidHostSource.includes('"/shared-ack/"'));
    assert.ok(androidHostSource.includes("acknowledgeSharedLog(token)"));
    assert.ok(androidHostSource.includes("pruneAcknowledgedSharedLogs("));
    assert.ok(androidHostSource.includes("sharedLogs.get(token)"));
    assert.ok(!androidHostSource.includes("/shared/current"));
    assert.ok(iosSchemeSource.includes("read(upToCount: 512 * 1024)"));
    assert.ok(
        source("mobile/ios/RotorflightBlackbox/RotorflightViewerController.swift")
            .includes('return opened === true ? "opened" : "superseded";')
    );
    assert.ok(!iosSchemeSource.includes("Data(contentsOf:"));
}

function assertMobileGraphDropdownSupport() {
    const platformSource = source("index.js");
    const documentSource = source("index.html");
    const addGraphButtonIndex = documentSource.indexOf("config-graphs-add");
    const addGraphGroupIndex = documentSource.lastIndexOf(
        '<div class="btn-group">',
        addGraphButtonIndex
    );
    const addGraphMenuIndex = documentSource.indexOf(
        '<ul class="dropdown-menu"',
        addGraphButtonIndex
    );

    assert.ok(addGraphButtonIndex >= 0, "Add graph control must exist");
    assert.ok(
        addGraphGroupIndex >= 0 && addGraphGroupIndex < addGraphButtonIndex,
        "Add graph dropdown must remain associated with its Bootstrap button group"
    );
    assert.ok(
        addGraphMenuIndex > addGraphButtonIndex,
        "Add graph control must have a following dropdown menu"
    );
    assert.ok(
        platformSource.includes('closest(toggle, ".dropdown, .btn-group")'),
        "Mobile dropdown handling must support Bootstrap button-group dropdowns"
    );
}

function assertMobileHeaderDialogLayout() {
    const androidStyles = source("css/android.css");

    assert.ok(
        androidStyles.includes("html.platform-android .header-dialog .cf_column.half"),
        "Mobile log-header layout must override its desktop half-width columns"
    );
    assert.ok(
        androidStyles.includes("html.platform-android .header-dialog .spacer_right"),
        "Mobile log-header layout must remove its desktop column spacers"
    );
    assert.ok(
        androidStyles.includes("html.platform-android .header-dialog .gui_box"),
        "Mobile log-header parameter boxes must contain their wide tables"
    );
    assert.ok(
        androidStyles.includes("overflow-wrap: anywhere"),
        "Mobile log-header labels must wrap instead of overlapping adjacent values"
    );
}

function assertSpectrumRangeCap() {
    const context = vm.createContext({});

    vm.runInContext(source("js/graph_spectrum_calc.js"), context, {
        filename: "js/graph_spectrum_calc.js"
    });

    context.GraphSpectrumCalc.setInTime(12345);

    assert.strictEqual(
        context.GraphSpectrumCalc.setOutTime(400000000),
        300012345
    );
}

function assertTuneAdvisorSelectedRangeContract() {
    const mainSource = source("js/main.js");
    const controlsSource = source("js/android_controls.js");
    const advisorSource = source("js/advisor/flightlog_adapter.js");
    const contractSource = source("js/advisor/evidence_contract.js");
    const rulesSource = source("js/advisor/rules.js");
    const uiSource = source("js/advisor/advisor_ui.js");
    const htmlSource = source("index.html");
    const platformSource = source("index.js");

    assert.ok(mainSource.includes("function getSelectedAnalysisRange()"));
    assert.ok(mainSource.includes("function syncGraphAnalysisRange()"));
    assert.ok(mainSource.includes('$(document).trigger("rotorlens:analysis-range-change"'));
    assert.ok(
        mainSource.includes("Number.isFinite(videoExportInTime)")
            && mainSource.includes("Number.isFinite(videoExportOutTime)"),
        "Both graph markers must be present before the Advisor receives a range"
    );
    assert.ok(controlsSource.includes("rotorlens:analysis-range-change.androidControls"));
    assert.ok(!controlsSource.includes("currentTimeText"));
    assert.ok(advisorSource.includes('"ANALYSIS_RANGE_REQUIRED"'));
    assert.ok(advisorSource.includes("options.timeRangeUs"));
    assert.ok(contractSource.includes("selectedRangeRequired: true"));
    assert.ok(rulesSource.includes('setting: "gov_f_gain"'));
    assert.ok(rulesSource.includes('directWriteAllowed: false'));
    assert.ok(rulesSource.includes('finalTuneClaim: false'));
    assert.ok(rulesSource.includes("118e912"));
    assert.ok(uiSource.includes("function evidenceRangeWithinSelection("));
    assert.ok(uiSource.includes("timeRangeUs[0] < timeRangeUs[1]"));
    assert.ok(uiSource.includes("function renderResults(evidencePackage, submittedRange, mechanicalState)"));
    assert.ok(uiSource.includes("function validateMechanicalResult(mechanicalResult, submittedRange)"));
    assert.ok(uiSource.includes("MECHANICAL_RANGE_MISMATCH"));
    assert.ok(uiSource.includes("engineOptions.mechanicalGate"));
    assert.ok(
        uiSource.indexOf("mechanicalEngine.analyzeFlightLog")
            < uiSource.indexOf("Promise.resolve(engine.analyzeFlightLog"),
        "Mechanical evidence must be completed before the gated Governor analysis"
    );
    assert.ok(htmlSource.includes('data-user-input="governorMaxThrottlePct"'));
    assert.ok(htmlSource.includes('min="10" max="100" step="1" inputmode="numeric"'));
    assert.ok(uiSource.includes("Number.isInteger(value)"));
    [
        "mechanicalInspection",
        "powerSystemHealthy",
        "rpmAndGearingVerified",
        "correctProfileVerified",
        "officialTestSetup",
        "safePitchPumps"
    ].forEach(function(confirmationId) {
        assert.ok(htmlSource.includes('data-confirmation="' + confirmationId + '"'));
    });
    [
        "css/rotorlens_advisor.css?v=117",
        "js/advisor/evidence_contract.js?v=117",
        "js/advisor/deterministic_metrics.js?v=117",
        "js/advisor/rules.js?v=117",
        "js/advisor/flightlog_adapter.js?v=117",
        "js/advisor/mechanical_analysis.js?v=117",
        "js/advisor/advisor_ui.js?v=117"
    ].forEach(function(assetUrl) {
        assert.ok(htmlSource.includes(assetUrl), "Missing versioned Advisor asset " + assetUrl);
    });
    assert.ok(platformSource.includes('androidAssetVersion = "117"'));
    assert.ok(htmlSource.includes("Spectrum patterns are inspection clues, not a component diagnosis."));
    assert.ok(htmlSource.includes("does not recommend PID or Governor changes"));
    assert.ok(source("css/rotorlens_advisor.css").includes(".tune-advisor-spectrum-grid"));
}

function assertTuneAdvisorResultValidationRuntime() {
    const advisorWindow = {
        __ROTORLENS_ADVISOR_TEST__: true,
        jQuery: function() {
            // Do not invoke the document-ready callback; these hooks are pure.
            return {};
        }
    };
    const context = vm.createContext({
        Date,
        Math,
        URL,
        document: {},
        window: advisorWindow
    });

    vm.runInContext(source("js/advisor/advisor_ui.js"), context, {
        filename: "js/advisor/advisor_ui.js"
    });

    const hooks = advisorWindow.RotorLensTuneAdvisorUI.testHooks;
    const nonWithholdCodes = new Set([
        "ANALYSIS_CANCELLED",
        "ANALYSIS_RANGE_INVALID",
        "ANALYSIS_RANGE_REQUIRED",
        "MECHANICAL_GATE_INVALID",
        "MECHANICAL_GATE_RANGE_MISMATCH",
        "CONSISTENT_DROOP",
        "CONSISTENT_OVERSHOOT"
    ]);
    const finalGateCodes = Array.from(new Set(
        (source("js/advisor/rules.js") + source("js/advisor/flightlog_adapter.js"))
            .match(/"[A-Z][A-Z0-9_]+"/g)
            .map(function(quotedCode) { return quotedCode.slice(1, -1); })
            .filter(function(code) {
                return code.includes("_") && !nonWithholdCodes.has(code);
            })
    ));
    finalGateCodes.forEach(function(code) {
        assert.strictEqual(
            hooks.hasCuratedWithheldReason(code),
            true,
            "Missing curated Governor F withhold wording for " + code
        );
    });
    const verifiedBuildLog = {
        firmwareType: "Rotorflight",
        firmwareVersion: "4.6.0",
        firmwareBuild: {
            verified: true,
            shortRevision: "118e912",
            raw: "Rotorflight 4.6.0 (118e912) STM32F7X2"
        }
    };
    assert.strictEqual(hooks.verifiedRotorflightBuild(verifiedBuildLog), true);
    assert.strictEqual(
        hooks.verifiedRotorflightBuild({
            firmwareType: "Rotorflight",
            firmwareVersion: "4.6.0"
        }),
        false,
        "A missing structured firmware build must fail closed"
    );
    assert.strictEqual(
        hooks.verifiedRotorflightBuild(Object.assign({}, verifiedBuildLog, {
            firmwareBuild: {
                verified: true,
                shortRevision: "118e912"
            }
        })),
        false,
        "A missing raw firmware revision must fail closed"
    );
    assert.strictEqual(
        hooks.verifiedRotorflightBuild(Object.assign({}, verifiedBuildLog, {
            firmwareBuild: {
                verified: true,
                shortRevision: "abcdef1",
                raw: "Rotorflight 4.6.0 (abcdef1) STM32F7X2"
            }
        })),
        false,
        "A wrong firmware revision hash must fail closed"
    );
    const recommendationMetadata = {
        experimental: true,
        sourceIds: ["rotorflight-governor-tuning"],
        provenance: {
            analysisMode: "deterministic-local",
            ruleset: "rotorlens-governor-f-next-test-v1",
            firmwareShortRevision: "118e912",
            selectedRangeOnly: true
        }
    };
    assert.strictEqual(hooks.recommendationMetadataMatches(recommendationMetadata), true);
    assert.strictEqual(
        hooks.recommendationMetadataMatches(Object.assign({}, recommendationMetadata, {
            experimental: false
        })),
        false,
        "A recommendation without the experimental marker must fail closed"
    );
    assert.strictEqual(
        hooks.recommendationMetadataMatches(Object.assign({}, recommendationMetadata, {
            sourceIds: ["unknown-source"]
        })),
        false,
        "A recommendation without the official Governor source ID must fail closed"
    );
    const canonicalConfirmationIds = [
        "mechanicalInspection",
        "powerSystemHealthy",
        "rpmAndGearingVerified",
        "correctProfileVerified",
        "officialTestSetup",
        "safePitchPumps"
    ];
    assert.strictEqual(hooks.exactCanonicalConfirmationIds(canonicalConfirmationIds), true);
    assert.strictEqual(
        hooks.exactCanonicalConfirmationIds(canonicalConfirmationIds.slice(0, 5)),
        false,
        "A missing confirmation ID must fail closed"
    );
    assert.strictEqual(
        hooks.exactCanonicalConfirmationIds(canonicalConfirmationIds.slice(0, 5).concat(
            "mechanicalInspection"
        )),
        false,
        "Duplicate confirmation IDs must not satisfy the gate"
    );
    const positiveFinding = {
        id: "governor-f-next-controlled-test",
        severity: "caution"
    };
    const ordinaryFinding = {
        id: "governor-prerequisites-required",
        severity: "info"
    };
    const evidencePackage = {
        findings: [positiveFinding, ordinaryFinding],
        grade: { overall: "supported" },
        quality: { status: "pass" }
    };

    assert.deepStrictEqual(
        Array.from(hooks.visibleFindings(evidencePackage, { state: "invalid" }), function(finding) {
            return finding.id;
        }),
        ["governor-prerequisites-required"],
        "An invalid recommendation must not render the positive next-test finding"
    );
    const rejectedState = hooks.overallState(evidencePackage, { state: "invalid" });
    assert.strictEqual(rejectedState.className, "status-blocked");
    assert.strictEqual(
        rejectedState.label,
        "Safety contract rejected · No advice",
        "An invalid recommendation must visibly fail closed"
    );
    assert.strictEqual(
        hooks.visibleFindings(evidencePackage, { state: "valid" }).length,
        2,
        "A fully validated recommendation may retain its positive next-test finding"
    );

    const selectedRange = { startTimeUs: 1000000, endTimeUs: 7000000 };
    const safeCapabilities = {
        offline: true,
        selectedRangeRequired: true,
        selectedRangeOnly: true,
        rawLogIncluded: false,
        componentDiagnosis: false,
        tuningRecommendations: false,
        settingDirectionAdvice: false,
        directSettingWrites: false
    };
    function acceptedAxis(axis, source, peaks) {
        return {
            axis,
            source,
            amplitudeKind: source === "gyroADC-filtered"
                ? "filtered-gyro-output" : "unfiltered-gyro-output",
            available: true,
            sampleCount: 5900,
            rmsDps: 12,
            broadbandPowerDps2: 144,
            broadbandRmsDps: 12,
            medianNoisePsdDps2PerHz: 0.25,
            windowCount: 20,
            candidateWindowCount: 20,
            windowCoverageRatio: 1,
            totalPossibleWindowCount: 22,
            validWindowCount: 20,
            validWindowCoverageRatio: 0.909,
            finiteSampleCoverageRatio: 0.983,
            finiteTimeSpanCoverageRatio: 1,
            firstFiniteSampleTimeUs: selectedRange.startTimeUs,
            lastFiniteSampleTimeUs: selectedRange.endTimeUs - 1000,
            leadingFiniteGapUs: 0,
            trailingFiniteGapUs: 1000,
            peaks: peaks || []
        };
    }
    function acceptedMechanical(status, axes) {
        return {
            schemaVersion: 1,
            engineVersion: "0.1.0",
            analysisMode: "deterministic-local",
            capabilities: safeCapabilities,
            range: {
                startTimeUs: selectedRange.startTimeUs,
                endTimeUs: selectedRange.endTimeUs,
                durationUs: 6000000,
                sampleCount: 6000
            },
            status,
            attention: status === "attention",
            available: true,
            reasonCodes: status === "attention"
                ? ["PERSISTENT_NARROWBAND_ENERGY"] : [],
            quality: {
                status: "accepted",
                sourceSampleCount: 6000,
                duplicateTimestampCount: 0,
                measuredSampleRateHz: 1000,
                resampledRateHz: 1000,
                resampledSampleCount: 6000,
                firstSelectedSampleTimeUs: selectedRange.startTimeUs,
                lastSelectedSampleTimeUs: selectedRange.endTimeUs,
                leadingSelectedGapUs: 0,
                trailingSelectedGapUs: 0,
                selectedTimestampSpanCoverageRatio: 1,
                resampledStartTimeUs: selectedRange.startTimeUs,
                resampledEndTimeUs: selectedRange.endTimeUs - 1000,
                resampledTimeSpanUs: 5999000,
                resampledRangeCoverageRatio: 1,
                medianIntervalUs: 1000,
                p95IntervalUs: 1000,
                interpolationGapLimitUs: 4000,
                windowSize: 512,
                overlapSamples: 256,
                windowCount: 20,
                totalPossibleWindowCount: 22,
                validWindowCount: 20,
                validWindowCoverageRatio: 0.909,
                finiteSampleCoverageRatio: 0.983,
                finiteTimeSpanCoverageRatio: 1,
                minimumCoverageRatio: 0.75,
                frequencyResolutionHz: 1.9531,
                maximumAnalyzedFrequencyHz: 450,
                maximumWelchWindowsPerAxis: 128,
                attentionBandRmsThresholdDps: 8
            },
            axes,
            findings: [{
                id: status === "attention"
                    ? "mechanical-prominent-peak" : "mechanical-clear",
                severity: status === "attention" ? "caution" : "info",
                timeRangeUs: [selectedRange.startTimeUs, selectedRange.endTimeUs]
            }]
        };
    }
    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    const attentionPeak = {
        frequencyHz: 82,
        psdDps2PerHz: 100,
        localNoisePsdDps2PerHz: 1,
        relativePowerDb: 20,
        prominenceDb: 20,
        // Engine serializes bandwidth to two decimals while resolution keeps
        // four; this honest one-bin value must survive UI validation.
        bandwidthHz: 1.95,
        bandPowerDps2: 100,
        bandRmsDps: 10,
        supportingWindowCount: 10,
        evaluatedWindowCount: 20,
        persistenceRatio: 0.5,
        attentionSupportingWindowCount: 5,
        attentionPersistenceRatio: 0.25,
        attentionTemporalSpanRatio: 0.6,
        attentionOccupiedBucketCount: 3,
        attentionMaximumGapRatio: 0.2,
        attentionEligible: true,
        harmonicMatch: null
    };
    const validClear = acceptedMechanical("clear", [
        acceptedAxis("roll", "gyroRAW"),
        acceptedAxis("pitch", "gyroUnfilt"),
        acceptedAxis("yaw", "gyroRAW")
    ]);
    const validAttention = acceptedMechanical("attention", [
        acceptedAxis("roll", "gyroRAW", [attentionPeak]),
        acceptedAxis("pitch", "gyroUnfilt"),
        acceptedAxis("yaw", "gyroADC-filtered")
    ]);
    const clearValidation = hooks.validateMechanicalResult(validClear, selectedRange);
    const mechanicalValidation = hooks.validateMechanicalResult(
        validAttention,
        selectedRange
    );
    assert.strictEqual(clearValidation.state, "valid", "A rigorous clear result must pass");
    assert.strictEqual(
        mechanicalValidation.state,
        "valid",
        "A rigorous attention result with an eligible peak must pass"
    );
    assert.strictEqual(
        hooks.applyMechanicalRecommendationBoundary({ state: "valid" }, clearValidation).state,
        "valid",
        "Only a rigorously validated clear result may preserve Governor direction"
    );
    assert.strictEqual(
        hooks.validateMechanicalResult(Object.assign({}, validAttention, {
            range: { startTimeUs: 0, endTimeUs: selectedRange.endTimeUs }
        }), selectedRange).state,
        "range-mismatch",
        "Mechanical results from outside the submitted In/Out range must fail closed"
    );
    assert.strictEqual(
        hooks.validateMechanicalResult(Object.assign({}, validAttention, {
            findings: [{
                id: "outside-selection",
                timeRangeUs: [0, selectedRange.endTimeUs]
            }]
        }), selectedRange).state,
        "range-mismatch",
        "Every mechanical finding must remain bound to the exact submitted range"
    );
    assert.strictEqual(
        hooks.validateMechanicalResult(Object.assign({}, validAttention, {
            capabilities: Object.assign({}, safeCapabilities, {
                componentDiagnosis: true
            })
        }), selectedRange).state,
        "unavailable",
        "A result claiming component-diagnosis capability must not render"
    );
    [
        function(result) { result.engineVersion = ""; },
        function(result) { result.available = false; },
        function(result) { result.quality.status = "unverified"; },
        function(result) { result.quality.attentionBandRmsThresholdDps = 7; },
        function(result) { result.quality.validWindowCoverageRatio = 0.2; },
        function(result) { result.axes[1].axis = "roll"; },
        function(result) {
            result.axes[2].source = "gyroADC-filtered";
            result.axes[2].amplitudeKind = "filtered-gyro-output";
        },
        function(result) {
            result.axes[0].peaks = [Object.assign({}, attentionPeak, {
                attentionEligible: true
            })];
        },
        function(result) {
            result.axes[0].peaks = [Object.assign({}, attentionPeak, {
                attentionEligible: true,
                attentionOccupiedBucketCount: 2
            })];
        }
    ].forEach(function(mutate, index) {
        const malformedClear = clone(validClear);
        mutate(malformedClear);
        assert.strictEqual(
            hooks.validateMechanicalResult(malformedClear, selectedRange).state,
            "unavailable",
            "Malformed clear result " + index + " must become unavailable"
        );
    });

    const impossibleLowRateClear = clone(validClear);
    impossibleLowRateClear.range.sampleCount = 256;
    Object.assign(impossibleLowRateClear.quality, {
        sourceSampleCount: 256,
        measuredSampleRateHz: 50,
        resampledRateHz: 50,
        resampledSampleCount: 256,
        resampledEndTimeUs: selectedRange.startTimeUs + 5100000,
        resampledTimeSpanUs: 5100000,
        resampledRangeCoverageRatio: 0.85,
        windowSize: 256,
        overlapSamples: 128,
        windowCount: 3,
        totalPossibleWindowCount: 3,
        validWindowCount: 3,
        validWindowCoverageRatio: 1,
        frequencyResolutionHz: 0.1953,
        maximumAnalyzedFrequencyHz: 22.5
    });
    impossibleLowRateClear.axes.forEach(function(axis) {
        Object.assign(axis, {
            sampleCount: 256,
            windowCount: 3,
            candidateWindowCount: 3,
            windowCoverageRatio: 1,
            totalPossibleWindowCount: 3,
            validWindowCount: 3,
            validWindowCoverageRatio: 1,
            finiteSampleCoverageRatio: 1,
            finiteTimeSpanCoverageRatio: 0.85,
            firstFiniteSampleTimeUs: selectedRange.startTimeUs,
            lastFiniteSampleTimeUs: selectedRange.startTimeUs + 5100000,
            leadingFiniteGapUs: 0,
            trailingFiniteGapUs: 900000,
            peaks: []
        });
    });
    assert.strictEqual(
        hooks.validateMechanicalResult(impossibleLowRateClear, selectedRange).state,
        "unavailable",
        "A 6 s clear result cannot claim three 256-point windows from 256 samples at 50 Hz"
    );

    const validInsufficient = {
        schemaVersion: 1,
        engineVersion: "0.1.0",
        analysisMode: "deterministic-local",
        capabilities: safeCapabilities,
        range: {
            startTimeUs: selectedRange.startTimeUs,
            endTimeUs: selectedRange.endTimeUs,
            durationUs: 6000000,
            sampleCount: 6000
        },
        status: "insufficient",
        attention: false,
        available: false,
        reasonCodes: ["VALID_WINDOW_COVERAGE_INSUFFICIENT"],
        quality: {
            status: "insufficient",
            sourceSampleCount: 6000,
            measuredSampleRateHz: 1000,
            resampledRateHz: 1000,
            resampledSampleCount: 6000,
            firstSelectedSampleTimeUs: selectedRange.startTimeUs,
            lastSelectedSampleTimeUs: selectedRange.endTimeUs,
            leadingSelectedGapUs: 0,
            trailingSelectedGapUs: 0,
            selectedTimestampSpanCoverageRatio: 1,
            resampledStartTimeUs: selectedRange.startTimeUs,
            resampledEndTimeUs: selectedRange.endTimeUs - 1000,
            resampledTimeSpanUs: 5999000,
            resampledRangeCoverageRatio: 1,
            windowSize: 512,
            overlapSamples: 256,
            windowCount: 11,
            totalPossibleWindowCount: 22,
            validWindowCount: 11,
            validWindowCoverageRatio: 0.5,
            finiteSampleCoverageRatio: 1,
            finiteTimeSpanCoverageRatio: 1,
            minimumCoverageRatio: 0.75,
            attentionBandRmsThresholdDps: 8,
            frequencyResolutionHz: 1.9531
        },
        axes: [],
        findings: [{
            id: "mechanical-analysis-insufficient",
            severity: "caution",
            timeRangeUs: [selectedRange.startTimeUs, selectedRange.endTimeUs]
        }]
    };
    const insufficientValidation = hooks.validateMechanicalResult(
        validInsufficient,
        selectedRange
    );
    assert.strictEqual(insufficientValidation.state, "valid");
    assert.strictEqual(
        hooks.applyMechanicalRecommendationBoundary(
            { state: "valid" },
            insufficientValidation
        ).state,
        "mechanical-withhold",
        "Insufficient mechanical evidence must defensively hide Governor direction"
    );
    assert.strictEqual(
        hooks.overallState(
            evidencePackage,
            { state: "mechanical-withhold" },
            insufficientValidation
        ).label,
        "Mechanical evidence limited",
        "Insufficient mechanical evidence must not display a supported overall state"
    );
    assert.strictEqual(
        hooks.overallState(
            evidencePackage,
            { state: "mechanical-withhold" },
            { state: "unavailable" }
        ).className,
        "status-caution",
        "Unavailable mechanical evidence must remain visibly limited"
    );
    const mechanicalWithhold = hooks.applyMechanicalRecommendationBoundary(
        { state: "valid" },
        mechanicalValidation
    );
    assert.strictEqual(
        mechanicalWithhold.state,
        "mechanical-withhold",
        "Mechanical attention must defensively hide Governor direction"
    );
    const mechanicalOverall = hooks.overallState(
        evidencePackage,
        mechanicalWithhold,
        mechanicalValidation
    );
    assert.strictEqual(mechanicalOverall.className, "status-caution");
    assert.strictEqual(mechanicalOverall.label, "Mechanical inspection advised");
    const blockedMechanicalOverall = hooks.overallState(
        Object.assign({}, evidencePackage, { quality: { status: "blocked" } }),
        mechanicalWithhold,
        mechanicalValidation
    );
    assert.strictEqual(
        blockedMechanicalOverall.className,
        "status-blocked",
        "Mechanical attention must never downgrade a blocked safety result"
    );

    const productionWindow = { jQuery: function() { return {}; } };
    const productionContext = vm.createContext({
        Date,
        Math,
        URL,
        document: {},
        window: productionWindow
    });
    vm.runInContext(source("js/advisor/advisor_ui.js"), productionContext, {
        filename: "js/advisor/advisor_ui.js"
    });
    assert.deepStrictEqual(
        Object.keys(productionWindow.RotorLensTuneAdvisorUI).sort(),
        ["cancel", "open", "setCurrentLog"],
        "Pure test hooks must not be exposed by the production Advisor API"
    );
}

async function assertRealMechanicalResultsPassUiValidator() {
    const mechanical = require(path.join(
        repositoryRoot,
        "js/advisor/mechanical_analysis.js"
    ));
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
    vm.runInContext(source("js/advisor/advisor_ui.js"), context, {
        filename: "js/advisor/advisor_ui.js"
    });
    const hooks = advisorWindow.RotorLensTuneAdvisorUI.testHooks;
    const selectedRange = { startTimeUs: 1000000, endTimeUs: 7000000 };

    function mechanicalSeries(amplitudeDps) {
        const timeUs = [];
        const roll = [];
        const pitch = [];
        const yaw = [];
        for (let index = 0; index <= 8000; index++) {
            const seconds = index / 1000;
            const value = amplitudeDps * Math.sin(2 * Math.PI * 82 * seconds);
            timeUs.push(index * 1000);
            roll.push(value);
            pitch.push(value);
            yaw.push(value);
        }
        return {
            timeUs,
            gyro: { roll, pitch, yaw },
            gyroSources: {
                roll: "gyroRAW",
                pitch: "gyroUnfilt",
                yaw: "gyroRAW"
            }
        };
    }

    for (const testCase of [
        { amplitudeDps: 0.2, expectedStatus: "clear" },
        { amplitudeDps: 30, expectedStatus: "attention" }
    ]) {
        const result = await mechanical.analyzeTimeSeries(
            mechanicalSeries(testCase.amplitudeDps),
            { timeRangeUs: selectedRange }
        );
        assert.strictEqual(result.status, testCase.expectedStatus);
        assert.strictEqual(
            hooks.validateMechanicalResult(result, selectedRange).state,
            "valid",
            "Real " + testCase.expectedStatus
                + " engine output must satisfy the strict UI schema"
        );
    }

    const realClear = await mechanical.analyzeTimeSeries(
        mechanicalSeries(0.2),
        { timeRangeUs: selectedRange }
    );
    const impossibleWindows = JSON.parse(JSON.stringify(realClear));
    impossibleWindows.quality.totalPossibleWindowCount += 1;
    impossibleWindows.axes.forEach(function(axis) {
        axis.totalPossibleWindowCount += 1;
    });
    assert.strictEqual(
        hooks.validateMechanicalResult(impossibleWindows, selectedRange).state,
        "unavailable",
        "A clear result with an impossible sample/window timeline must be withheld"
    );
}

const runPromise = (async function run() {
    assertMobileAssetURLs();
    assertNativeOpenSeam();
    assertMobileGraphDropdownSupport();
    assertMobileHeaderDialogLayout();
    assertSpectrumRangeCap();
    assertTuneAdvisorSelectedRangeContract();
    assertTuneAdvisorResultValidationRuntime();
    await assertRealMechanicalResultsPassUiValidator();

    console.log("Mobile compatibility smoke tests passed: hosted assets, ranges, and mobile layouts");
}());

module.exports = runPromise;
if (require.main === module) {
    runPromise.catch(function(error) {
        console.error(error);
        process.exitCode = 1;
    });
}
