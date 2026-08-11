package io.github.mbwallace1390.rotorlens;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.UUID;

import org.junit.Test;

public class MassStorageImportCoordinatorTest {
    private static final long NOW_MS = 5_000L;

    @Test
    public void ticketExpiresAfterTenMinutes() {
        MemoryStore store = new MemoryStore();
        MassStorageImportCoordinator coordinator =
            new MassStorageImportCoordinator(store);
        String requestId = requestId();

        MassStorageImportCoordinator.Ticket ticket = coordinator.begin(requestId, NOW_MS);

        assertNotNull(ticket);
        assertEquals(
            NOW_MS + MassStorageImportCoordinator.TICKET_TTL_MS,
            ticket.getExpiresAtMs()
        );
        assertNull(coordinator.prepareDispatch(ticket.getExpiresAtMs()));
        assertNull(store.value);
    }

    @Test
    public void pendingTicketIsConsumedAtMostOnce() {
        MemoryStore store = new MemoryStore();
        MassStorageImportCoordinator coordinator =
            new MassStorageImportCoordinator(store);
        String requestId = requestId();
        coordinator.begin(requestId, NOW_MS);
        coordinator.prepareDispatch(NOW_MS + 1L);

        assertTrue(coordinator.consumeForDispatch(requestId, NOW_MS + 2L));
        assertFalse(coordinator.consumeForDispatch(requestId, NOW_MS + 3L));
        assertNull(coordinator.prepareDispatch(NOW_MS + 4L));
    }

    @Test
    public void corruptTicketIsClearedWithoutDispatch() {
        MemoryStore store = new MemoryStore();
        store.value = "v1|WAITING|not-a-uuid|later";
        MassStorageImportCoordinator coordinator =
            new MassStorageImportCoordinator(store);

        assertNull(coordinator.prepareDispatch(NOW_MS));
        assertNull(store.value);
    }

    @Test
    public void pauseKeepsPendingTicketForNextResume() {
        MemoryStore store = new MemoryStore();
        MassStorageImportCoordinator coordinator =
            new MassStorageImportCoordinator(store);
        String requestId = requestId();
        coordinator.begin(requestId, NOW_MS);

        MassStorageImportCoordinator.Ticket firstResume =
            coordinator.prepareDispatch(NOW_MS + 1L);
        MassStorageImportCoordinator.Ticket secondResume =
            coordinator.prepareDispatch(NOW_MS + 2L);

        assertNotNull(firstResume);
        assertNotNull(secondResume);
        assertEquals(MassStorageImportCoordinator.Phase.DISPATCH_PENDING, firstResume.getPhase());
        assertEquals(firstResume.getRequestId(), secondResume.getRequestId());
        assertTrue(coordinator.consumeForDispatch(requestId, NOW_MS + 3L));
    }

    @Test
    public void pendingTicketSurvivesCoordinatorRecreation() {
        MemoryStore store = new MemoryStore();
        String requestId = requestId();
        MassStorageImportCoordinator firstProcess =
            new MassStorageImportCoordinator(store);
        firstProcess.begin(requestId, NOW_MS);
        firstProcess.prepareDispatch(NOW_MS + 1L);

        MassStorageImportCoordinator restoredProcess =
            new MassStorageImportCoordinator(store);
        MassStorageImportCoordinator.Ticket restored =
            restoredProcess.prepareDispatch(NOW_MS + 2L);

        assertNotNull(restored);
        assertEquals(requestId, restored.getRequestId());
        assertEquals(MassStorageImportCoordinator.Phase.DISPATCH_PENDING, restored.getPhase());
        assertTrue(restoredProcess.consumeForDispatch(requestId, NOW_MS + 3L));
    }

    @Test
    public void waitingTicketSurvivesProcessDeathInConfigurator() {
        MemoryStore store = new MemoryStore();
        String requestId = requestId();
        new MassStorageImportCoordinator(store).begin(requestId, NOW_MS);

        MassStorageImportCoordinator restoredProcess =
            new MassStorageImportCoordinator(store);
        MassStorageImportCoordinator.Ticket restored =
            restoredProcess.prepareDispatch(NOW_MS + 1L);

        assertNotNull(restored);
        assertEquals(requestId, restored.getRequestId());
        assertEquals(MassStorageImportCoordinator.Phase.DISPATCH_PENDING, restored.getPhase());
    }

    @Test
    public void mismatchedRequestCannotConsumePendingTicket() {
        MemoryStore store = new MemoryStore();
        MassStorageImportCoordinator coordinator =
            new MassStorageImportCoordinator(store);
        String requestId = requestId();
        coordinator.begin(requestId, NOW_MS);
        coordinator.prepareDispatch(NOW_MS + 1L);

        assertFalse(coordinator.consumeForDispatch(requestId(), NOW_MS + 2L));
        assertNotNull(coordinator.prepareDispatch(NOW_MS + 3L));
    }

    private static String requestId() {
        return UUID.randomUUID().toString();
    }

    private static final class MemoryStore implements MassStorageImportCoordinator.Store {
        private String value;

        @Override
        public String read() {
            return value;
        }

        @Override
        public boolean write(String newValue) {
            value = newValue;
            return true;
        }

        @Override
        public boolean clear() {
            value = null;
            return true;
        }
    }
}
