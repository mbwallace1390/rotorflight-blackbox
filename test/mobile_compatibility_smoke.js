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

function analysisMarkerTestHooks() {
    const mainSource = source("js/main.js");
    const helperStart = mainSource.indexOf("function canonicalAnalysisMarkerTime(");
    const helperEnd = mainSource.indexOf("function BlackboxLogViewer()");
    assert.ok(helperStart >= 0 && helperEnd > helperStart);
    const context = vm.createContext({ Number });
    vm.runInContext(mainSource.slice(helperStart, helperEnd), context, {
        filename: "js/main.js#analysis-marker-helpers"
    });
    return context;
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
    assert.ok(androidHostSource.includes('VIEWER_ASSET_VERSION = "124"'));
    assert.ok(androidHostSource.includes('"/assets/index.html?v=" + VIEWER_ASSET_VERSION'));
    assert.ok(androidHostSource.includes("shouldRestoreWebViewState(savedAssetVersion)"));
    assert.ok(androidHostSource.includes("webView.restoreState(savedInstanceState)"));
    assert.ok(androidHostSource.includes("webView.loadUrl(START_URL)"));
    assert.ok(androidHostSource.includes(
        "outState.putString(STATE_VIEWER_ASSET_VERSION, VIEWER_ASSET_VERSION)"
    ));
    assert.ok(
        androidHostSource.indexOf("restoreSharedLog(savedInstanceState)")
            < androidHostSource.indexOf("shouldRestoreWebViewState(savedAssetVersion)"),
        "Shared-log restoration must remain independent of WebView asset-state restoration"
    );
    assert.ok(androidHostSource.includes("new AdvisorAiBridge(this, webView, START_URL)"));
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
    const androidHostSource = source(
        "mobile/android/app/src/main/java/io/github/mbwallace1390/rotorlens/ViewerActivity.java"
    );
    const nativeAssetVersion = androidHostSource.match(
        /VIEWER_ASSET_VERSION = "([0-9]+)"/
    );
    const platformAssetVersion = platformSource.match(
        /androidAssetVersion = "([0-9]+)"/
    );
    assert.ok(nativeAssetVersion && platformAssetVersion);
    assert.strictEqual(nativeAssetVersion[1], "124");
    assert.strictEqual(platformAssetVersion[1], nativeAssetVersion[1]);
    const viewerAssetVersion = nativeAssetVersion[1];

    assert.ok(mainSource.includes("function getSelectedAnalysisRange()"));
    assert.ok(mainSource.includes("function canonicalAnalysisMarkerTime(time)"));
    assert.ok(mainSource.includes("nextAnalysisMarkerRange("));
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
    assert.ok(uiSource.includes("Number.isSafeInteger(range.startTimeUs)"));
    assert.ok(uiSource.includes("Number.isSafeInteger(range.endTimeUs)"));
    assert.ok(uiSource.includes("timeRangeUs[0] < timeRangeUs[1]"));
    assert.ok(uiSource.includes("function renderResults(evidencePackage, submittedRange, mechanicalState)"));
    assert.ok(uiSource.includes("function validateMechanicalResult(mechanicalResult, submittedRange)"));
    assert.ok(uiSource.includes("MECHANICAL_RANGE_MISMATCH"));
    assert.ok(uiSource.includes("engineOptions.mechanicalGate"));
    assert.ok(
        uiSource.includes("analysisGlobalBlocker = null;\n        renderGlobalBlocker();"),
        "Starting a report analysis must preserve any sticky cyclic safety blocker"
    );
    assert.ok(
        uiSource.indexOf("mechanicalEngine.analyzeFlightLog")
            < uiSource.indexOf("Promise.resolve(engine.analyzeFlightLog"),
        "Mechanical evidence must be completed before the gated Governor analysis"
    );
    assert.ok(htmlSource.includes('data-user-input="governorMaxThrottlePct"'));
    assert.ok(htmlSource.includes('min="10" max="100" step="1" inputmode="numeric"'));
    assert.ok(uiSource.includes("Number.isInteger(value)"));
    const canonicalConfirmationIds = [
        "mechanicalInspection",
        "powerSystemHealthy",
        "rpmAndGearingVerified",
        "correctProfileVerified",
        "officialTestSetup",
        "safePitchPumps"
    ];
    assert.strictEqual(
        (htmlSource.match(/data-flight-ready-confirmation/g) || []).length,
        1,
        "The six Governor F confirmations should have one explicit grouped UI acknowledgment"
    );
    assert.ok(!htmlSource.includes("data-flight-ready-confirmation checked"));
    canonicalConfirmationIds.forEach(function(confirmationId) {
        assert.ok(
            uiSource.includes('{ key: "' + confirmationId + '" }'),
            "The grouped UI must preserve canonical engine confirmation " + confirmationId
        );
        assert.ok(
            !htmlSource.includes('data-confirmation="' + confirmationId + '"'),
            "Canonical engine confirmations must not reappear as separate visible checkboxes"
        );
    });
    [
        "mechanical condition",
        "RPM/gearing",
        "power system",
        "active aircraft profile with no change before In",
        "conservative governed setup",
        "site, weather, pilot readiness, bailout plan, and pitch-pump maneuver"
    ].forEach(function(readinessCopy) {
        assert.ok(htmlSource.includes(readinessCopy));
    });
    [
        "css/rotorlens_advisor.css",
        "js/flightlog_parser.js",
        "js/advisor/evidence_contract.js",
        "js/advisor/deterministic_metrics.js",
        "js/advisor/rules.js",
        "js/advisor/flightlog_adapter.js",
        "js/advisor/mechanical_analysis.js",
        "js/advisor/ai_contract.js",
        "js/advisor/cyclic_pid_analysis.js",
        "js/advisor/advisor_ui.js",
        "js/main.js",
        "index.js"
    ].forEach(function(assetPath) {
        var assetUrl = assetPath + "?v=" + viewerAssetVersion;
        assert.ok(htmlSource.includes(assetUrl), "Missing versioned Advisor asset " + assetUrl);
    });
    assert.ok(
        htmlSource.indexOf("js/advisor/ai_contract.js?v=" + viewerAssetVersion)
            < htmlSource.indexOf("js/advisor/advisor_ui.js?v=" + viewerAssetVersion),
        "The strict AI safety contract must load before the Advisor UI"
    );
    assert.ok(
        htmlSource.indexOf("js/advisor/cyclic_pid_analysis.js?v=" + viewerAssetVersion)
            < htmlSource.indexOf("js/advisor/advisor_ui.js?v=" + viewerAssetVersion),
        "The cyclic comparison engine must load before its presentation hooks"
    );
    assert.ok(htmlSource.includes('data-tune-center-view="home"'));
    assert.ok(!htmlSource.includes('data-tune-center-view="home" hidden'));
    ["cyclic", "governor", "mechanical", "report"].forEach(function(viewName) {
        assert.ok(htmlSource.includes(
            'data-tune-center-view="' + viewName + '"'
        ));
        assert.ok(htmlSource.includes(
            'data-tune-center-target="' + viewName + '"'
        ));
    });
    assert.strictEqual(
        (htmlSource.match(/data-tune-center-target=/g) || []).length,
        4,
        "Tune Center home must expose exactly four drill-down modules"
    );
    assert.ok(htmlSource.includes("Save current I/O as baseline"));
    assert.ok(htmlSource.includes("Save current I/O as test"));
    assert.ok(htmlSource.includes("Measurement preview."));
    assert.ok(htmlSource.includes('name="tune-center-cyclic-axis" value="roll"'));
    assert.ok(htmlSource.includes('name="tune-center-cyclic-axis" value="pitch"'));
    assert.ok(htmlSource.includes('name="tune-center-cyclic-axis" value="yaw"'));
    assert.ok(htmlSource.includes('name="tune-center-cyclic-term" value="P"'));
    assert.ok(htmlSource.includes('name="tune-center-cyclic-term" value="I"'));
    assert.ok(htmlSource.includes('name="tune-center-cyclic-term" value="D"'));
    assert.ok(!uiSource.includes("startAnalysis(false)"));
    assert.ok(uiSource.includes('showTuneCenterView("home", false)'));
    assert.ok(uiSource.includes('"rotorlens:cyclic-capture-request"'));
    assert.ok(uiSource.includes('"rotorlens:cyclic-selection-change"'));
    assert.ok(
        uiSource.includes("engine.captureFlightLogRange(job.log"),
        "Tune Center must call the deterministic cyclic capture engine"
    );
    assert.ok(
        uiSource.includes("engine.compareCaptures(job.baselineCapture, capture)"),
        "Tune Center must compare the exact baseline object against the accepted test capture"
    );
    assert.ok(htmlSource.includes("Measurement evidence only."));
    assert.ok(htmlSource.includes("does not choose a PID direction or value"));
    assert.ok(htmlSource.includes("roll/pitch P or D stop behavior"));
    assert.ok(htmlSource.includes("I needs a sustained-hold test"));
    assert.ok(htmlSource.includes("withholds a better/worse outcome"));
    assert.ok(
        !htmlSource.includes('role="listitem"'),
        "Tune Center module buttons must retain native button accessibility semantics"
    );
    assert.ok(uiSource.includes("automatic: false"));
    assert.ok(uiSource.includes("comparisonRequired: true"));

    const markerHooks = analysisMarkerTestHooks();
    assert.strictEqual(
        markerHooks.canonicalAnalysisMarkerTime(8009840.6044273665),
        8009841
    );
    assert.strictEqual(
        markerHooks.canonicalAnalysisMarkerTime(14105537.12570931),
        14105537
    );
    assert.strictEqual(markerHooks.canonicalAnalysisMarkerTime(Infinity), false);
    assert.strictEqual(
        markerHooks.canonicalAnalysisMarkerTime(Number.MAX_SAFE_INTEGER + 1),
        false
    );
    const crossedIn = markerHooks.nextAnalysisMarkerRange(
        8000000,
        14105537,
        "in",
        14105536.7
    );
    assert.strictEqual(crossedIn.inTime, 14105537);
    assert.strictEqual(crossedIn.outTime, false);
    const crossedOut = markerHooks.nextAnalysisMarkerRange(
        8009841,
        14105537,
        "out",
        8009840.6
    );
    assert.strictEqual(crossedOut.inTime, false);
    assert.strictEqual(crossedOut.outTime, 8009841);
    assert.ok(htmlSource.includes("AI Coach for this selected range"));
    assert.ok(htmlSource.includes("not the raw log, settings, identity, or measured fact values"));
    assert.ok(htmlSource.includes("AI chooses which allowed validated finding and next step appear first"));
    assert.ok(htmlSource.includes("native code creates and validates every displayed card"));
    assert.ok(htmlSource.includes("approximately 329 MiB one-time model download"));
    assert.ok(htmlSource.includes('aria-live="polite"'));
    assert.ok(source("css/rotorlens_advisor.css").includes("min-height: 44px"));
    assert.ok(htmlSource.includes("Spectrum patterns are inspection clues, not a component diagnosis."));
    assert.ok(htmlSource.includes("does not recommend PID or Governor changes"));
    assert.ok(source("css/rotorlens_advisor.css").includes(".tune-advisor-spectrum-grid"));
}

