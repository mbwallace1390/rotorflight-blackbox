package io.github.mbwallace1390.rotorlens;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AdvisorAiBridgeTest {
    private static final String EXPECTED =
        "https://appassets.androidplatform.net/assets/index.html?v=121";

    @Test
    public void exactDocumentAllowsSameDocumentFragments() {
        assertTrue(AdvisorAiBridge.isExpectedPageUrl(EXPECTED, EXPECTED));
        assertTrue(AdvisorAiBridge.isExpectedPageUrl(EXPECTED, EXPECTED + "#"));
        assertTrue(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            EXPECTED + "#log-field-values"
        ));
        assertTrue(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            EXPECTED + "#?query-like-fragment"
        ));
    }

    @Test
    public void queryMustRemainExact() {
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://appassets.androidplatform.net/assets/index.html"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://appassets.androidplatform.net/assets/index.html?v=118"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://appassets.androidplatform.net/assets/index.html?v=121&extra=1"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://appassets.androidplatform.net/assets/index.html?extra=1&v=121"
        ));
    }

    @Test
    public void originAndPathMustRemainExact() {
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "http://appassets.androidplatform.net/assets/index.html?v=121"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://example.com/assets/index.html?v=121"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://user@appassets.androidplatform.net/assets/index.html?v=121"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://appassets.androidplatform.net:443/assets/index.html?v=121"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://appassets.androidplatform.net/assets/other.html?v=121"
        ));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(
            EXPECTED,
            "https://appassets.androidplatform.net/assets/index.html/extra?v=121"
        ));
    }

    @Test
    public void malformedBindingsAreRejected() {
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(EXPECTED, null));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(null, EXPECTED));
        assertFalse(AdvisorAiBridge.isExpectedPageUrl(EXPECTED + "#saved", EXPECTED));
    }
}
