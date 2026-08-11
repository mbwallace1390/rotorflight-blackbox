package io.github.mbwallace1390.rotorlens;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Strict, size-bounded protocol shared by the WebView bridge and service. */
final class AdvisorAiProtocol {
    static final int VERSION = 1;
    static final int MAX_REQUEST_BYTES = 32 * 1024;
    static final int MAX_MODEL_RESPONSE_CHARS = 512;
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;

    static final String TYPE_STATUS = "advisor.status";
    static final String TYPE_DOWNLOAD = "advisor.download";
    static final String TYPE_EXPLAIN = "advisor.explain";
    static final String TYPE_CANCEL = "advisor.cancel";

    static final String TYPE_STATUS_RESULT = "advisor.status.result";
    static final String TYPE_DOWNLOAD_PROGRESS = "advisor.download.progress";
    static final String TYPE_DOWNLOAD_RESULT = "advisor.download.result";
    static final String TYPE_EXPLAIN_RESULT = "advisor.explain.result";
    static final String TYPE_ERROR = "advisor.error";

    static final String ERROR_UNAVAILABLE = "AI_UNAVAILABLE";
    static final String ERROR_MODEL_NOT_INSTALLED = "MODEL_NOT_INSTALLED";
    static final String ERROR_DOWNLOAD_FAILED = "DOWNLOAD_FAILED";
    static final String ERROR_REQUEST_INVALID = "REQUEST_INVALID";
    static final String ERROR_REQUEST_TOO_LARGE = "REQUEST_TOO_LARGE";
    static final String ERROR_TIMEOUT = "TIMEOUT";
    static final String ERROR_CANCELLED = "CANCELLED";
    static final String ERROR_BUSY = "BUSY";
    static final String ERROR_INTERNAL = "INTERNAL";

