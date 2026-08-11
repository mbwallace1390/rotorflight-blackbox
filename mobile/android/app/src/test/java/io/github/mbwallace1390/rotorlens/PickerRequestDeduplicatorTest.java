package io.github.mbwallace1390.rotorlens;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.UUID;

import org.junit.Test;

public class PickerRequestDeduplicatorTest {
    @Test
    public void duplicatePickerRequestIsRejectedAcrossActivityRecreation() {
        MemoryStore store = new MemoryStore();
        String requestId = UUID.randomUUID().toString();

        assertTrue(new PickerRequestDeduplicator(store).claim(requestId));
        assertFalse(new PickerRequestDeduplicator(store).claim(requestId));
    }

    @Test
    public void corruptHistoryRecoversWithCurrentRequest() {
        MemoryStore store = new MemoryStore();
        store.value = "not-valid-history";
        String requestId = UUID.randomUUID().toString();

        assertTrue(new PickerRequestDeduplicator(store).claim(requestId));
        assertFalse(new PickerRequestDeduplicator(store).claim(requestId));
    }

    @Test
    public void invalidRequestIdCannotOpenAutomaticPicker() {
        MemoryStore store = new MemoryStore();

        assertFalse(new PickerRequestDeduplicator(store).claim("not-a-uuid"));
        assertFalse(new PickerRequestDeduplicator(store).claim(""));
    }

    @Test
    public void failedPersistenceDoesNotClaimRequest() {
        MemoryStore store = new MemoryStore();
        store.writeSucceeds = false;

        assertFalse(
            new PickerRequestDeduplicator(store).claim(UUID.randomUUID().toString())
        );
    }

    private static final class MemoryStore implements PickerRequestDeduplicator.Store {
        private String value;
        private boolean writeSucceeds = true;

        @Override
        public String read() {
            return value;
        }

        @Override
        public boolean write(String newValue) {
            if (!writeSucceeds) {
                return false;
            }
            value = newValue;
            return true;
        }
    }
}