function assertTuneAdvisorAIBridgeRuntime() {
    const sentMessages = [];
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
    const canonicalConfirmationIds = [
        "mechanicalInspection",
        "powerSystemHealthy",
        "rpmAndGearingVerified",
        "correctProfileVerified",
        "officialTestSetup",
        "safePitchPumps"
    ];
    const defaultConfirmations = hooks.emptyConfirmationValues();
    const confirmedAsGroup = hooks.groupedConfirmationValues(true);
    const uncheckedAsGroup = hooks.groupedConfirmationValues(false);
    const resetConfirmations = hooks.emptyConfirmationValues();
    canonicalConfirmationIds.forEach(function(confirmationId) {
        assert.strictEqual(defaultConfirmations[confirmationId], false);
        assert.strictEqual(confirmedAsGroup[confirmationId], true);
        assert.strictEqual(uncheckedAsGroup[confirmationId], false);
        assert.strictEqual(resetConfirmations[confirmationId], false);
    });
    assert.notStrictEqual(
        confirmedAsGroup,
        uncheckedAsGroup,
        "Unchecking must create a fresh fail-closed canonical confirmation set"
    );

    assert.strictEqual(hooks.canonicalTuneCenterView("cyclic"), "cyclic");
    assert.strictEqual(hooks.canonicalTuneCenterView("unknown"), "home");
    const normalizedSelection = hooks.canonicalCyclicSelection("PITCH", "p");
    assert.strictEqual(normalizedSelection.axis, "pitch");
    assert.strictEqual(normalizedSelection.term, "P");
    assert.strictEqual(hooks.canonicalCyclicSelection("all", "P"), null);

    const mutableRange = { startTimeUs: 1000000, endTimeUs: 7000000 };
    const captureRequest = hooks.cyclicCaptureRequestPayload(
        "baseline",
        mutableRange,
        { fileName: "baseline.bbl", logIndex: 1, logStartTimeUs: 500000 },
        normalizedSelection
    );
    mutableRange.startTimeUs = 2000000;
    assert.strictEqual(captureRequest.range.startTimeUs, 1000000);
    assert.strictEqual(captureRequest.range.endTimeUs, 7000000);
    assert.strictEqual(captureRequest.axis, "pitch");
    assert.strictEqual(captureRequest.term, "P");
    assert.strictEqual(captureRequest.automatic, false);
    assert.strictEqual(captureRequest.comparisonRequired, true);
    assert.ok(Object.isFrozen(captureRequest));
    assert.ok(Object.isFrozen(captureRequest.range));

    const validCyclicCapture = Object.freeze({
        schemaVersion: 1,
        kind: "rotorlens-cyclic-pid-capture",
        status: "captured",
        codes: Object.freeze([]),
        axis: "pitch",
        term: "P",
        range: Object.freeze({
            startTimeUs: 1000000,
            endTimeUs: 7000000,
            durationUs: 6000000
        }),
        firmware: Object.freeze({}),
        gainValue: 55,
        configuration: Object.freeze({}),
        availability: Object.freeze({}),
        maneuver: Object.freeze({
            stopCount: 4,
            positiveStopCount: 2,
            negativeStopCount: 2
        }),
        quality: Object.freeze({ measuredSampleRateHz: 1000 }),
        selectedFingerprint: "sel-deadbeef-6001",
        integrityKey: "cap-deadbeef"
    });
    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(validCyclicCapture, captureRequest),
        true
    );
    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(
            Object.assign({}, validCyclicCapture, {
                range: { startTimeUs: 1000001, endTimeUs: 7000000, durationUs: 5999999 }
            }),
            captureRequest
        ),
        false,
        "Cyclic evidence must remain bound to the exact requested I/O range"
    );
    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(
            Object.assign({}, validCyclicCapture, {
                status: "inconclusive",
                codes: ["INCREASE_P_TO_80"]
            }),
            captureRequest
        ),
        false,
        "Unknown or advice-shaped cyclic reason codes must fail closed"
    );
    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(
            Object.assign({}, validCyclicCapture, { records: [[1, 2, 3]] }),
            captureRequest
        ),
        false,
        "Raw frame arrays must never cross or persist through the cyclic UI boundary"
    );
    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(
            Object.assign({}, validCyclicCapture, {
                maneuver: Object.assign({}, validCyclicCapture.maneuver, {
                    advice: "increase P"
                })
            }),
            captureRequest
        ),
        false,
        "Nested cyclic advice fields must fail closed"
    );
    assert.strictEqual(
        hooks.cyclicCaptureMatchesRequest(
            Object.assign({}, validCyclicCapture, {
                status: "inconclusive",
                codes: ["FIRMWARE_BUILD_UNSUPPORTED"]
            }),
            captureRequest
        ),
        true,
        "Known engine hardening codes must cross the strict presentation boundary"
    );
    const cyclicMetadata = hooks.cyclicCaptureMetadataFromResult(
        "baseline",
        validCyclicCapture,
        captureRequest
    );
    assert.strictEqual(cyclicMetadata.captureStatus, "captured");
    assert.strictEqual(cyclicMetadata.stopCount, 4);
    assert.strictEqual(cyclicMetadata.gainValue, 55);
    assert.ok(Object.isFrozen(cyclicMetadata));

    const validComparison = {
        schemaVersion: 1,
        kind: "rotorlens-cyclic-pid-comparison",
        status: "improved",
        codes: [],
        axis: "pitch",
        term: "P",
        gainValues: { baseline: 55, test: 60 },
        evidence: [
            { metric: "trackingRmsDps", baselineValue: 12, testValue: 9, testToBaselineRatio: 0.75, state: "improved" },
            { metric: "fastRingingRmsDps", baselineValue: 4, testValue: 4, testToBaselineRatio: 1, state: "stable" },
            { metric: "slowOscillationRmsDps", baselineValue: 3, testValue: 3, testToBaselineRatio: 1, state: "stable" },
            { metric: "rawNoiseStepRmsDps", baselineValue: 2, testValue: 2, testToBaselineRatio: 1, state: "stable" }
        ]
    };
    const normalizedComparison = hooks.normalizeCyclicComparisonState(validComparison);
    assert.strictEqual(normalizedComparison.status, "improved");
    assert.strictEqual(normalizedComparison.evidence.length, 4);
    assert.strictEqual(
        hooks.normalizeCyclicComparisonState(Object.assign({}, validComparison, {
            direction: "increase"
        })),
        null,
        "The presentation boundary must reject fabricated cyclic direction fields"
    );

    const boundLog = {};
    const boundBaseline = {};
    const boundJob = {
        slot: "test",
        axis: "pitch",
        term: "P",
        range: { startTimeUs: 1000000, endTimeUs: 7000000 },
        generation: 4,
        log: boundLog,
        baselineCapture: boundBaseline,
        cancelled: false
    };
    const liveBinding = {
        activeJob: boundJob,
        generation: 4,
        log: boundLog,
        range: { startTimeUs: 1000000, endTimeUs: 7000000 },
        selection: { axis: "pitch", term: "P" },
        baselineCapture: boundBaseline
    };
    assert.strictEqual(hooks.cyclicCaptureBindingMatches(boundJob, liveBinding), true);
    assert.strictEqual(
        hooks.cyclicCaptureBindingMatches(boundJob, Object.assign({}, liveBinding, {
            generation: 5
        })),
        false,
        "A stale cyclic result must be discarded after generation changes"
    );
    assert.strictEqual(
        hooks.cyclicCaptureBindingMatches(boundJob, Object.assign({}, liveBinding, {
            baselineCapture: {}
        })),
        false,
        "A test result must stay bound to the exact baseline capture object"
    );
    const cyclicStopBlocker = hooks.cyclicSafetyBlockerForMetadata({
        baseline: { codes: ["SAMPLE_RATE_BELOW_900_HZ", "FAILSAFE_IN_SELECTION"] },
        test: null
    });
    assert.strictEqual(cyclicStopBlocker.level, "danger");
    assert.ok(cyclicStopBlocker.message.includes("stop / inspect"));
    const cyclicCautionBlocker = hooks.cyclicSafetyBlockerForMetadata({
        baseline: { codes: ["SAFETY_FIELDS_MISSING"] },
        test: null
    });
    assert.strictEqual(cyclicCautionBlocker.level, "warning");
    const cyclicQualityBlocker = hooks.cyclicSafetyBlockerForMetadata({
        baseline: { codes: ["SAMPLE_RATE_BELOW_900_HZ"] },
        test: null
    });
    assert.strictEqual(cyclicQualityBlocker.level, "warning");
    assert.ok(cyclicQualityBlocker.message.includes("900 Hz"));
    const cyclicComparisonBlocker = hooks.cyclicSafetyBlockerForMetadata(
        { baseline: { codes: [] }, test: { codes: [] } },
        { codes: ["RAW_GYRO_SOURCE_MISMATCH"] }
    );
    assert.strictEqual(cyclicComparisonBlocker.level, "warning");

    const baselineMetadata = Object.freeze({ id: "baseline-summary" });
    const lifecycleState = {
        selection: normalizedSelection,
        baseline: baselineMetadata,
        test: Object.freeze({ id: "stale-test" }),
        comparison: Object.freeze({ status: "improved" })
    };
    const afterLogChange = hooks.cyclicSessionAfterLogChange(lifecycleState);
    assert.strictEqual(
        afterLogChange.baseline,
        baselineMetadata,
        "Baseline summary metadata must survive a cross-file setCurrentLog lifecycle"
    );
    assert.strictEqual(afterLogChange.test, null);
    assert.strictEqual(afterLogChange.comparison, null);
    const afterSelectionChange = hooks.cyclicSessionAfterSelectionChange(
        afterLogChange,
        { axis: "roll", term: "D" }
    );
    assert.strictEqual(afterSelectionChange.selection.axis, "roll");
    assert.strictEqual(afterSelectionChange.selection.term, "D");
    assert.strictEqual(afterSelectionChange.baseline, null);
    assert.strictEqual(afterSelectionChange.test, null);
    assert.strictEqual(afterSelectionChange.comparison, null);
    assert.strictEqual(
        hooks.normalizeCyclicComparisonState({
            status: "improved",
            codes: [],
            direction: "increase"
        }),
        null,
        "The presentation boundary must reject fabricated direction/advice fields"
    );
    assert.strictEqual(
        hooks.aiBridgeAvailable(),
        false,
        "The AI Coach must fail closed when its native WebMessage bridge is absent"
    );

    advisorWindow.advisorAI = {
        postMessage: function(serialized) {
            sentMessages.push(serialized);
        }
    };
    assert.strictEqual(hooks.aiBridgeAvailable(), true);
    assert.strictEqual(hooks.aiStatusTimeoutMs, 125000);
    assert.strictEqual(hooks.aiRequestTimeoutMs, 125000);
    assert.strictEqual(
        hooks.retryKindForAIError("status", "TIMEOUT"),
        "status",
        "A timed-out model verification must retain status retry routing"
    );
    assert.strictEqual(hooks.retryKindForAIError("status", "CANCELLED"), "status");
    assert.strictEqual(hooks.retryKindForAIError("status", "BUSY"), "status");
    assert.strictEqual(hooks.retryKindForAIError("explain", "TIMEOUT"), null);
    assert.strictEqual(
        hooks.aiRetryRequestKind("error", false, "status"),
        "status",
        "The status-timeout CTA must retry model verification, not download"
    );
    assert.strictEqual(hooks.aiRetryRequestKind("error", false, null), "download");
    assert.strictEqual(hooks.aiRetryRequestKind("error", true, null), "explain");

    const markerHooks = analysisMarkerTestHooks();
    const request = {
        requestId: "11111111-1111-4111-8111-111111111111",
        rangeBinding: "22222222-2222-4222-8222-222222222222",
        generation: 7,
        range: {
            startTimeUs: markerHooks.canonicalAnalysisMarkerTime(8009840.6044273665),
            endTimeUs: markerHooks.canonicalAnalysisMarkerTime(14105537.12570931)
        },
        kind: "explain"
    };
    const exactReply = hooks.makeAIBridgeEnvelope(
        "advisor.status.result",
        request.requestId,
        {
            rangeBinding: request.rangeBinding,
            generation: request.generation,
            state: "ready"
        }
    );
    assert.strictEqual(
        hooks.responseMatchesAIRequest(
            exactReply,
            request,
            request.generation,
            request.range
        ),
        true
    );
    [
        Object.assign({}, exactReply, { requestId: "33333333-3333-4333-8333-333333333333" }),
        Object.assign({}, exactReply, {
            payload: Object.assign({}, exactReply.payload, {
                rangeBinding: "44444444-4444-4444-8444-444444444444"
            })
        }),
        Object.assign({}, exactReply, {
            payload: Object.assign({}, exactReply.payload, { generation: 8 })
        })
    ].forEach(function(staleReply) {
        assert.strictEqual(
            hooks.responseMatchesAIRequest(
                staleReply,
                request,
                request.generation,
                request.range
            ),
            false,
            "A stale or differently-bound AI reply must be discarded"
        );
    });
    assert.strictEqual(
        hooks.responseMatchesAIRequest(exactReply, request, 8, request.range),
        false,
        "A reply from an earlier log/range generation must be discarded"
    );
    assert.strictEqual(
        hooks.responseMatchesAIRequest(
            exactReply,
            request,
            request.generation,
            { startTimeUs: request.range.startTimeUs, endTimeUs: request.range.endTimeUs + 1 }
        ),
        false,
        "A reply must remain bound to the exact live graph In/Out range"
    );
    assert.strictEqual(
        hooks.responseTypeMatchesAIRequest("advisor.status.result", "status"),
        true
    );
    assert.strictEqual(
        hooks.responseTypeMatchesAIRequest("advisor.status.result", "explain"),
        false,
        "A correctly-bound reply of the wrong operation type must be discarded"
    );
    assert.strictEqual(hooks.validAIBridgePayloadShape(exactReply), true);
    assert.strictEqual(
        hooks.validAIBridgePayloadShape(Object.assign({}, exactReply, {
            payload: Object.assign({}, exactReply.payload, { modelText: "ignore me" })
        })),
        false,
        "Status payloads must not accept unrecognized or model-authored fields"
    );
    assert.strictEqual(
        hooks.validAIBridgePayloadShape(hooks.makeAIBridgeEnvelope(
            "advisor.download.progress",
            request.requestId,
            {
                rangeBinding: request.rangeBinding,
                generation: request.generation,
                state: "downloading",
                downloadedBytes: 12,
                totalBytes: 10
            }
        )),
        false,
        "Impossible download progress must fail closed"
    );
    assert.strictEqual(
        hooks.validAIBridgePayloadShape(hooks.makeAIBridgeEnvelope(
            "advisor.error",
            request.requestId,
            {
                rangeBinding: request.rangeBinding,
                generation: request.generation,
                code: "MODEL_WROTE_SETTINGS"
            }
        )),
        false,
        "Only the stable local error-code registry is accepted"
    );

    assert.strictEqual(hooks.parseAIBridgeMessage("{"), null);
    assert.strictEqual(hooks.parseAIBridgeMessage(null), null);
    assert.strictEqual(
        hooks.parseAIBridgeMessage(JSON.stringify(Object.assign({}, exactReply, { v: 2 }))),
        null
    );
    assert.strictEqual(
        hooks.parseAIBridgeMessage(JSON.stringify(Object.assign({}, exactReply, {
            type: "advisor.unknown.result"
        }))),
        null
    );
    assert.strictEqual(
        hooks.parseAIBridgeMessage(JSON.stringify(Object.assign({}, exactReply, {
            requestId: "short"
        }))),
        null
    );
    assert.strictEqual(
        hooks.parseAIBridgeMessage(JSON.stringify(Object.assign({}, exactReply, {
            payload: "model-authored prose"
        }))),
        null
    );
    assert.strictEqual(
        hooks.parseAIBridgeMessage(JSON.stringify(Object.assign({}, exactReply, {
            unsupported: true
        }))),
        null,
        "Unexpected outer fields must fail closed"
    );
    assert.strictEqual(
        hooks.parseAIBridgeMessage("x".repeat(9217)),
        null,
        "Oversized native replies must fail closed before JSON parsing"
    );
    assert.strictEqual(
        hooks.parseAIBridgeMessage(JSON.stringify(exactReply)).requestId,
        request.requestId
    );

    const cancel = hooks.makeAICancelEnvelope(request);
    assert.strictEqual(cancel.v, 1);
    assert.strictEqual(cancel.type, "advisor.cancel");
    assert.strictEqual(cancel.requestId, request.requestId);
    assert.strictEqual(cancel.payload.rangeBinding, request.rangeBinding);
    assert.strictEqual(cancel.payload.generation, request.generation);
    assert.strictEqual(cancel.payload.operation, "explain");

    const statusRequest = hooks.makeAIBridgeEnvelope(
        "advisor.status",
        request.requestId,
        hooks.commonAIBridgePayload(request)
    );
    assert.strictEqual(Number.isSafeInteger(statusRequest.payload.selection.startTimeUs), true);
    assert.strictEqual(Number.isSafeInteger(statusRequest.payload.selection.endTimeUs), true);
    assert.strictEqual(statusRequest.payload.selection.startTimeUs, 8009841);
    assert.strictEqual(statusRequest.payload.selection.endTimeUs, 14105537);
    assert.strictEqual(hooks.postAIBridgeEnvelope(statusRequest), true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(JSON.parse(sentMessages[0]).v, 1);
    assert.strictEqual(
        hooks.postAIBridgeEnvelope(hooks.makeAIBridgeEnvelope(
            "advisor.explain",
            request.requestId,
            { oversized: "x".repeat(32768) }
        )),
        false,
        "Serialized AI requests must be capped at 32 KiB"
    );
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(hooks.utf8ByteLength("\ud83d\ude81"), 4);
}