    private static final Pattern SAFE_IDENTIFIER =
        Pattern.compile("[A-Za-z0-9._:/-]{1,256}");
    private static final Pattern SAFE_BINDING =
        Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{7,127}");
    private static final Pattern SAFE_CODE =
        Pattern.compile("[A-Z][A-Z0-9_]{1,79}");
    private static final Pattern SAFE_REFERENCE =
        Pattern.compile("[a-z][a-z0-9.-]{1,95}");
    private static final Pattern JSON_INTEGER = Pattern.compile("-?(0|[1-9][0-9]*)");
    private static final Set<String> REQUEST_TYPES = setOf(
        TYPE_STATUS,
        TYPE_DOWNLOAD,
        TYPE_EXPLAIN,
        TYPE_CANCEL
    );
    private static final Set<String> OUTER_KEYS = setOf(
        "v",
        "type",
        "requestId",
        "payload"
    );
    private static final Set<String> EXPLAIN_KEYS = setOf(
        "schemaVersion",
        "requestId",
        "rangeBinding",
        "generation",
        "selection",
        "status",
        "facts",
        "reasons",
        "findingIds",
        "mechanical",
        "validatedProposal",
        "allowedMessageCodes",
        "allowedNextStepCodes",
        "requiredMessageCodes",
        "requiredNextStepCodes"
    );
    private static final Set<String> MODEL_SELECTOR_KEYS = setOf(
        "focusMessageCode",
        "focusNextStepCode"
    );
    private static final Set<String> FORBIDDEN_ENVELOPE_KEYS = setOf(
        "rawLog",
        "log",
        "samples",
        "frames",
        "timeSeries",
        "trace",
        "fileBytes"
    );
    private static final Map<String, FactSpec> FACT_REGISTRY = factRegistry();
    private static final Set<String> KNOWN_FINDING_IDS = setOf(
        "unsupported-firmware",
        "log-too-short",
        "log-integrity-blocker",
        "log-integrity-caution",
        "missing-end-marker",
        "invalid-values",
        "logging-header-warning",
        "rx-safety-blocker",
        "rx-safety-unknown",
        "tracking-coverage-limited",
        "battery-warning-blocker",
        "battery-safety-unknown",
        "governor-targeted-log-needed",
        "governor-prerequisites-required",
        "governor-f-next-controlled-test",
        "mechanical-analysis-insufficient",
        "mechanical-unfiltered-gyro-required-for-clear-gate",
        "mechanical-no-persistent-narrowband-peak",
        "mechanical-persistent-peak-below-attention-threshold",
        "mechanical-persistent-main-rotor-harmonic",
        "mechanical-persistent-tail-rotor-harmonic",
        "mechanical-persistent-unmatched-narrowband-peak"
    );
    private static final Set<String> KNOWN_ADVISOR_REASONS = setOf(
        "ACTIVE_EVENT_MISSING_IN_SELECTION",
        "ARM_EVIDENCE_INCOMPLETE",
        "BATTERY_CONFIGURATION_HEADER_MISSING",
        "BATTERY_CONFIGURATION_INVALID",
        "BATTERY_FIELD_MISSING",
        "BATTERY_SAFETY_BLOCKER",
        "BATTERY_SAFETY_UNKNOWN",
        "BATTERY_SAMPLES_INCOMPLETE",
        "COLLECTIVE_FIELD_MISSING",
        "COLLECTIVE_RANGE_HEADER_MISSING",
        "CONFIRMATION_CONTEXT_MISMATCH",
        "CONFIRMATION_CONTEXT_REQUIRED",
        "CONFIRMATION_CORRECT_PROFILE_REQUIRED",
        "CONFIRMATION_MECHANICAL_INSPECTION_REQUIRED",
        "CONFIRMATION_OFFICIAL_TEST_SETUP_REQUIRED",
        "CONFIRMATION_POWER_SYSTEM_HEALTHY_REQUIRED",
        "CONFIRMATION_RPM_AND_GEARING_REQUIRED",
        "CONFIRMATION_SAFE_PITCH_PUMPS_REQUIRED",
        "CONFIRMATION_SESSION_REQUIRED",
        "CONSERVATIVE_F_TEST_PID_BASELINE_REQUIRED",
        "CONSISTENT_DROOP",
        "CONSISTENT_OVERSHOOT",
        "CROSS_PUMP_HEADSPEED_INCONSISTENT",
        "DISARM_IN_SELECTION",
        "EFFECTIVE_SAMPLE_RATE_BELOW_900_HZ",
        "FAILSAFE_FIELD_MISSING",
        "FAILSAFE_SAMPLES_INCOMPLETE",
        "FLIGHT_MODE_FIELD_MISSING",
        "FLIGHT_MODE_SAMPLES_INCOMPLETE",
        "GOVERNOR_ACTIVE_DATA_INSUFFICIENT",
        "GOVERNOR_EVENTS_TRUNCATED",
        "GOVERNOR_F_FULL_STEP_OUT_OF_RANGE",
        "GOVERNOR_MAX_THROTTLE_INVALID",
        "GOVERNOR_MAX_THROTTLE_REQUIRED",
        "GOVERNOR_NUMERIC_VALUES_IMPLAUSIBLE",
        "GOVERNOR_RECORDS_NOT_FULL_RATE",
        "GOVERNOR_REQUEST_EVIDENCE_INCOMPLETE",
        "GOVERNOR_REQUEST_UNSTABLE",
        "GOVERNOR_SETTINGS_MISSING_OR_INVALID",
        "GOVERNOR_STATE_SEQUENCE_UNSAFE",
        "GOVERNOR_TARGET_UNSTABLE",
        "GOVERNOR_TTA_MISSING_OR_INVALID",
        "GOVERNOR_TTA_MUST_BE_ZERO",
        "GOVERNOR_VALUES_INVALID_IN_SELECTION",
        "INCONSISTENT_PITCH_PUMPS",
        "INFLIGHT_ADJUSTMENT_IN_SELECTION",
        "INSUFFICIENT_PITCH_PUMPS",
        "LOGGING_HEADER_INCOMPLETE",
        "LOGGING_RESUME_IN_SELECTION",
        "MAIN_MOTOR_FIELD_MISSING",
        "MAX_FRAME_INTERVAL_TOO_HIGH",
        "MECHANICAL_ANALYSIS_INSUFFICIENT",
        "MECHANICAL_ANALYSIS_REQUIRED",
        "MECHANICAL_ANALYSIS_UNAVAILABLE",
        "MECHANICAL_ATTENTION_IN_SELECTION",
        "MOTOR_HEADROOM_INSUFFICIENT",
        "NON_MONOTONIC_TIMESTAMP_IN_SELECTION",
        "OFFICIAL_F_TEST_PID_BASELINE_REQUIRED",
        "OVERLAPPING_PUMP_WINDOWS",
        "POWERED_DURATION_TOO_SHORT",
        "PUMP_WINDOW_EVALUATION_LIMIT_REACHED",
        "REQUIRED_GOVERNOR_FIELDS_MISSING",
        "RESCUE_EVENT_IN_SELECTION",
        "RX_CHANNEL_SAMPLES_INCOMPLETE",
        "RX_FIELDS_MISSING",
        "RX_SAFETY_BLOCKER",
        "RX_SAFETY_UNKNOWN",
        "RX_SIGNAL_SAMPLES_INCOMPLETE",
        "SAMPLE_RATE_BELOW_900_HZ",
        "SAMPLE_RATE_UNAVAILABLE",
        "SELECTED_RANGE_NOT_CLEAN",
        "TAIL_EVIDENCE_INCOMPLETE",
        "TAIL_FIELDS_MISSING",
        "TAIL_RESPONSE_DEGRADED",
        "TAIL_TEST_NOT_CONTROLLED",
        "TIMING_COVERAGE_INCOMPLETE",
        "TIMING_JITTER_TOO_HIGH",
        "TIMING_P99_TOO_HIGH",
        "TRUNCATED_PUMP_WINDOW_IN_SELECTION",
        "UNARMED_PUMP_WINDOW",
        "UNSAFE_FLIGHT_MODE_IN_SELECTION",
        "UNSUPPORTED_FIRMWARE",
        "UNVERIFIED_FIRMWARE_BUILD"
    );
    private static final Set<String> KNOWN_MECHANICAL_REASONS = setOf(
        "ANALYSIS_CANCELLED",
        "ANALYSIS_RANGE_INVALID",
        "ANALYSIS_RANGE_REQUIRED",
        "FIELD_MISSING",
        "FILTERED_GYRO_SOURCE_USED",
        "FINITE_GYRO_SAMPLE_COVERAGE_INSUFFICIENT",
        "FINITE_GYRO_TIME_SPAN_COVERAGE_INSUFFICIENT",
        "GYRO_COVERAGE_INSUFFICIENT",
        "GYRO_FIELDS_MISSING",
        "INSUFFICIENT_CONTIGUOUS_GYRO_DATA",
        "INSUFFICIENT_COVERAGE",
        "INSUFFICIENT_TIMESTAMPED_SAMPLES",
        "MAIN_ROTOR_HARMONIC_CORRELATION",
        "MECHANICAL_ANALYSIS_UNAVAILABLE",
        "NON_MONOTONIC_TIMESTAMPS",
        "PERSISTENT_NARROWBAND_ENERGY",
        "PERSISTENT_NARROWBAND_ENERGY_BELOW_ATTENTION_THRESHOLD",
        "RESAMPLED_SAMPLE_LIMIT_EXCEEDED",
        "RPM_OUT_OF_RANGE",
        "RPM_UNSTABLE_IN_SELECTION",
        "SAMPLE_RATE_LIMIT_EXCEEDED",
        "SAMPLE_RATE_UNAVAILABLE",
        "SELECTED_TIMESTAMP_SPAN_COVERAGE_INSUFFICIENT",
        "SELECTION_DURATION_LIMIT_EXCEEDED",
        "SELECTION_SAMPLE_LIMIT_EXCEEDED",
        "TAIL_ROTOR_HARMONIC_CORRELATION",
        "TIMING_GAPS_EXCESSIVE",
        "UNFILTERED_GYRO_REQUIRED_FOR_CLEAR_GATE",
        "VALID_WINDOW_COVERAGE_INSUFFICIENT"
    );
    private static final Set<String> KNOWN_MESSAGE_CODES = setOf(
        "SCOPE_SELECTED_RANGE",
        "EVIDENCE_SUPPORTED",
        "EVIDENCE_LIMITED",
        "EVIDENCE_BLOCKED",
        "QUALITY_PASS",
        "QUALITY_CAUTION",
        "QUALITY_BLOCKED",
        "TRACKING_AVAILABLE",
        "TRACKING_LIMITED",
        "TRACKING_UNSUPPORTED",
        "BATTERY_AVAILABLE",
        "BATTERY_LIMITED",
        "BATTERY_WARNING",
        "BATTERY_UNSUPPORTED",
        "GOVERNOR_AVAILABLE",
        "GOVERNOR_LIMITED",
        "GOVERNOR_UNSUPPORTED",
        "MECHANICAL_CLEAR",
        "MECHANICAL_CLEAR_BELOW_ATTENTION",
        "MECHANICAL_ATTENTION_MAIN",
        "MECHANICAL_ATTENTION_TAIL",
        "MECHANICAL_ATTENTION_UNMATCHED",
        "MECHANICAL_INSUFFICIENT",
        "MECHANICAL_UNAVAILABLE",
        "PROPOSAL_READY",
        "PROPOSAL_WITHHELD"
    );
    private static final Set<String> KNOWN_NEXT_STEP_CODES = setOf(
        "VIEW_CITED_EVIDENCE",
        "SELECT_CLEANER_RANGE",
        "CAPTURE_TARGETED_GOVERNOR_LOG",
        "REVIEW_WITHHELD_PREREQUISITES",
        "INSPECT_MECHANICS_FIRST",
        "KEEP_COMPARISON_BASELINE",
        "REVIEW_VALIDATED_NEXT_TEST"
    );
    private static final JsonArray REQUIRED_LIMITATIONS = limitations();

