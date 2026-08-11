package io.github.mbwallace1390.rotorlens;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

public class AdvisorAiProtocolTest {
    private static final String REQUEST_ID = "request_12345678";
    private static final String RANGE_BINDING = "range_12345678";

    @Test
    public void parsesExactExplainEnvelopeAndBuildsBoundResult() throws Exception {
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(validExplainRequest());

        assertEquals(AdvisorAiProtocol.TYPE_EXPLAIN, request.type);
        assertEquals(REQUEST_ID, request.requestId);
        assertEquals(RANGE_BINDING, request.rangeBinding);
        assertEquals(7, request.generation);

        JsonObject result = AdvisorAiProtocol.validateModelResult(
            request,
            selector("EVIDENCE_SUPPORTED", "VIEW_CITED_EVIDENCE").toString()
        );

        assertEquals(1, result.get("schemaVersion").getAsInt());
        assertEquals(REQUEST_ID, result.get("requestId").getAsString());
        assertEquals(RANGE_BINDING, result.get("rangeBinding").getAsString());
        assertEquals(7, result.get("generation").getAsInt());
        assertEquals(2, result.getAsJsonArray("cards").size());
        assertEquals(
            "EVIDENCE_SUPPORTED",
            result.getAsJsonArray("cards").get(0).getAsJsonObject()
                .get("messageCode").getAsString()
        );
        assertEquals(5, result.getAsJsonArray("limitationCodes").size());
        assertEquals(
            new HashSet<>(Arrays.asList(
                "SELECTED_RANGE_ONLY",
                "EXPLANATION_ONLY",
                "NOT_DIAGNOSIS",
                "NO_SETTING_WRITE",
                "NO_FLIGHTWORTHINESS_CLAIM"
            )),
            stringSet(result.getAsJsonArray("limitationCodes"))
        );
    }

    @Test
    public void synthesizesCompleteTenCardResponseFromTwoFieldSelector() throws Exception {
        JsonObject outer = tenCardExplainRequest();
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(outer.toString());
        JsonObject result = AdvisorAiProtocol.validateModelResult(
            request,
            selector(
                "MECHANICAL_ATTENTION_TAIL",
                "INSPECT_MECHANICS_FIRST"
            ).toString()
        );

        assertEquals(10, result.getAsJsonArray("cards").size());
        assertEquals(2, result.getAsJsonArray("nextStepCodes").size());
        assertEquals(
            "MECHANICAL_ATTENTION_TAIL",
            result.getAsJsonArray("cards").get(0).getAsJsonObject()
                .get("messageCode").getAsString()
        );
        assertEquals(
            "mechanical.pitch.peak.1",
            result.getAsJsonArray("cards").get(0).getAsJsonObject()
                .getAsJsonArray("evidenceRefs").get(0).getAsString()
        );
        assertEquals(
            "INSPECT_MECHANICS_FIRST",
            result.getAsJsonArray("nextStepCodes").get(0).getAsString()
        );
    }

