package io.github.mbwallace1390.rotorlens;

import android.content.Context;
import android.content.SharedPreferences;

/** SharedPreferences adapters for the pure mass-storage handoff state machines. */
final class MassStorageImportPreferences {
    private static final String PREFERENCES_NAME = "mass-storage-import";
    private static final String TICKET_KEY = "handoff-ticket";
    private static final String PICKER_REQUESTS_KEY = "processed-picker-requests";

    private MassStorageImportPreferences() {}

    static MassStorageImportCoordinator coordinator(Context context) {
        SharedPreferences preferences = preferences(context);
        return new MassStorageImportCoordinator(
            new PreferenceValueStore(preferences, TICKET_KEY)
        );
    }

    static PickerRequestDeduplicator pickerRequestDeduplicator(Context context) {
        SharedPreferences preferences = preferences(context);
        return new PickerRequestDeduplicator(
            new PreferenceValueStore(preferences, PICKER_REQUESTS_KEY)
        );
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(
            PREFERENCES_NAME,
            Context.MODE_PRIVATE
        );
    }

    private static final class PreferenceValueStore
        implements MassStorageImportCoordinator.Store, PickerRequestDeduplicator.Store {
        private final SharedPreferences preferences;
        private final String key;

        PreferenceValueStore(SharedPreferences preferences, String key) {
            this.preferences = preferences;
            this.key = key;
        }

        @Override
        public String read() {
            try {
                return preferences.getString(key, null);
            } catch (ClassCastException error) {
                preferences.edit().remove(key).commit();
                return null;
            }
        }

        @Override
        public boolean write(String value) {
            return preferences.edit().putString(key, value).commit();
        }

        @Override
        public boolean clear() {
            return preferences.edit().remove(key).commit();
        }
    }
}