    static final class ProtocolException extends Exception {
        final String code;

        ProtocolException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private static final class FactSpec {
        final String unit;
        final boolean booleanValue;
        final boolean integerValue;
        final double minimum;
        final double maximum;

        FactSpec(
            String unit,
            boolean booleanValue,
            boolean integerValue,
            double minimum,
            double maximum
        ) {
            this.unit = unit;
            this.booleanValue = booleanValue;
            this.integerValue = integerValue;
            this.minimum = minimum;
            this.maximum = maximum;
        }
    }

    static final class Request {
        final String type;
        final String requestId;
        final String rangeBinding;
        final int generation;
        final JsonObject payload;

        Request(
            String type,
            String requestId,
            String rangeBinding,
            int generation,
            JsonObject payload
        ) {
            this.type = type;
            this.requestId = requestId;
            this.rangeBinding = rangeBinding;
            this.generation = generation;
            this.payload = payload;
        }
    }

    private AdvisorAiProtocol() {}

    static Request parse(String raw) throws ProtocolException {
        if (raw == null) {
            throw invalid("Missing request");
        }
        if (raw.getBytes(StandardCharsets.UTF_8).length > MAX_REQUEST_BYTES) {
            throw new ProtocolException(ERROR_REQUEST_TOO_LARGE, "Request exceeded 32 KiB");
        }

        JsonObject outer;
        try {
            JsonElement parsed = JsonParser.parseString(raw);
            if (!parsed.isJsonObject()) throw invalid("Request must be an object");
            outer = parsed.getAsJsonObject();
        } catch (RuntimeException error) {
            throw invalid("Request was not valid JSON");
        }
        requireExactKeys(outer, OUTER_KEYS, "request");
        if (requiredInt(outer, "v") != VERSION) {
            throw invalid("Unsupported protocol version");
        }
        String type = requiredString(outer, "type", 64);
        if (!REQUEST_TYPES.contains(type)) {
            throw invalid("Unsupported request type");
        }
        String requestId = safeBinding(requiredString(outer, "requestId", 128));
        JsonObject payload = requiredObject(outer, "payload");
        String rangeBinding = safeBinding(requiredString(payload, "rangeBinding", 128));
        int generation = requiredInt(payload, "generation");
        if (generation < 0) throw invalid("Generation must be non-negative");

        if (TYPE_EXPLAIN.equals(type)) {
            requireExactKeys(payload, EXPLAIN_KEYS, "explain payload");
            if (requiredInt(payload, "schemaVersion") != VERSION
                || !requestId.equals(requiredString(payload, "requestId", 128))) {
                throw invalid("Explain envelope binding did not match the request");
            }
            validateExplainSelection(requiredObject(payload, "selection"));
            validateBoundedEnvelope(payload, 0);
            validateExplainEnvelope(payload);
        } else if (TYPE_STATUS.equals(type) || TYPE_DOWNLOAD.equals(type)) {
            validateContextPayload(payload, false);
        } else {
            validateContextPayload(payload, true);
        }
        return new Request(type, requestId, rangeBinding, generation, payload.deepCopy());
    }

    static String reply(String type, Request request, JsonObject payload) {
        JsonObject outer = new JsonObject();
        outer.addProperty("v", VERSION);
        outer.addProperty("type", type);
        outer.addProperty("requestId", request.requestId);
        outer.add("payload", payload);
        return outer.toString();
    }

    static JsonObject contextPayload(Request request, String state) {
        JsonObject payload = new JsonObject();
        payload.addProperty("rangeBinding", request.rangeBinding);
        payload.addProperty("generation", request.generation);
        payload.addProperty("state", state);
        return payload;
    }

    static JsonObject errorPayload(Request request, String code) {
        JsonObject payload = new JsonObject();
        payload.addProperty("rangeBinding", request.rangeBinding);
        payload.addProperty("generation", request.generation);
        payload.addProperty("code", code);
        return payload;
    }

    static String buildModelPrompt(Request request) throws ProtocolException {
        JsonArray allowedMessages = requiredArray(request.payload, "allowedMessageCodes");
        JsonArray requiredMessages = requiredArray(request.payload, "requiredMessageCodes");
        JsonArray allowedNextSteps = requiredArray(request.payload, "allowedNextStepCodes");
        JsonArray requiredNextSteps = requiredArray(request.payload, "requiredNextStepCodes");

        JsonObject reasons = requiredObject(request.payload, "reasons");
        JsonObject input = new JsonObject();
        input.add("status", requiredObject(request.payload, "status").deepCopy());
        input.add(
            "advisorReasonCodes",
            requiredArray(reasons, "advisor").deepCopy()
        );
        input.add(
            "mechanicalReasonCodes",
            requiredArray(reasons, "mechanical").deepCopy()
        );
        input.add(
            "focusMessageCodes",
            selectorChoices(
                allowedMessages,
                requiredMessages,
                12,
                "SCOPE_SELECTED_RANGE"
            )
        );
        input.add(
            "focusNextStepCodes",
            selectorChoices(
                allowedNextSteps,
                requiredNextSteps,
                7,
                "VIEW_CITED_EVIDENCE"
            )
        );

        return "Prioritize this validated selected-range result. Return one minified JSON "
            + "object with exactly two keys and no markdown or prose: "
            + "{\"focusMessageCode\":string,\"focusNextStepCode\":string}. "
            + "Copy focusMessageCode exactly from focusMessageCodes and focusNextStepCode "
            + "exactly from focusNextStepCodes. Do not output evidence, reasons, measurements, "
            + "settings, cards, arrays, or extra keys.\nINPUT=" + input;
    }