    @Test
    public void rejectsModelResponseAboveNewGenerationCap() throws Exception {
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(
            tenCardExplainRequest().toString()
        );
        String oversized = selector(
            "MECHANICAL_ATTENTION_MAIN",
            "INSPECT_MECHANICS_FIRST"
        ).toString()
            + " ".repeat(AdvisorAiProtocol.MAX_MODEL_RESPONSE_CHARS);

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.validateModelResult(request, oversized)
        );
    }

    @Test
    public void rejectsUnknownOrExtraModelSelectorFields() throws Exception {
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(validExplainRequest());
        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.validateModelResult(
                request,
                selector("GOVERNOR_AVAILABLE", "VIEW_CITED_EVIDENCE").toString()
            )
        );

        JsonObject extra = selector("SCOPE_SELECTED_RANGE", "VIEW_CITED_EVIDENCE");
        extra.addProperty("reason", "model prose");
        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.validateModelResult(request, extra.toString())
        );
    }

    @Test
    public void promptContainsOnlyCompactStatusesReasonsAndCodeChoices() throws Exception {
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(validExplainRequest());
        String prompt = AdvisorAiProtocol.buildModelPrompt(request);

        assertTrue(prompt.length() < 2_048);
        assertTrue(prompt.contains("focusMessageCodes"));
        assertTrue(prompt.contains("focusNextStepCodes"));
        assertTrue(!prompt.contains("\"facts\""));
        assertTrue(!prompt.contains("\"selection\""));
        assertTrue(!prompt.contains("quality.duration"));
    }

    @Test
    public void selectorMayPrioritizeOneAllowedNonrequiredCard() throws Exception {
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(validExplainRequest());
        JsonObject result = AdvisorAiProtocol.validateModelResult(
            request,
            selector("EVIDENCE_SUPPORTED", "VIEW_CITED_EVIDENCE").toString()
        );

        JsonArray cards = result.getAsJsonArray("cards");
        assertEquals(2, cards.size());
        assertEquals(
            "EVIDENCE_SUPPORTED",
            cards.get(0).getAsJsonObject().get("messageCode").getAsString()
        );
        assertEquals(
            "SCOPE_SELECTED_RANGE",
            cards.get(1).getAsJsonObject().get("messageCode").getAsString()
        );
    }

    @Test
    public void selectorCannotPutOptionalPositiveAheadOfRequiredCaution() throws Exception {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        JsonObject payload = outer.getAsJsonObject("payload");
        payload.getAsJsonArray("allowedMessageCodes").add("EVIDENCE_LIMITED");
        payload.getAsJsonArray("requiredMessageCodes").add("EVIDENCE_LIMITED");
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(outer.toString());

        String prompt = AdvisorAiProtocol.buildModelPrompt(request);
        assertTrue(prompt.contains("\"focusMessageCodes\":[\"EVIDENCE_LIMITED\"]"));
        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.validateModelResult(
                request,
                selector("EVIDENCE_SUPPORTED", "VIEW_CITED_EVIDENCE").toString()
            )
        );
    }

    @Test
    public void rejectsExtraOuterField() {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        outer.addProperty("unexpected", true);

        AdvisorAiProtocol.ProtocolException error = assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outer.toString())
        );

        assertEquals(AdvisorAiProtocol.ERROR_REQUEST_INVALID, error.code);
    }

    @Test
    public void rejectsRequestOverUtf8ByteLimit() {
        String oversized = "{\"padding\":\"" + "é".repeat(20_000) + "\"}";

        AdvisorAiProtocol.ProtocolException error = assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(oversized)
        );

        assertEquals(AdvisorAiProtocol.ERROR_REQUEST_TOO_LARGE, error.code);
    }

    @Test
    public void rejectsFractionalGeneration() {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        outer.getAsJsonObject("payload").addProperty("generation", 7.5);

        AdvisorAiProtocol.ProtocolException error = assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outer.toString())
        );

        assertEquals(AdvisorAiProtocol.ERROR_REQUEST_INVALID, error.code);
    }

    @Test
    public void parsesCanonicalizedObservedMarkerStatusEnvelope() throws Exception {
        JsonObject outer = statusRequest(8_009_841L, 14_105_537L);

        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(outer.toString());

        assertEquals(AdvisorAiProtocol.TYPE_STATUS, request.type);
        JsonObject selection = request.payload.getAsJsonObject("selection");
        assertEquals(8_009_841L, selection.get("startTimeUs").getAsLong());
        assertEquals(14_105_537L, selection.get("endTimeUs").getAsLong());
    }

    @Test
    public void stillRejectsFractionalObservedMarkerStatusEnvelope() {
        JsonObject outer = statusRequest(8_009_841L, 14_105_537L);
        JsonObject selection = outer.getAsJsonObject("payload")
            .getAsJsonObject("selection");
        selection.addProperty("startTimeUs", 8_009_840.6044273665);
        selection.addProperty("endTimeUs", 14_105_537.12570931);

        AdvisorAiProtocol.ProtocolException error = assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outer.toString())
        );

        assertEquals(AdvisorAiProtocol.ERROR_REQUEST_INVALID, error.code);
    }

    @Test
    public void rejectsUnsafeRequestBinding() {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        outer.addProperty("requestId", "../escape");

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outer.toString())
        );
    }

    @Test
    public void rejectsRawSampleFieldInsideEnvelope() {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        JsonObject status = outer.getAsJsonObject("payload").getAsJsonObject("status");
        status.add("samples", new JsonArray());

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outer.toString())
        );
    }

    @Test
    public void rejectsArbitraryNestedSettingsField() {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        JsonObject fact = outer.getAsJsonObject("payload")
            .getAsJsonArray("facts")
            .get(0)
            .getAsJsonObject();
        JsonObject settings = new JsonObject();
        settings.addProperty("gov_f_gain", 120);
        fact.add("settings", settings);

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outer.toString())
        );
    }

    @Test
    public void rejectsUnknownFactAliasAndOutOfRangeFact() {
        JsonObject unknown = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        unknown.getAsJsonObject("payload")
            .getAsJsonArray("facts")
            .get(0)
            .getAsJsonObject()
            .addProperty("id", "settings.gov-f-gain");

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(unknown.toString())
        );

        JsonObject outOfRange = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        outOfRange.getAsJsonObject("payload")
            .getAsJsonArray("facts")
            .get(0)
            .getAsJsonObject()
            .addProperty("value", 86_401.0);

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outOfRange.toString())
        );
    }

    @Test
    public void rejectsUnknownReasonAndAllowedCode() {
        JsonObject unknownReason = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        unknownReason.getAsJsonObject("payload")
            .getAsJsonObject("reasons")
            .getAsJsonArray("advisor")
            .add("SEND_RAW_LOG_TO_MODEL");

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(unknownReason.toString())
        );

        JsonObject unknownMessage = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        unknownMessage.getAsJsonObject("payload")
            .getAsJsonArray("allowedMessageCodes")
            .add("SHOW_ARBITRARY_MODEL_TEXT");

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(unknownMessage.toString())
        );
    }

    @Test
    @SuppressWarnings("unchecked")
    public void acceptsContractMaximumAboveGenericArrayFloor() throws Exception {
        java.lang.reflect.Field registryField = AdvisorAiProtocol.class
            .getDeclaredField("KNOWN_ADVISOR_REASONS");
        registryField.setAccessible(true);
        Set<String> registry = (Set<String>) registryField.get(null);
        assertTrue(registry.size() > 64);

        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        JsonArray reasons = outer.getAsJsonObject("payload")
            .getAsJsonObject("reasons")
            .getAsJsonArray("advisor");
        int count = 0;
        for (String reason : registry) {
            reasons.add(reason);
            count += 1;
            if (count == 65) break;
        }

        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(outer.toString());
        assertEquals(65, request.payload
            .getAsJsonObject("reasons")
            .getAsJsonArray("advisor")
            .size());
    }

    @Test
    public void rejectsExtraFieldInsideMechanicalPeak() {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        JsonObject mechanical = outer.getAsJsonObject("payload").getAsJsonObject("mechanical");
        JsonObject peak = new JsonObject();
        peak.addProperty("ref", "mechanical.roll.peak.1");
        peak.addProperty("axis", "roll");
        peak.addProperty("source", "gyroRAW");
        peak.addProperty("frequencyHz", 120.0);
        peak.addProperty("bandRmsDps", 10.0);
        peak.addProperty("prominenceDb", 9.0);
        peak.addProperty("persistenceRatio", 0.5);
        peak.addProperty("attentionEligible", false);
        peak.add("harmonicMatch", JsonNull.INSTANCE);
        peak.addProperty("fileName", "private-flight-log.bbl");
        mechanical.getAsJsonArray("peaks").add(peak);

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.parse(outer.toString())
        );
    }

    @Test
    public void rejectsProposalFocusWithoutValidatedProposal() throws Exception {
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(validExplainRequest());

        assertThrows(
            AdvisorAiProtocol.ProtocolException.class,
            () -> AdvisorAiProtocol.validateModelResult(
                request,
                selector("PROPOSAL_READY", "VIEW_CITED_EVIDENCE").toString()
            )
        );
    }

    @Test
    public void synthesizesProposalCardFromValidatedEvidenceOnly() throws Exception {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        JsonObject payload = outer.getAsJsonObject("payload");

        JsonObject secondFact = new JsonObject();
        secondFact.addProperty("id", "quality.sample-rate");
        secondFact.addProperty("value", 1_000.0);
        secondFact.addProperty("unit", "hertz");
        secondFact.addProperty("scope", "selected-range");
        payload.getAsJsonArray("facts").add(secondFact);

        JsonObject proposal = new JsonObject();
        proposal.addProperty("ref", "validated-governor-f-next-test");
        proposal.addProperty("reasonCode", "CONSISTENT_DROOP");
        JsonArray proposalEvidence = new JsonArray();
        proposalEvidence.add("quality.duration");
        proposal.add("evidenceRefs", proposalEvidence);
        payload.add("validatedProposal", proposal);
        payload.getAsJsonArray("allowedMessageCodes").add("PROPOSAL_READY");

        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(outer.toString());
        JsonObject result = AdvisorAiProtocol.validateModelResult(
            request,
            selector("PROPOSAL_READY", "VIEW_CITED_EVIDENCE").toString()
        );

        assertEquals(
            "validated-governor-f-next-test",
            result.get("proposalRef").getAsString()
        );
        JsonObject proposalCard = result.getAsJsonArray("cards")
            .get(0).getAsJsonObject();
        assertEquals("PROPOSAL_READY", proposalCard.get("messageCode").getAsString());
        assertEquals(
            "quality.duration",
            proposalCard.getAsJsonArray("evidenceRefs").get(0).getAsString()
        );
        assertEquals(1, proposalCard.getAsJsonArray("evidenceRefs").size());
    }

    @Test
    public void replyHasExactOuterKeys() throws Exception {
        AdvisorAiProtocol.Request request = AdvisorAiProtocol.parse(validExplainRequest());
        JsonObject reply = JsonParser.parseString(AdvisorAiProtocol.reply(
            AdvisorAiProtocol.TYPE_STATUS_RESULT,
            request,
            AdvisorAiProtocol.contextPayload(request, "ready")
        )).getAsJsonObject();

        assertEquals(
            new HashSet<>(Arrays.asList("v", "type", "requestId", "payload")),
            reply.keySet()
        );
        assertEquals(3, reply.getAsJsonObject("payload").size());
    }

    private static String validExplainRequest() {
        JsonObject payload = new JsonObject();
        payload.addProperty("schemaVersion", 1);
        payload.addProperty("requestId", REQUEST_ID);
        payload.addProperty("rangeBinding", RANGE_BINDING);
        payload.addProperty("generation", 7);

        JsonObject selection = new JsonObject();
        selection.addProperty("startTimeUs", 1_000_000L);
        selection.addProperty("endTimeUs", 3_000_000L);
        selection.addProperty("startOffsetUs", 500_000L);
        selection.addProperty("endOffsetUs", 2_500_000L);
        selection.addProperty("durationUs", 2_000_000L);
        payload.add("selection", selection);

        JsonObject status = new JsonObject();
        status.addProperty("overall", "supported");
        status.addProperty("quality", "pass");
        status.addProperty("tracking", "available");
        status.addProperty("battery", "available");
        status.addProperty("governor", "limited");
        status.addProperty("mechanical", "clear");
        payload.add("status", status);

        JsonObject fact = new JsonObject();
        fact.addProperty("id", "quality.duration");
        fact.addProperty("value", 2.0);
        fact.addProperty("unit", "seconds");
        fact.addProperty("scope", "selected-range");
        JsonArray facts = new JsonArray();
        facts.add(fact);
        payload.add("facts", facts);

        JsonObject reasons = new JsonObject();
        reasons.add("advisor", new JsonArray());
        reasons.add("mechanical", new JsonArray());
        payload.add("reasons", reasons);
        payload.add("findingIds", new JsonArray());

        JsonObject mechanical = new JsonObject();
        mechanical.addProperty("status", "clear");
        mechanical.add("peaks", new JsonArray());
        payload.add("mechanical", mechanical);
        payload.add("validatedProposal", JsonNull.INSTANCE);

        JsonArray allowedMessages = new JsonArray();
        allowedMessages.add("SCOPE_SELECTED_RANGE");
        allowedMessages.add("EVIDENCE_SUPPORTED");
        payload.add("allowedMessageCodes", allowedMessages);
        JsonArray allowedNextSteps = new JsonArray();
        allowedNextSteps.add("VIEW_CITED_EVIDENCE");
        payload.add("allowedNextStepCodes", allowedNextSteps);
        JsonArray requiredMessages = new JsonArray();
        requiredMessages.add("SCOPE_SELECTED_RANGE");
        payload.add("requiredMessageCodes", requiredMessages);
        JsonArray requiredNextSteps = new JsonArray();
        requiredNextSteps.add("VIEW_CITED_EVIDENCE");
        payload.add("requiredNextStepCodes", requiredNextSteps);

        JsonObject outer = new JsonObject();
        outer.addProperty("v", 1);
        outer.addProperty("type", AdvisorAiProtocol.TYPE_EXPLAIN);
        outer.addProperty("requestId", REQUEST_ID);
        outer.add("payload", payload);
        return outer.toString();
    }

    private static JsonObject statusRequest(long startTimeUs, long endTimeUs) {
        JsonObject outer = new JsonObject();
        outer.addProperty("v", 1);
        outer.addProperty("type", AdvisorAiProtocol.TYPE_STATUS);
        outer.addProperty("requestId", REQUEST_ID);
        JsonObject payload = new JsonObject();
        payload.addProperty("rangeBinding", RANGE_BINDING);
        payload.addProperty("generation", 7);
        JsonObject selection = new JsonObject();
        selection.addProperty("startTimeUs", startTimeUs);
        selection.addProperty("endTimeUs", endTimeUs);
        payload.add("selection", selection);
        outer.add("payload", payload);
        return outer;
    }

    private static HashSet<String> stringSet(JsonArray values) {
        HashSet<String> result = new HashSet<>();
        values.forEach(value -> result.add(value.getAsString()));
        return result;
    }

    private static JsonObject card(String messageCode, String evidenceRef) {
        JsonObject card = new JsonObject();
        card.addProperty("messageCode", messageCode);
        JsonArray evidence = new JsonArray();
        if (evidenceRef != null) evidence.add(evidenceRef);
        card.add("evidenceRefs", evidence);
        card.add("reasonRefs", new JsonArray());
        return card;
    }

    private static JsonObject selector(String messageCode, String nextStepCode) {
        JsonObject selector = new JsonObject();
        selector.addProperty("focusMessageCode", messageCode);
        selector.addProperty("focusNextStepCode", nextStepCode);
        return selector;
    }

    private static JsonObject tenCardExplainRequest() {
        JsonObject outer = JsonParser.parseString(validExplainRequest()).getAsJsonObject();
        JsonObject payload = outer.getAsJsonObject("payload");
        payload.getAsJsonObject("status").addProperty("mechanical", "attention");

        JsonArray advisorReasons = payload.getAsJsonObject("reasons")
            .getAsJsonArray("advisor");
        advisorReasons.add("SELECTED_RANGE_NOT_CLEAN");
        advisorReasons.add("GOVERNOR_SETTINGS_MISSING_OR_INVALID");
        advisorReasons.add("MOTOR_HEADROOM_INSUFFICIENT");
        advisorReasons.add("REQUIRED_GOVERNOR_FIELDS_MISSING");
        JsonArray mechanicalReasons = payload.getAsJsonObject("reasons")
            .getAsJsonArray("mechanical");
        mechanicalReasons.add("PERSISTENT_NARROWBAND_ENERGY");
        mechanicalReasons.add("MAIN_ROTOR_HARMONIC_CORRELATION");
        mechanicalReasons.add("TAIL_ROTOR_HARMONIC_CORRELATION");
        mechanicalReasons.add("RPM_UNSTABLE_IN_SELECTION");

        JsonObject mechanical = payload.getAsJsonObject("mechanical");
        mechanical.addProperty("status", "attention");
        mechanical.add("peaks", attentionPeaks());

        String[] messages = {
            "SCOPE_SELECTED_RANGE",
            "EVIDENCE_SUPPORTED",
            "QUALITY_PASS",
            "TRACKING_AVAILABLE",
            "BATTERY_AVAILABLE",
            "GOVERNOR_AVAILABLE",
            "MECHANICAL_ATTENTION_MAIN",
            "MECHANICAL_ATTENTION_TAIL",
            "MECHANICAL_ATTENTION_UNMATCHED",
            "PROPOSAL_WITHHELD"
        };
        payload.add("allowedMessageCodes", strings(messages));
        payload.add("requiredMessageCodes", strings(messages));
        String[] steps = {"VIEW_CITED_EVIDENCE", "INSPECT_MECHANICS_FIRST"};
        payload.add("allowedNextStepCodes", strings(steps));
        payload.add("requiredNextStepCodes", strings(steps));
        return outer;
    }

    private static JsonObject tenCardModelResponse() {
        String[] messages = {
            "SCOPE_SELECTED_RANGE",
            "EVIDENCE_SUPPORTED",
            "QUALITY_PASS",
            "TRACKING_AVAILABLE",
            "BATTERY_AVAILABLE",
            "GOVERNOR_AVAILABLE",
            "MECHANICAL_ATTENTION_MAIN",
            "MECHANICAL_ATTENTION_TAIL",
            "MECHANICAL_ATTENTION_UNMATCHED",
            "PROPOSAL_WITHHELD"
        };
        String[] advisorReasons = {
            "SELECTED_RANGE_NOT_CLEAN",
            "GOVERNOR_SETTINGS_MISSING_OR_INVALID",
            "MOTOR_HEADROOM_INSUFFICIENT",
            "REQUIRED_GOVERNOR_FIELDS_MISSING"
        };
        String[] mechanicalReasons = {
            "PERSISTENT_NARROWBAND_ENERGY",
            "MAIN_ROTOR_HARMONIC_CORRELATION",
            "TAIL_ROTOR_HARMONIC_CORRELATION",
            "RPM_UNSTABLE_IN_SELECTION"
        };
        JsonArray cards = new JsonArray();
        for (int index = 0; index < messages.length; index += 1) {
            String evidence = null;
            if (index == 6) evidence = "mechanical.roll.peak.1";
            if (index == 7) evidence = "mechanical.pitch.peak.1";
            if (index == 8) evidence = "mechanical.yaw.peak.1";
            JsonObject item = card(messages[index], evidence);
            String[] reasons = index >= 6 && index <= 8
                ? mechanicalReasons
                : advisorReasons;
            item.add("reasonRefs", strings(reasons));
            cards.add(item);
        }
        JsonObject model = new JsonObject();
        model.add("cards", cards);
        model.add("proposalRef", JsonNull.INSTANCE);
        model.add(
            "nextStepCodes",
            strings(new String[] {"VIEW_CITED_EVIDENCE", "INSPECT_MECHANICS_FIRST"})
        );
        return model;
    }

    private static JsonArray attentionPeaks() {
        JsonArray peaks = new JsonArray();
        peaks.add(peak("roll", harmonic("main", 120.0)));
        peaks.add(peak("pitch", harmonic("tail", 240.0)));
        peaks.add(peak("yaw", JsonNull.INSTANCE));
        return peaks;
    }

    private static JsonObject peak(String axis, com.google.gson.JsonElement harmonic) {
        JsonObject peak = new JsonObject();
        peak.addProperty("ref", "mechanical." + axis + ".peak.1");
        peak.addProperty("axis", axis);
        peak.addProperty("source", "gyroRAW");
        peak.addProperty("frequencyHz", 120.0);
        peak.addProperty("bandRmsDps", 10.0);
        peak.addProperty("prominenceDb", 9.0);
        peak.addProperty("persistenceRatio", 0.5);
        peak.addProperty("attentionEligible", true);
        peak.add("harmonicMatch", harmonic);
        return peak;
    }

    private static JsonObject harmonic(String rotor, double predictedHz) {
        JsonObject match = new JsonObject();
        match.addProperty("rotor", rotor);
        match.addProperty("order", 1);
        match.addProperty("predictedHz", predictedHz);
        match.addProperty("deltaHz", 0.0);
        match.addProperty("toleranceHz", 2.0);
        return match;
    }

    private static JsonArray strings(String[] values) {
        JsonArray result = new JsonArray();
        for (String value : values) result.add(value);
        return result;
    }
}
