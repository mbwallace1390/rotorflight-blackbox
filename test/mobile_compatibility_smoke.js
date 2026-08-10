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
    assert.ok(platformSource.includes('androidAssetVersion = "115"'));
}

assertMobileAssetURLs();
assertNativeOpenSeam();
assertMobileGraphDropdownSupport();
assertMobileHeaderDialogLayout();
assertSpectrumRangeCap();
assertTuneAdvisorSelectedRangeContract();

console.log("Mobile compatibility smoke tests passed: hosted assets, ranges, and mobile layouts");