    static JsonObject validateModelResult(Request request, String raw)
        throws ProtocolException {
        if (raw == null || raw.length() > MAX_MODEL_RESPONSE_CHARS) {
            throw invalid("Model response exceeded its bound");
        }
        JsonObject model;
        try {
            JsonElement parsed = JsonParser.parseString(raw.trim());
            if (!parsed.isJsonObject()) throw invalid("Model response must be an object");
            model = parsed.getAsJsonObject();
        } catch (RuntimeException error) {
            throw invalid("Model response was not valid JSON");
        }
        requireExactKeys(model, MODEL_SELECTOR_KEYS, "model selector");

        Set<String> allowedMessages = stringSet(
            requiredArray(request.payload, "allowedMessageCodes"),
            64
        );
        Set<String> allowedNextSteps = stringSet(
            requiredArray(request.payload, "allowedNextStepCodes"),
            64
        );
        Set<String> requiredMessages = stringSet(
            requiredArray(request.payload, "requiredMessageCodes"),
            64
        );
        Set<String> requiredNextSteps = stringSet(
            requiredArray(request.payload, "requiredNextStepCodes"),
            64
        );
        if (!allowedMessages.containsAll(requiredMessages)
            || !allowedNextSteps.containsAll(requiredNextSteps)) {
            throw invalid("Required codes were not allowed by the envelope");
        }

        Set<String> focusMessageChoices = stringSetFromResult(selectorChoices(
            requiredArray(request.payload, "allowedMessageCodes"),
            requiredArray(request.payload, "requiredMessageCodes"),
            12,
            "SCOPE_SELECTED_RANGE"
        ));
        Set<String> focusNextStepChoices = stringSetFromResult(selectorChoices(
            requiredArray(request.payload, "allowedNextStepCodes"),
            requiredArray(request.payload, "requiredNextStepCodes"),
            7,
            "VIEW_CITED_EVIDENCE"
        ));
        String focusMessage = safeCode(requiredString(model, "focusMessageCode", 80));
        String focusNextStep = safeCode(requiredString(model, "focusNextStepCode", 80));
        if (!focusMessageChoices.contains(focusMessage)
            || !focusNextStepChoices.contains(focusNextStep)) {
            throw invalid("Model selector chose an unavailable code");
        }

        LinkedHashSet<String> orderedMessages = new LinkedHashSet<>();
        orderedMessages.add(focusMessage);
        orderedMessages.addAll(requiredMessages);
        if (orderedMessages.size() > 12) {
            throw invalid("Model selector exceeded the card limit");
        }
        JsonArray safeCards = new JsonArray();
        for (String messageCode : orderedMessages) {
            safeCards.add(deterministicCard(request.payload, messageCode));
        }

        LinkedHashSet<String> orderedNextSteps = new LinkedHashSet<>();
        orderedNextSteps.add(focusNextStep);
        orderedNextSteps.addAll(requiredNextSteps);
        if (orderedNextSteps.size() > 7) {
            throw invalid("Model selector exceeded the next-step limit");
        }
        JsonArray safeNextSteps = new JsonArray();
        for (String nextStep : orderedNextSteps) safeNextSteps.add(nextStep);

        boolean hasProposalCard = orderedMessages.contains("PROPOSAL_READY");
        String proposalRef = null;
        if (hasProposalCard) {
            if (!proposalIsAvailable(request.payload)) {
                throw invalid("Proposal card was not authorized by validated evidence");
            }
            proposalRef = "validated-governor-f-next-test";
        }

        JsonObject safe = new JsonObject();
        safe.addProperty("schemaVersion", VERSION);
        safe.addProperty("requestId", request.requestId);
        safe.addProperty("rangeBinding", request.rangeBinding);
        safe.addProperty("generation", request.generation);
        safe.add("cards", safeCards);
        safe.add("proposalRef", proposalRef == null ? JsonNull.INSTANCE : new JsonPrimitive(proposalRef));
        safe.add("nextStepCodes", safeNextSteps);
        safe.add("limitationCodes", REQUIRED_LIMITATIONS.deepCopy());
        return safe;
    }

    private static JsonArray selectorChoices(
        JsonArray allowed,
        JsonArray required,
        int finalLimit,
        String baselineCode
    ) throws ProtocolException {
        Set<String> allowedCodes = stringSet(allowed, 64);
        Set<String> requiredCodes = stringSet(required, 64);
        if (!allowedCodes.containsAll(requiredCodes) || requiredCodes.isEmpty()) {
            throw invalid("Selector choices were inconsistent");
        }
        boolean hasRequiredFocus = requiredCodes.stream().anyMatch(
            code -> !baselineCode.equals(code)
        );
        Set<String> source = hasRequiredFocus || requiredCodes.size() >= finalLimit
            ? requiredCodes
            : allowedCodes;
        JsonArray choices = new JsonArray();
        for (String code : source) {
            if (!baselineCode.equals(code)) choices.add(code);
        }
        if (choices.size() == 0 && source.contains(baselineCode)) choices.add(baselineCode);
        if (choices.size() == 0) throw invalid("Selector choices were empty");
        return choices;
    }

    private static JsonObject deterministicCard(JsonObject payload, String messageCode)
        throws ProtocolException {
        JsonObject card = new JsonObject();
        card.addProperty("messageCode", messageCode);
        JsonArray evidenceRefs = new JsonArray();
        if (messageCode.startsWith("MECHANICAL_ATTENTION_")) {
            evidenceRefs.add(mechanicalAttentionReference(payload, messageCode));
        } else if ("PROPOSAL_READY".equals(messageCode)) {
            JsonElement proposalElement = payload.get("validatedProposal");
            if (proposalElement == null || !proposalElement.isJsonObject()) {
                throw invalid("Validated proposal evidence was unavailable");
            }
            JsonArray proposalEvidence = requiredArray(
                proposalElement.getAsJsonObject(),
                "evidenceRefs"
            );
            if (proposalEvidence.size() == 0) {
                throw invalid("Validated proposal evidence was empty");
            }
            evidenceRefs = proposalEvidence.deepCopy();
        }
        card.add("evidenceRefs", evidenceRefs);
        card.add("reasonRefs", new JsonArray());
        return card;
    }

    private static String mechanicalAttentionReference(JsonObject payload, String messageCode)
        throws ProtocolException {
        JsonArray peaks = requiredArray(requiredObject(payload, "mechanical"), "peaks");
        for (JsonElement element : peaks) {
            JsonObject peak = element.getAsJsonObject();
            if (!peak.get("attentionEligible").getAsBoolean()) continue;
            JsonElement harmonic = peak.get("harmonicMatch");
            boolean matched = harmonic != null && harmonic.isJsonObject();
            boolean qualifies;
            if ("MECHANICAL_ATTENTION_MAIN".equals(messageCode)) {
                qualifies = matched && "main".equals(
                    harmonic.getAsJsonObject().get("rotor").getAsString()
                );
            } else if ("MECHANICAL_ATTENTION_TAIL".equals(messageCode)) {
                qualifies = matched && "tail".equals(
                    harmonic.getAsJsonObject().get("rotor").getAsString()
                );
            } else if ("MECHANICAL_ATTENTION_UNMATCHED".equals(messageCode)) {
                qualifies = !matched;
            } else {
                throw invalid("Mechanical attention code was invalid");
            }
            if (qualifies) return peak.get("ref").getAsString();
        }
        throw invalid("Mechanical attention card lacked qualifying evidence");
    }