function assertNativeAIBridgeProtocolAlignment() {
    const protocolSource = source(
        "mobile/android/app/src/main/java/io/github/mbwallace1390/rotorlens/AdvisorAiProtocol.java"
    );
    const bridgeSource = source(
        "mobile/android/app/src/main/java/io/github/mbwallace1390/rotorlens/AdvisorAiBridge.java"
    );
    const serviceSource = source(
        "mobile/android/app/src/main/java/io/github/mbwallace1390/rotorlens/AdvisorAiService.java"
    );
    const statusMethod = serviceSource.slice(
        serviceSource.indexOf("void handleStatus("),
        serviceSource.indexOf("void startDownload(")
    );
    const finishMethod = serviceSource.slice(
        serviceSource.indexOf("private boolean finish("),
        serviceSource.indexOf("private boolean isCurrent(")
    );
    const timeoutMethod = serviceSource.slice(
        serviceSource.indexOf("private void timeout("),
        serviceSource.indexOf("private void cancelResources(")
    );

    assert.ok(protocolSource.includes("static final int VERSION = 1;"));
    assert.ok(protocolSource.includes("static final int MAX_REQUEST_BYTES = 32 * 1024;"));
    [
        'TYPE_STATUS = "advisor.status"',
        'TYPE_DOWNLOAD = "advisor.download"',
        'TYPE_EXPLAIN = "advisor.explain"',
        'TYPE_CANCEL = "advisor.cancel"',
        'TYPE_STATUS_RESULT = "advisor.status.result"',
        'TYPE_DOWNLOAD_PROGRESS = "advisor.download.progress"',
        'TYPE_DOWNLOAD_RESULT = "advisor.download.result"',
        'TYPE_EXPLAIN_RESULT = "advisor.explain.result"',
        'TYPE_ERROR = "advisor.error"'
    ].forEach(function(protocolLiteral) {
        assert.ok(
            protocolSource.includes(protocolLiteral),
            "Native and WebView AI protocol types must remain aligned: " + protocolLiteral
        );
    });
    assert.ok(protocolSource.includes("requireExactKeys(outer, OUTER_KEYS"));
    assert.ok(protocolSource.includes('outer.addProperty("v", VERSION)'));
    assert.ok(protocolSource.includes('outer.addProperty("type", type)'));
    assert.ok(protocolSource.includes('outer.addProperty("requestId", request.requestId)'));
    assert.ok(protocolSource.includes('outer.add("payload", payload)'));
    assert.ok(protocolSource.includes('payload.addProperty("rangeBinding", request.rangeBinding)'));
    assert.ok(protocolSource.includes('payload.addProperty("generation", request.generation)'));
    assert.ok(protocolSource.includes('payload.addProperty("state", state)'));
    assert.ok(protocolSource.includes('payload.addProperty("code", code)'));

    assert.ok(bridgeSource.includes('LISTENER_NAME = "advisorAI"'));
    assert.ok(bridgeSource.includes("WebViewCompat.addWebMessageListener("));
    assert.ok(bridgeSource.includes("Collections.singleton(ALLOWED_ORIGIN)"));
    assert.ok(bridgeSource.includes("!isMainFrame"));
    assert.ok(bridgeSource.includes("!isExactOrigin(sourceOrigin)"));
    assert.ok(
        bridgeSource.includes("!isExpectedPageUrl(expectedPageUrl, sourceView.getUrl())"),
        "AI bridge ingress must remain bound to the pinned viewer document"
    );
    assert.ok(
        bridgeSource.includes("isExpectedPageUrl(expectedPageUrl, webView.getUrl())"),
        "AI bridge replies must remain bound to the pinned viewer document"
    );
    assert.ok(bridgeSource.includes("actualPageUrl.indexOf('#')"));
    assert.ok(bridgeSource.includes("replyProxy.postMessage(response)"));
    assert.ok(!bridgeSource.includes("addJavascriptInterface"));

    assert.ok(statusMethod.includes('sendStatus(request, responder, "downloading")'));
    assert.ok(
        !statusMethod.includes("downloadedBytes") && !statusMethod.includes("totalBytes"),
        "advisor.status.result must keep its exact three-field payload"
    );
    assert.ok(serviceSource.includes('payload.addProperty("downloadedBytes", downloadedBytes)'));
    assert.ok(serviceSource.includes('payload.addProperty("totalBytes", totalBytes)'));
    assert.ok(serviceSource.includes("TYPE_DOWNLOAD_PROGRESS"));
    assert.ok(serviceSource.includes("INFERENCE_TIMEOUT_SECONDS = 120L"));
    assert.ok(serviceSource.includes("STATUS_VERIFICATION_TIMEOUT_SECONDS = 120L"));
    assert.ok(statusMethod.includes("STATUS_VERIFICATION_TIMEOUT_SECONDS"));
    assert.ok(statusMethod.includes("() -> timeout(operation)"));
    assert.strictEqual(
        (statusMethod.match(/timeout\(operation\)/g) || []).length,
        1,
        "Status verification must arm exactly one native terminal timeout"
    );
    assert.ok(finishMethod.includes("if (active != operation) return false;"));
    assert.ok(finishMethod.includes("active = null;"));
    assert.ok(timeoutMethod.includes("if (active != operation) return;"));
    assert.ok(timeoutMethod.includes("active = null;"));
    assert.ok(timeoutMethod.includes("operation.cancelled.set(true);"));
    assert.ok(timeoutMethod.includes("future.cancel(true)"));
    assert.ok(timeoutMethod.includes("AdvisorAiProtocol.ERROR_TIMEOUT"));
    assert.ok(
        source("js/advisor/advisor_ui.js").includes("AI_STATUS_TIMEOUT_MS = 125000"),
        "The JS watchdog must leave delivery headroom after native's 120s timeout"
    );
    assert.ok(
        source("js/advisor/advisor_ui.js").includes("AI_REQUEST_TIMEOUT_MS = 125000"),
        "The inference watchdog must leave delivery headroom after native's 120s timeout"
    );
    assert.ok(
        125000 > 120 * 1000,
        "The Web watchdog must fire after the native timeout can deliver one bound reply"
    );
    assert.ok(!serviceSource.includes("RotorLensAiDiag"));
    assert.ok(!serviceSource.includes("model output code-only="));
    assert.ok(!source(
        "mobile/android/app/src/main/java/io/github/mbwallace1390/rotorlens/AdvisorAiRuntime.kt"
    ).includes("RotorLensAiDiag"));
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
        "Production API must expose only app control; cyclic evidence stays inside the validated module"
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
    assertTuneAdvisorAIBridgeRuntime();
    assertNativeAIBridgeProtocolAlignment();
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
