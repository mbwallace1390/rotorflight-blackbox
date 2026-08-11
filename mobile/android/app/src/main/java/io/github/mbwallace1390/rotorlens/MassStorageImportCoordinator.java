package io.github.mbwallace1390.rotorlens;

import java.util.UUID;

/**
 * Persists the one-shot handoff from Rotorflight Configurator to the Android
 * document picker. The state machine is Android-free so lifecycle edge cases
 * can be covered by ordinary JVM tests.
 */
final class MassStorageImportCoordinator {
    static final long TICKET_TTL_MS = 10L * 60L * 1000L;

    private static final String FORMAT_VERSION = "v1";
    private static final String SEPARATOR = "|";

    enum Phase {
        WAITING,
        DISPATCH_PENDING
    }

    interface Store {
        String read();

        boolean write(String value);

        boolean clear();
    }

    static final class Ticket {
        private final String requestId;
        private final long expiresAtMs;
        private final Phase phase;

        Ticket(String requestId, long expiresAtMs, Phase phase) {
            this.requestId = requestId;
            this.expiresAtMs = expiresAtMs;
            this.phase = phase;
        }

        String getRequestId() {
            return requestId;
        }

        long getExpiresAtMs() {
            return expiresAtMs;
        }

        Phase getPhase() {
            return phase;
        }
    }

    private final Store store;

    MassStorageImportCoordinator(Store store) {
        this.store = store;
    }

    /** Replaces any older handoff only after the new ticket is durably written. */
    synchronized Ticket begin(String requestId, long nowMs) {
        if (!isUuid(requestId)) {
            return null;
        }

        long expiresAtMs;
        try {
            expiresAtMs = Math.addExact(nowMs, TICKET_TTL_MS);
        } catch (ArithmeticException error) {
            return null;
        }

        Ticket ticket = new Ticket(requestId, expiresAtMs, Phase.WAITING);
        return store.write(encode(ticket)) ? ticket : null;
    }

    /**
     * Claims a waiting ticket for the next foreground dispatch. A pending
     * ticket is returned unchanged so an onPause or process restart can retry.
     */
    synchronized Ticket prepareDispatch(long nowMs) {
        String encoded = store.read();
        Ticket ticket = decode(encoded);
        if (ticket == null) {
            if (encoded != null) {
                store.clear();
            }
            return null;
        }

        if (nowMs >= ticket.expiresAtMs) {
            store.clear();
            return null;
        }

        if (ticket.phase == Phase.DISPATCH_PENDING) {
            return ticket;
        }

        Ticket pending = new Ticket(
            ticket.requestId,
            ticket.expiresAtMs,
            Phase.DISPATCH_PENDING
        );
        return store.write(encode(pending)) ? pending : null;
    }

    /** Consumes the exact pending ticket immediately before picker dispatch. */
    synchronized boolean consumeForDispatch(String requestId, long nowMs) {
        String encoded = store.read();
        Ticket ticket = decode(encoded);
        if (ticket == null) {
            if (encoded != null) {
                store.clear();
            }
            return false;
        }

        if (nowMs >= ticket.expiresAtMs) {
            store.clear();
            return false;
        }

        if (ticket.phase != Phase.DISPATCH_PENDING
            || !ticket.requestId.equals(requestId)) {
            return false;
        }

        return store.clear();
    }

    /** Removes a ticket when Configurator could not actually be launched. */
    synchronized void cancel(String requestId) {
        Ticket ticket = decode(store.read());
        if (ticket != null && ticket.requestId.equals(requestId)) {
            store.clear();
        }
    }

    private static String encode(Ticket ticket) {
        return FORMAT_VERSION
            + SEPARATOR
            + ticket.phase.name()
            + SEPARATOR
            + ticket.requestId
            + SEPARATOR
            + ticket.expiresAtMs;
    }

    private static Ticket decode(String encoded) {
        if (encoded == null) {
            return null;
        }

        String[] fields = encoded.split("\\|", -1);
        if (fields.length != 4 || !FORMAT_VERSION.equals(fields[0])) {
            return null;
        }

        try {
            Phase phase = Phase.valueOf(fields[1]);
            String requestId = fields[2];
            long expiresAtMs = Long.parseLong(fields[3]);
            if (!isUuid(requestId) || expiresAtMs < 0L) {
                return null;
            }
            return new Ticket(requestId, expiresAtMs, phase);
        } catch (IllegalArgumentException error) {
            return null;
        }
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