    private static void validateContextPayload(JsonObject payload, boolean cancel)
        throws ProtocolException {
        Set<String> allowed = cancel
            ? setOf("rangeBinding", "generation", "operation")
            : setOf("rangeBinding", "generation", "selection");
        requireExactKeys(payload, allowed, "context payload");
        if (!cancel) {
            validateSelection(requiredObject(payload, "selection"));
        } else {
            String operation = requiredString(payload, "operation", 16);
            if (!"status".equals(operation)
                && !"download".equals(operation)
                && !"explain".equals(operation)) {
                throw invalid("Cancel operation was invalid");
            }
        }
    }

    private static void validateSelection(JsonObject selection) throws ProtocolException {
        requireExactKeys(selection, setOf("startTimeUs", "endTimeUs"), "selection");
        long start = requiredLong(selection, "startTimeUs");
        long end = requiredLong(selection, "endTimeUs");
        if (start < 0L || end <= start || end > MAX_SAFE_INTEGER) {
            throw invalid("Selected range was invalid");
        }
    }

    private static void validateExplainSelection(JsonObject selection)
        throws ProtocolException {
        requireExactKeys(
            selection,
            setOf("startTimeUs", "endTimeUs", "startOffsetUs", "endOffsetUs", "durationUs"),
            "selection"
        );
        long startTime = requiredLong(selection, "startTimeUs");
        long endTime = requiredLong(selection, "endTimeUs");
        long startOffset = requiredLong(selection, "startOffsetUs");
        long endOffset = requiredLong(selection, "endOffsetUs");
        long duration = requiredLong(selection, "durationUs");
        if (startTime < 0L
            || endTime <= startTime
            || startOffset < 0L
            || endOffset <= startOffset
            || endTime > MAX_SAFE_INTEGER
            || endOffset > MAX_SAFE_INTEGER
            || duration > MAX_SAFE_INTEGER
            || duration != endTime - startTime
            || duration != endOffset - startOffset) {
            throw invalid("Selected range was invalid");
        }
    }

    private static void validateExplainEnvelope(JsonObject envelope)
        throws ProtocolException {
        JsonObject status = requiredObject(envelope, "status");
        requireExactKeys(
            status,
            setOf("overall", "quality", "tracking", "battery", "governor", "mechanical"),
            "advisor status"
        );
        requiredEnum(status, "overall", setOf("supported", "limited", "blocked"));
        requiredEnum(status, "quality", setOf("pass", "caution", "blocked"));
        requiredEnum(status, "tracking", setOf("available", "limited", "unsupported"));
        requiredEnum(status, "battery", setOf("available", "limited", "warning", "unsupported"));
        requiredEnum(status, "governor", setOf("available", "limited", "unsupported"));
        String statusMechanical = requiredEnum(
            status,
            "mechanical",
            setOf("clear", "attention", "insufficient", "unavailable")
        );

        Set<String> factIds = validateFacts(requiredArray(envelope, "facts"));

        JsonObject reasons = requiredObject(envelope, "reasons");
        requireExactKeys(reasons, setOf("advisor", "mechanical"), "reason lists");
        validateKnownCodeArray(
            requiredArray(reasons, "advisor"),
            KNOWN_ADVISOR_REASONS,
            96,
            "advisor reasons"
        );
        validateKnownCodeArray(
            requiredArray(reasons, "mechanical"),
            KNOWN_MECHANICAL_REASONS,
            16,
            "mechanical reasons"
        );

        validateKnownReferenceArray(
            requiredArray(envelope, "findingIds"),
            KNOWN_FINDING_IDS,
            40,
            "finding ids",
            false
        );
        JsonObject mechanical = requiredObject(envelope, "mechanical");
        validateMechanical(mechanical);
        if (!statusMechanical.equals(requiredString(mechanical, "status", 16))) {
            throw invalid("Mechanical status did not match the advisor status");
        }
        validateProposal(envelope.get("validatedProposal"), factIds);

        Set<String> allowedMessages = validateKnownCodeArray(
            requiredArray(envelope, "allowedMessageCodes"),
            KNOWN_MESSAGE_CODES,
            KNOWN_MESSAGE_CODES.size(),
            "allowed message codes"
        );
        Set<String> allowedNextSteps = validateKnownCodeArray(
            requiredArray(envelope, "allowedNextStepCodes"),
            KNOWN_NEXT_STEP_CODES,
            7,
            "allowed next-step codes"
        );
        Set<String> requiredMessages = validateKnownCodeArray(
            requiredArray(envelope, "requiredMessageCodes"),
            KNOWN_MESSAGE_CODES,
            12,
            "required message codes"
        );
        Set<String> requiredNextSteps = validateKnownCodeArray(
            requiredArray(envelope, "requiredNextStepCodes"),
            KNOWN_NEXT_STEP_CODES,
            7,
            "required next-step codes"
        );
        if (!requiredMessages.contains("SCOPE_SELECTED_RANGE")
            || !allowedMessages.containsAll(requiredMessages)
            || !allowedNextSteps.containsAll(requiredNextSteps)) {
            throw invalid("Required coach codes were inconsistent with allowed codes");
        }
    }

    private static Set<String> validateFacts(JsonArray facts) throws ProtocolException {
        if (facts.size() > 64) throw invalid("Fact list was too large");
        Set<String> ids = new LinkedHashSet<>();
        for (JsonElement element : facts) {
            if (!element.isJsonObject()) throw invalid("Fact must be an object");
            JsonObject fact = element.getAsJsonObject();
            requireExactKeys(fact, setOf("id", "value", "unit", "scope"), "fact");
            String id = safeReference(requiredString(fact, "id", 96));
            FactSpec spec = FACT_REGISTRY.get(id);
            if (spec == null || !ids.add(id)) {
                throw invalid("Fact id was unknown or duplicated");
            }
            if (!spec.unit.equals(requiredString(fact, "unit", 32))
                || !"selected-range".equals(requiredString(fact, "scope", 32))) {
                throw invalid("Fact metadata did not match the native registry");
            }

            JsonElement value = fact.get("value");
            if (value == null || !value.isJsonPrimitive()) {
                throw invalid("Fact value was invalid");
            }
            JsonPrimitive primitive = value.getAsJsonPrimitive();
            if (spec.booleanValue) {
                if (!primitive.isBoolean()) throw invalid("Boolean fact was invalid");
            } else {
                double number = requiredFiniteNumber(
                    fact,
                    "value",
                    spec.minimum,
                    spec.maximum
                );
                if (spec.integerValue
                    && (!JSON_INTEGER.matcher(primitive.getAsString()).matches()
                        || number != Math.rint(number))) {
                    throw invalid("Count fact was not an integer");
                }
            }
        }
        return ids;
    }

