package io.github.mbwallace1390.rotorlens;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.util.UUID;

/** Small React Native boundary for launching the native Blackbox viewer host. */
public final class RotorflightHostModule extends ReactContextBaseJavaModule {
    public static final String NAME = "RotorflightHost";
    private static final String ROTORFLIGHT_CONFIGURATOR_PACKAGE =
        "org.rotorflight.rotorflightconfigurator";

    RotorflightHostModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void openViewer(boolean pickImmediately, Promise promise) {
        try {
            ReactApplicationContext reactContext = getReactApplicationContext();
            Activity activity = reactContext.getCurrentActivity();
            Context launchContext = activity != null ? activity : reactContext;
            Intent intent = new Intent(launchContext, ViewerActivity.class);
            intent.putExtra(ViewerActivity.EXTRA_PICK_IMMEDIATELY, pickImmediately);
            if (activity == null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            launchContext.startActivity(intent);
            promise.resolve(true);
        } catch (RuntimeException error) {
            promise.reject(
                "E_VIEWER_LAUNCH",
                "Unable to open the RotorLens viewer.",
                error
            );
        }
    }

    @ReactMethod
    public void beginMassStorageImport(Promise promise) {
        Activity currentActivity = getReactApplicationContext().getCurrentActivity();
        if (!(currentActivity instanceof MainActivity)) {
            promise.resolve(status("host-not-foreground"));
            return;
        }

        MainActivity host = (MainActivity) currentActivity;
        host.runOnUiThread(() -> beginMassStorageImportOnUiThread(host, promise));
    }

    private void beginMassStorageImportOnUiThread(MainActivity host, Promise promise) {
        Activity currentActivity = getReactApplicationContext().getCurrentActivity();
        if (currentActivity != host || !host.isMassStorageImportHostForeground()) {
            promise.resolve(status("host-not-foreground"));
            return;
        }

        Intent configuratorIntent;
        try {
            configuratorIntent = host.getPackageManager().getLaunchIntentForPackage(
                ROTORFLIGHT_CONFIGURATOR_PACKAGE
            );
        } catch (RuntimeException error) {
            promise.resolve(status("launch-failed"));
            return;
        }

        if (configuratorIntent == null) {
            promise.resolve(status("configurator-unavailable"));
            return;
        }

        String requestId = UUID.randomUUID().toString();
        long nowMs = System.currentTimeMillis();
        MassStorageImportCoordinator coordinator =
            MassStorageImportPreferences.coordinator(host);
        MassStorageImportCoordinator.Ticket ticket = coordinator.begin(requestId, nowMs);
        if (ticket == null) {
            promise.resolve(status("launch-failed"));
            return;
        }

        try {
            host.startActivity(configuratorIntent);
            WritableMap result = status("launched");
            result.putString("requestId", ticket.getRequestId());
            result.putDouble("expiresAtMs", (double) ticket.getExpiresAtMs());
            promise.resolve(result);
        } catch (RuntimeException error) {
            coordinator.cancel(requestId);
            promise.resolve(status("launch-failed"));
        }
    }

    private static WritableMap status(String value) {
        WritableMap result = Arguments.createMap();
        result.putString("status", value);
        return result;
    }
}
