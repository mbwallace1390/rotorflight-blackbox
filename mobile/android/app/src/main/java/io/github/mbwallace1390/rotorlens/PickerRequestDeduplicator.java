package io.github.mbwallace1390.rotorlens;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Persistently claims handoff request IDs before an automatic picker opens. */
final class PickerRequestDeduplicator {
    private static final String FORMAT_VERSION = "v1";
    private static final String HEADER_SEPARATOR = "|";
    private static final String REQUEST_SEPARATOR = ",";
    private static final int MAX_REMEMBERED_REQUESTS = 64;

    interface Store {
        String read();

        boolean write(String value);
    }

    private final Store store;

    PickerRequestDeduplicator(Store store) {
        this.store = store;
    }

    /** Returns true exactly once for each valid request ID that can be persisted. */
    synchronized boolean claim(String requestId) {
        if (!isUuid(requestId)) {
            return false;
        }

        LinkedHashSet<String> remembered = decode(store.read());
        if (remembered.contains(requestId)) {
            return false;
        }

        remembered.add(requestId);
        while (remembered.size() > MAX_REMEMBERED_REQUESTS) {
            remembered.remove(remembered.iterator().next());
        }
        return store.write(encode(remembered));
    }

    private static String encode(Set<String> requestIds) {
        return FORMAT_VERSION
            + HEADER_SEPARATOR
            + String.join(REQUEST_SEPARATOR, requestIds);
    }

    private static LinkedHashSet<String> decode(String encoded) {
        LinkedHashSet<String> requestIds = new LinkedHashSet<>();
        if (encoded == null) {
            return requestIds;
        }

        String[] sections = encoded.split("\\|", -1);
        if (sections.length != 2 || !FORMAT_VERSION.equals(sections[0])) {
            return requestIds;
        }

        if (sections[1].isEmpty()) {
            return requestIds;
        }

        String[] candidates = sections[1].split(REQUEST_SEPARATOR, -1);
        List<String> validated = new ArrayList<>(candidates.length);
        for (String candidate : candidates) {
            if (!isUuid(candidate)) {
                return new LinkedHashSet<>();
            }
            validated.add(candidate);
        }
        requestIds.addAll(validated);
        return requestIds;
    }

    private static boolean isUuid(String value) {
        if (value == null) {
            return false;
        }

        try {
            return UUID.fromString(value).toString().equals(value);
        } catch (IllegalArgumentException error) {
            return false;
        }
    }
}