    private static void validateMechanical(JsonObject mechanical)
        throws ProtocolException {
        requireExactKeys(mechanical, setOf("status", "peaks"), "mechanical evidence");
        String mechanicalStatus = requiredEnum(
            mechanical,
            "status",
            setOf("clear", "attention", "insufficient", "unavailable")
        );
        JsonArray peaks = requiredArray(mechanical, "peaks");
        if (peaks.size() > 15
            || (("insufficient".equals(mechanicalStatus)
                || "unavailable".equals(mechanicalStatus)) && peaks.size() != 0)) {
            throw invalid("Mechanical peak list was inconsistent with status");
        }

        Set<String> references = new LinkedHashSet<>();
        boolean attentionPeak = false;
        for (JsonElement element : peaks) {
            if (!element.isJsonObject()) throw invalid("Mechanical peak must be an object");
            JsonObject peak = element.getAsJsonObject();
            requireExactKeys(
                peak,
                setOf(
                    "ref",
                    "axis",
                    "source",
                    "frequencyHz",
                    "bandRmsDps",
                    "prominenceDb",
                    "persistenceRatio",
                    "attentionEligible",
                    "harmonicMatch"
                ),
                "mechanical peak"
            );
            String axis = requiredEnum(peak, "axis", setOf("roll", "pitch", "yaw"));
            String reference = safeReference(requiredString(peak, "ref", 96));
            if (!reference.matches("mechanical\\." + axis + "\\.peak\\.[1-5]")
                || !references.add(reference)) {
                throw invalid("Mechanical peak reference was invalid or duplicated");
            }
            requiredEnum(
                peak,
                "source",
                setOf("gyroRAW", "gyroUnfilt", "gyroADC-filtered")
            );
            requiredFiniteNumber(peak, "frequencyHz", 5.0, 1_000.0);
            requiredFiniteNumber(peak, "bandRmsDps", 0.0, 100_000.0);
            requiredFiniteNumber(peak, "prominenceDb", 8.0, 1_000.0);
            requiredFiniteNumber(peak, "persistenceRatio", 0.25, 1.0);
            JsonElement attention = peak.get("attentionEligible");
            if (attention == null
                || !attention.isJsonPrimitive()
                || !attention.getAsJsonPrimitive().isBoolean()) {
                throw invalid("Mechanical attention flag was invalid");
            }
            attentionPeak |= attention.getAsBoolean();
            validateHarmonicMatch(peak.get("harmonicMatch"));
        }
        if (("attention".equals(mechanicalStatus) && !attentionPeak)
            || ("clear".equals(mechanicalStatus) && attentionPeak)) {
            throw invalid("Mechanical attention status was inconsistent with peaks");
        }
    }

    private static void validateHarmonicMatch(JsonElement element)
        throws ProtocolException {
        if (element == null || element.isJsonNull()) return;
        if (!element.isJsonObject()) throw invalid("Harmonic match was invalid");
        JsonObject match = element.getAsJsonObject();
        requireExactKeys(
            match,
            setOf("rotor", "order", "predictedHz", "deltaHz", "toleranceHz"),
            "harmonic match"
        );
        String rotor = requiredEnum(match, "rotor", setOf("main", "tail"));
        int order = requiredInt(match, "order");
        if (order < 1 || order > ("main".equals(rotor) ? 8 : 6)) {
            throw invalid("Harmonic order was invalid");
        }
        requiredFiniteNumber(match, "predictedHz", 0.0, 10_000.0);
        double delta = requiredFiniteNumber(match, "deltaHz", 0.0, 10_000.0);
        double tolerance = requiredFiniteNumber(match, "toleranceHz", 0.001, 10_000.0);
        if (delta > tolerance) throw invalid("Harmonic match exceeded tolerance");
    }

    private static void validateProposal(JsonElement element, Set<String> factIds)
        throws ProtocolException {
        if (element == null || element.isJsonNull()) return;
        if (!element.isJsonObject()) throw invalid("Validated proposal was invalid");
        JsonObject proposal = element.getAsJsonObject();
        requireExactKeys(
            proposal,
            setOf("ref", "reasonCode", "evidenceRefs"),
            "validated proposal"
        );
        if (!"validated-governor-f-next-test".equals(
            requiredString(proposal, "ref", 64)
        )) {
            throw invalid("Validated proposal reference was invalid");
        }
        String reason = requiredString(proposal, "reasonCode", 80);
        if (!"CONSISTENT_DROOP".equals(reason) && !"CONSISTENT_OVERSHOOT".equals(reason)) {
            throw invalid("Validated proposal reason was invalid");
        }
        validateKnownReferenceArray(
            requiredArray(proposal, "evidenceRefs"),
            factIds,
            8,
            "proposal evidence",
            true
        );
    }

    private static Set<String> validateKnownCodeArray(
        JsonArray values,
        Set<String> registry,
        int maximum,
        String label
    ) throws ProtocolException {
        if (values.size() > maximum) throw invalid(label + " was too large");
        Set<String> result = new LinkedHashSet<>();
        for (JsonElement element : values) {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw invalid(label + " contained a non-string value");
            }
            String value = safeCode(element.getAsString());
            if (!registry.contains(value) || !result.add(value)) {
                throw invalid(label + " contained an unknown or duplicate code");
            }
        }
        return result;
    }

