package io.github.mbwallace1390.rotorlens;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** Small React Native boundary for launching the native Blackbox viewer host. */
public final class RotorflightHostModule extends ReactContextBaseJavaModule {
    public static final String NAME = "RotorflightHost";

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
}
