"use strict";

(function(root, factory) {
    var api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.RotorLensAdvisorEvidenceContract = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function() {
    var SCHEMA_VERSION = 2;
    var ENGINE_VERSION = "0.2.0";
    var MAX_EVIDENCE_ITEMS = 96;
    var MAX_FINDINGS = 32;

    var SOURCES = Object.freeze([
        Object.freeze({
            id: "rotorflight-blackbox",
            title: "Rotorflight Blackbox",
            url: "https://rotorflight.org/docs/2.0.0/Wiki/Configurator/Blackbox"
        }),
        Object.freeze({
            id: "rotorflight-filter-tuning",
            title: "Rotorflight First Flight & Filter Tuning",
            url: "https://rotorflight.org/docs/Tuning/First-Flight-Filter-Tuning"
        }),
        Object.freeze({
            id: "rotorflight-governor-tuning",
            title: "Rotorflight Tune the Governor",
            url: "https://rotorflight.org/docs/2.2.0/Tuning/Tune-Governor"
        })
    ]);

    function roundNumber(value, digits) {
        if (!Number.isFinite(value)) {
            return null;
        }

        var places = digits === undefined ? 3 : digits;
        var scale = Math.pow(10, places);
        return Math.round(value * scale) / scale;
    }

    function compact(value) {
        if (value === undefined || typeof value === "function") {
            return undefined;
        }

        if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
        }

        if (value === null || typeof value !== "object") {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(compact).filter(function(item) {
                return item !== undefined;
            });
        }

        var result = {};
        Object.keys(value).forEach(function(key) {
            var item = compact(value[key]);
            if (item !== undefined) {
                result[key] = item;
            }
        });
        return result;
    }

    function EvidenceBuilder() {
        this.items = [];
        this.ids = Object.create(null);
    }

    EvidenceBuilder.prototype.add = function(item) {
        if (!item || typeof item.id !== "string" || item.id.length === 0) {
            throw new TypeError("Evidence requires a stable non-empty id");
        }

        if (this.ids[item.id]) {
            throw new Error("Duplicate evidence id: " + item.id);
        }

        if (this.items.length >= MAX_EVIDENCE_ITEMS) {
            throw new RangeError("Evidence package exceeded its compact item limit");
        }

        var compactItem = compact(item);
        this.ids[item.id] = true;
        this.items.push(compactItem);
        return item.id;
    };

    function makePackage(sections) {
        var result = compact({
            schemaVersion: SCHEMA_VERSION,
            engineVersion: ENGINE_VERSION,
            analysisMode: "deterministic-local",
            capabilities: {
                cloudRequired: false,
                directSettingWrites: false,
                settingDirectionAdvice: false,
                selectedRangeRequired: true,
                rawLogIncluded: false
            },
            log: sections.log,
            range: sections.range,
            grade: sections.grade,
            quality: sections.quality,
            coverage: sections.coverage,
            tracking: sections.tracking,
            battery: sections.battery,
            governor: sections.governor,
            evidence: sections.evidence || [],
            findings: sections.findings || [],
            sources: SOURCES
        });

        if (result.evidence.length > MAX_EVIDENCE_ITEMS) {
            throw new RangeError("Evidence package is too large");
        }

        if (result.findings.length > MAX_FINDINGS) {
            throw new RangeError("Finding package is too large");
        }

        return result;
    }

    return Object.freeze({
        SCHEMA_VERSION: SCHEMA_VERSION,
        ENGINE_VERSION: ENGINE_VERSION,
        SOURCES: SOURCES,
        EvidenceBuilder: EvidenceBuilder,
        compact: compact,
        makePackage: makePackage,
        roundNumber: roundNumber
    });
}));
