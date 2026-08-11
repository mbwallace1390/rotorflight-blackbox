package io.github.mbwallace1390.rotorlens;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;

import org.junit.Test;

public class ViewerActivityTest {
    @Test
    public void startUrlIsBoundToCurrentViewerAssets() {
        assertEquals(
            "https://appassets.androidplatform.net/assets/index.html?v=124",
            ViewerActivity.START_URL
        );
    }

    @Test
    public void restoresWebViewOnlyForExactAssetVersion() {
        assertTrue(ViewerActivity.shouldRestoreWebViewState("124"));
        assertFalse(ViewerActivity.shouldRestoreWebViewState("123"));
        assertFalse(ViewerActivity.shouldRestoreWebViewState("122"));
        assertFalse(ViewerActivity.shouldRestoreWebViewState("119"));
        assertFalse(ViewerActivity.shouldRestoreWebViewState("118"));
        assertFalse(ViewerActivity.shouldRestoreWebViewState("125"));
        assertFalse(ViewerActivity.shouldRestoreWebViewState("malformed"));
        assertFalse(ViewerActivity.shouldRestoreWebViewState(null));
    }

    @Test
    public void versionedStartUrlRemainsARecognizedLocalViewerPage() {
        assertTrue(ViewerActivity.isLocalViewerUrl(ViewerActivity.START_URL));
        assertTrue(ViewerActivity.isLocalViewerUrl(
            "https://appassets.androidplatform.net/assets/js/main.js?v=124"
        ));
        assertFalse(ViewerActivity.isLocalViewerUrl(
            "https://example.com/assets/index.html?v=124"
        ));
        assertFalse(ViewerActivity.isLocalViewerUrl(null));
    }

    @Test
    public void staleAcknowledgementCannotPruneNewerImport() {
        LinkedHashMap<String, String> resources = resources("A", "B");

        List<String> pruned = ViewerActivity.pruneAcknowledgedSharedLogs(
            resources,
            "B",
            "A"
        );

        assertNull(pruned);
        assertEquals(Arrays.asList("A", "B"), Arrays.asList(resources.keySet().toArray()));
    }

    @Test
    public void newestAcknowledgementPrunesOnlyOlderImports() {
        LinkedHashMap<String, String> resources = resources("A", "B");

        List<String> pruned = ViewerActivity.pruneAcknowledgedSharedLogs(
            resources,
            "B",
            "B"
        );

        assertEquals(Collections.singletonList("A-value"), pruned);
        assertEquals(Collections.singletonList("B"), Arrays.asList(resources.keySet().toArray()));
    }

    @Test
    public void newestAcknowledgementIsIdempotent() {
        LinkedHashMap<String, String> resources = resources("B");

        assertEquals(
            Collections.emptyList(),
            ViewerActivity.pruneAcknowledgedSharedLogs(resources, "B", "B")
        );
        assertEquals(
            Collections.emptyList(),
            ViewerActivity.pruneAcknowledgedSharedLogs(resources, "B", "B")
        );
        assertEquals(Collections.singletonList("B"), Arrays.asList(resources.keySet().toArray()));
    }

    @Test
    public void unknownAcknowledgementDoesNotMutateImports() {
        LinkedHashMap<String, String> resources = resources("A", "B");

        assertNull(ViewerActivity.pruneAcknowledgedSharedLogs(resources, "B", "missing"));
        assertEquals(Arrays.asList("A", "B"), Arrays.asList(resources.keySet().toArray()));
        assertFalse(resources.containsKey("missing"));
    }

    private static LinkedHashMap<String, String> resources(String... tokens) {
        LinkedHashMap<String, String> resources = new LinkedHashMap<>();
        for (String token : tokens) {
            resources.put(token, token + "-value");
        }
        return resources;
    }
}