    private static Set<String> validateKnownReferenceArray(
        JsonArray values,
        Set<String> registry,
        int maximum,
        String label,
        boolean requireNonEmpty
    ) throws ProtocolException {
        if (values.size() > maximum || (requireNonEmpty && values.size() == 0)) {
            throw invalid(label + " had an invalid size");
        }
        Set<String> result = new LinkedHashSet<>();
        for (JsonElement element : values) {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw invalid(label + " contained a non-string value");
            }
            String value = safeReference(element.getAsString());
            if (!registry.contains(value) || !result.add(value)) {
                throw invalid(label + " contained an unknown or duplicate reference");
            }
        }
        return result;
    }

    private static String requiredEnum(
        JsonObject object,
        String key,
        Set<String> values
    ) throws ProtocolException {
        String value = requiredString(object, key, 64);
        if (!values.contains(value)) throw invalid(key + " was not an allowed value");
        return value;
    }

    private static double requiredFiniteNumber(
        JsonObject object,
        String key,
        double minimum,
        double maximum
    ) throws ProtocolException {
        JsonElement element = object.get(key);
        if (element == null
            || !element.isJsonPrimitive()
            || !element.getAsJsonPrimitive().isNumber()) {
            throw invalid(key + " must be a number");
        }
        double value;
        try {
            value = element.getAsDouble();
        } catch (NumberFormatException error) {
            throw invalid(key + " must be a number");
        }
        if (!Double.isFinite(value) || value < minimum || value > maximum) {
            throw invalid(key + " was outside its allowed numeric range");
        }
        return value;
    }

    private static void validateBoundedEnvelope(JsonElement element, int depth)
        throws ProtocolException {
        if (depth > 8) throw invalid("Explain envelope was too deeply nested");
        if (element == null || element.isJsonNull()) return;
        if (element.isJsonArray()) {
            JsonArray values = element.getAsJsonArray();
            if (values.size() > 128) throw invalid("Explain envelope array was too large");
            for (JsonElement value : values) validateBoundedEnvelope(value, depth + 1);
            return;
        }
        if (element.isJsonObject()) {
            JsonObject object = element.getAsJsonObject();
            if (object.size() > 64) throw invalid("Explain envelope object was too large");
            for (String key : object.keySet()) {
                if (!SAFE_IDENTIFIER.matcher(key).matches()
                    || FORBIDDEN_ENVELOPE_KEYS.contains(key)) {
                    throw invalid("Explain envelope contained a forbidden field");
                }
                validateBoundedEnvelope(object.get(key), depth + 1);
            }
            return;
        }
        JsonPrimitive primitive = element.getAsJsonPrimitive();
        if (primitive.isString()
            && primitive.getAsString().getBytes(StandardCharsets.UTF_8).length > 512) {
            throw invalid("Explain envelope string was too large");
        }
    }

    private static Set<String> collectEvidenceIds(JsonObject envelope)
        throws ProtocolException {
        Set<String> ids = new LinkedHashSet<>();
        JsonArray facts = requiredArray(envelope, "facts");
        for (JsonElement element : facts) {
            if (!element.isJsonObject()) throw invalid("Fact must be an object");
            JsonObject fact = element.getAsJsonObject();
            ids.add(safeReference(requiredString(fact, "id", 96)));
        }
        JsonObject mechanical = requiredObject(envelope, "mechanical");
        JsonElement peaksElement = mechanical.get("peaks");
        if (peaksElement != null && peaksElement.isJsonArray()) {
            for (JsonElement element : peaksElement.getAsJsonArray()) {
                if (!element.isJsonObject()) throw invalid("Mechanical peak must be an object");
                ids.add(safeReference(requiredString(element.getAsJsonObject(), "ref", 96)));
            }
        }
        return ids;
    }

    private static Set<String> collectReasonCodes(JsonObject envelope)
        throws ProtocolException {
        Set<String> codes = new LinkedHashSet<>();
        JsonObject reasons = requiredObject(envelope, "reasons");
        collectReasonArray(reasons.get("advisor"), codes);
        collectReasonArray(reasons.get("mechanical"), codes);
        return codes;
    }

    private static Set<String> collectProposalEvidenceIds(JsonObject envelope)
        throws ProtocolException {
        JsonElement proposal = envelope.get("validatedProposal");
        if (proposal == null || proposal.isJsonNull()) return Collections.emptySet();
        JsonArray references = requiredArray(proposal.getAsJsonObject(), "evidenceRefs");
        Set<String> values = new LinkedHashSet<>();
        for (JsonElement element : references) {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw invalid("Validated proposal evidence was invalid");
            }
            values.add(safeReference(element.getAsString()));
        }
        return values;
    }

    private static void collectReasonArray(JsonElement element, Set<String> output)
        throws ProtocolException {
        if (element == null || !element.isJsonArray()) {
            throw invalid("Reason list was invalid");
        }
        for (JsonElement value : element.getAsJsonArray()) {
            String code;
            if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()) {
                code = value.getAsString();
            } else if (value.isJsonObject()) {
                code = requiredString(value.getAsJsonObject(), "code", 128);
            } else {
                throw invalid("Reason code was invalid");
            }
            output.add(safeCode(code));
        }
    }

    private static boolean proposalIsAvailable(JsonObject envelope) {
        JsonElement proposalElement = envelope.get("validatedProposal");
        if (proposalElement == null || !proposalElement.isJsonObject()) return false;
        JsonObject proposal = proposalElement.getAsJsonObject();
        JsonElement reference = proposal.get("ref");
        JsonObject mechanical = envelope.getAsJsonObject("mechanical");
        JsonElement mechanicalStatus = mechanical == null ? null : mechanical.get("status");
        return reference != null
            && reference.isJsonPrimitive()
            && "validated-governor-f-next-test".equals(reference.getAsString())
            && mechanicalStatus != null
            && mechanicalStatus.isJsonPrimitive()
            && "clear".equals(mechanicalStatus.getAsString());
    }

    private static JsonArray validatedRefs(JsonArray input, Set<String> allowed, int max)
        throws ProtocolException {
        if (input.size() > max) throw invalid("Reference list was too large");
        Set<String> seen = new LinkedHashSet<>();
        JsonArray result = new JsonArray();
        for (JsonElement element : input) {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw invalid("Reference must be a string");
            }
            String value = safeReference(element.getAsString());
            if (!allowed.contains(value) || !seen.add(value)) {
                throw invalid("Reference was unknown or duplicated");
            }
            result.add(value);
        }
        return result;
    }

    private static JsonArray validatedCodes(JsonArray input, Set<String> allowed, int max)
        throws ProtocolException {
        if (input.size() > max) throw invalid("Code list was too large");
        Set<String> seen = new LinkedHashSet<>();
        JsonArray result = new JsonArray();
        for (JsonElement element : input) {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw invalid("Code must be a string");
            }
            String value = safeCode(element.getAsString());
            if (!allowed.contains(value) || !seen.add(value)) {
                throw invalid("Code was unknown or duplicated");
            }
            result.add(value);
        }
        return result;
    }

    private static Set<String> stringSet(JsonArray input, int max)
        throws ProtocolException {
        if (input.size() > max) throw invalid("Allowed-code list was too large");
        Set<String> values = new LinkedHashSet<>();
        for (JsonElement element : input) {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
                throw invalid("Allowed code must be a string");
            }
            String value = safeCode(element.getAsString());
            if (!values.add(value)) throw invalid("Allowed code was duplicated");
        }
        return values;
    }

    private static Set<String> stringSetFromResult(JsonArray input) {
        Set<String> values = new LinkedHashSet<>();
        for (JsonElement element : input) values.add(element.getAsString());
        return values;
    }

    private static JsonObject requiredObject(JsonObject object, String key)
        throws ProtocolException {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonObject()) throw invalid(key + " must be an object");
        return value.getAsJsonObject();
    }

    private static JsonArray requiredArray(JsonObject object, String key)
        throws ProtocolException {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonArray()) throw invalid(key + " must be an array");
        return value.getAsJsonArray();
    }

    private static String requiredString(JsonObject object, String key, int maxLength)
        throws ProtocolException {
        JsonElement value = object.get(key);
        if (value == null
            || !value.isJsonPrimitive()
            || !value.getAsJsonPrimitive().isString()) {
            throw invalid(key + " must be a string");
        }
        String text = value.getAsString();
        if (text.isEmpty() || text.length() > maxLength) {
            throw invalid(key + " had an invalid length");
        }
        return text;
    }

    private static int requiredInt(JsonObject object, String key) throws ProtocolException {
        long value = requiredLong(object, key);
        if (value < Integer.MIN_VALUE || value > Integer.MAX_VALUE) {
            throw invalid(key + " was outside the integer range");
        }
        return (int) value;
    }

    private static long requiredLong(JsonObject object, String key) throws ProtocolException {
        JsonElement value = object.get(key);
        if (value == null
            || !value.isJsonPrimitive()
            || !value.getAsJsonPrimitive().isNumber()) {
            throw invalid(key + " must be an integer");
        }
        try {
            if (!JSON_INTEGER.matcher(value.getAsJsonPrimitive().getAsString()).matches()) {
                throw invalid(key + " must be an integer");
            }
            return value.getAsLong();
        } catch (NumberFormatException error) {
            throw invalid(key + " must be an integer");
        }
    }

    private static String safeIdentifier(String value) throws ProtocolException {
        if (!SAFE_IDENTIFIER.matcher(value).matches()) {
            throw invalid("Identifier contained unsupported characters");
        }
        return value;
    }

    private static String safeBinding(String value) throws ProtocolException {
        if (!SAFE_BINDING.matcher(value).matches()) {
            throw invalid("Binding contained unsupported characters");
        }
        return value;
    }

    private static String safeCode(String value) throws ProtocolException {
        if (!SAFE_CODE.matcher(value).matches()) {
            throw invalid("Code contained unsupported characters");
        }
        return value;
    }

    private static String safeReference(String value) throws ProtocolException {
        if (!SAFE_REFERENCE.matcher(value).matches()) {
            throw invalid("Reference contained unsupported characters");
        }
        return value;
    }

    private static void requireExactKeys(JsonObject object, Set<String> expected, String label)
        throws ProtocolException {
        if (!object.keySet().equals(expected)) {
            throw invalid(label + " keys did not match the contract");
        }
    }

    private static ProtocolException invalid(String message) {
        return new ProtocolException(ERROR_REQUEST_INVALID, message);
    }

    private static Set<String> setOf(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }

    private static Map<String, FactSpec> factRegistry() {
        Map<String, FactSpec> values = new HashMap<>();
        addNumberFact(values, "quality.duration", "seconds", 0.0, 86_400.0, false);
        addNumberFact(values, "quality.sample-rate", "hertz", 0.0, 100_000.0, false);
        addNumberFact(
            values,
            "quality.effective-sample-rate",
            "hertz",
            0.0,
            100_000.0,
            false
        );
        addNumberFact(
            values,
            "quality.p99-frame-interval",
            "microseconds",
            0.0,
            1_000_000_000.0,
            false
        );
        addNumberFact(
            values,
            "quality.powered-duration",
            "seconds",
            0.0,
            86_400.0,
            false
        );
        addNumberFact(
            values,
            "quality.corrupt-frames",
            "frames",
            0.0,
            1_000_000_000.0,
            true
        );
        addNumberFact(
            values,
            "quality.discontinuities",
            "events",
            0.0,
            1_000_000_000.0,
            true
        );
        addNumberFact(
            values,
            "safety.rx-health",
            "samples",
            0.0,
            1_000_000_000.0,
            true
        );
        addNumberFact(
            values,
            "tracking.roll.rmse",
            "degrees-per-second",
            0.0,
            100_000.0,
            false
        );
        addNumberFact(
            values,
            "tracking.roll.p95",
            "degrees-per-second",
            0.0,
            100_000.0,
            false
        );
        addNumberFact(
            values,
            "tracking.pitch.rmse",
            "degrees-per-second",
            0.0,
            100_000.0,
            false
        );
        addNumberFact(
            values,
            "tracking.pitch.p95",
            "degrees-per-second",
            0.0,
            100_000.0,
            false
        );
        addNumberFact(
            values,
            "tracking.yaw.rmse",
            "degrees-per-second",
            0.0,
            100_000.0,
            false
        );
        addNumberFact(
            values,
            "tracking.yaw.p95",
            "degrees-per-second",
            0.0,
            100_000.0,
            false
        );
        addNumberFact(
            values,
            "battery.minimum-voltage",
            "volts",
            0.0,
            1_000.0,
            false
        );
        addNumberFact(
            values,
            "battery.minimum-cell-voltage",
            "volts-per-cell",
            0.0,
            100.0,
            false
        );
        addNumberFact(values, "governor.target-rpm", "rpm", 0.0, 1_000_000.0, false);
        addNumberFact(values, "governor.rmse", "rpm", 0.0, 1_000_000.0, false);
        addNumberFact(
            values,
            "governor.maximum-droop",
            "rpm",
            0.0,
            1_000_000.0,
            false
        );
        addNumberFact(
            values,
            "governor.maximum-overshoot",
            "rpm",
            0.0,
            1_000_000.0,
            false
        );
        addNumberFact(
            values,
            "governor.motor-p95",
            "percent",
            0.0,
            100.0,
            false
        );
        addBooleanFact(values, "governor.active-event-in-selection");
        addBooleanFact(values, "governor.full-rate-records");
        addNumberFact(
            values,
            "governor.pitch-pump-consistency.candidates",
            "count",
            0.0,
            1_000.0,
            true
        );
        addNumberFact(
            values,
            "governor.pitch-pump-consistency.eligible",
            "count",
            0.0,
            1_000.0,
            true
        );
        addNumberFact(
            values,
            "governor.pitch-pump-consistency.droop",
            "count",
            0.0,
            1_000.0,
            true
        );
        addNumberFact(
            values,
            "governor.pitch-pump-consistency.overshoot",
            "count",
            0.0,
            1_000.0,
            true
        );
        addBooleanFact(values, "governor.pitch-pump-consistency.sufficient");
        return Collections.unmodifiableMap(values);
    }

    private static void addNumberFact(
        Map<String, FactSpec> values,
        String id,
        String unit,
        double minimum,
        double maximum,
        boolean integer
    ) {
        values.put(id, new FactSpec(unit, false, integer, minimum, maximum));
    }

    private static void addBooleanFact(Map<String, FactSpec> values, String id) {
        values.put(id, new FactSpec("boolean", true, false, 0.0, 0.0));
    }

    private static JsonArray limitations() {
        JsonArray values = new JsonArray();
        values.add("SELECTED_RANGE_ONLY");
        values.add("EXPLANATION_ONLY");
        values.add("NOT_DIAGNOSIS");
        values.add("NO_SETTING_WRITE");
        values.add("NO_FLIGHTWORTHINESS_CLAIM");
        return values;
    }
}
