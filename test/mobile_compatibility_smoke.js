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
    assert.ok(uiSource.includes("function renderResults(evidencePackage, submittedRange)"));
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
        "css/rotorlens_advisor.css?v=116",
        "js/advisor/evidence_contract.js?v=116",
        "js/advisor/deterministic_metrics.js?v=116",
        "js/advisor/rules.js?v=116",
        "js/advisor/flightlog_adapter.js?v=116",
        "js/advisor/advisor_ui.js?v=116"
    ].forEach(function(assetUrl) {
        assert.ok(htmlSource.includes(assetUrl), "Missing versioned Advisor asset " + assetUrl);
    });
    assert.ok(platformSource.includes('androidAssetVersion = "116"'));
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

assertMobileAssetURLs();
assertNativeOpenSeam();
assertMobileGraphDropdownSupport();
assertMobileHeaderDialogLayout();
assertSpectrumRangeCap();
assertTuneAdvisorSelectedRangeContract();
assertTuneAdvisorResultValidationRuntime();

console.log("Mobile compatibility smoke tests passed: hosted assets, ranges, and mobile layouts");
