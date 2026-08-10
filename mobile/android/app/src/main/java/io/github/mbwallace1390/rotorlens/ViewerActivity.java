package io.github.mbwallace1390.rotorlens;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Hosts the trusted desktop Blackbox viewer inside the React Native app. */
public final class ViewerActivity extends ComponentActivity {
    public static final String EXTRA_PICK_IMMEDIATELY =
        "io.github.mbwallace1390.rotorlens.extra.PICK_IMMEDIATELY";

    private static final int WEB_FILE_CHOOSER_REQUEST = 1001;
    private static final int IMMEDIATE_LOG_PICKER_REQUEST = 1002;
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + LOCAL_HOST + "/assets/index.html";
    private static final String SHARED_LOG_URL_PREFIX = "https://" + LOCAL_HOST + "/shared/";
    private static final String SHARED_LOG_ACK_URL_PREFIX = "https://" + LOCAL_HOST + "/shared-ack/";
    private static final String IMPORT_DIRECTORY_NAME = "imported-logs";
    private static final String STATE_SHARED_FILE_NAME = "viewer.sharedFileName";
    private static final String STATE_SHARED_DISPLAY_NAME = "viewer.sharedDisplayName";
    private static final String STATE_SHARED_MIME_TYPE = "viewer.sharedMimeType";
    private static final String DEFAULT_LOG_NAME = "BLACKBOX_LOG.BBL";
    private static final String DEFAULT_MIME_TYPE = "application/octet-stream";
    private static final String[] LOG_MIME_TYPES = {
        DEFAULT_MIME_TYPE,
        "application/x-blackbox-log",
        "text/plain"
    };

    private final ExecutorService importExecutor = Executors.newSingleThreadExecutor();
    private final Object sharedLogLock = new Object();
    private final LinkedHashMap<String, SharedLogResource> sharedLogs = new LinkedHashMap<>();

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private volatile File sharedLogFile;
    private volatile String sharedLogToken;
    private volatile String sharedLogName;
    private volatile String sharedLogMimeType = DEFAULT_MIME_TYPE;
    private boolean pageReady;
    private volatile boolean destroyed;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_viewer);

        webView = findViewById(R.id.viewer_web_view);
        configureBackNavigation();
        restoreSharedLog(savedInstanceState);
        pruneImportDirectory();
        configureWebView();
        processIncomingIntent(getIntent());

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }

        launchImmediatePickerIfRequested(getIntent());
    }

    private void configureBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finishAfterTransition();
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        processIncomingIntent(intent);
        launchImmediatePickerIfRequested(intent);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Keep the legacy marker because the GPL viewer uses it for platform detection.
        settings.setUserAgentString(
            settings.getUserAgentString()
                + " RotorflightBlackboxAndroid/"
                + BuildConfig.VERSION_NAME
        );

        // Serve both the viewer bundle and imported logs from one HTTPS origin.
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                new WebViewAssetLoader.AssetsPathHandler(this)
            )
            .addPathHandler("/shared/", new SharedLogPathHandler())
            .addPathHandler("/shared-ack/", new SharedLogAckPathHandler())
            .build();

        webView.setWebViewClient(new LocalContentWebViewClient(assetLoader));
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                launchWebFileChooser(callback, params);
                return true;
            }
        });
    }

    private void launchImmediatePickerIfRequested(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(EXTRA_PICK_IMMEDIATELY, false)) {
            return;
        }

        // Consume the command so a configuration/state restoration cannot reopen it.
        intent.removeExtra(EXTRA_PICK_IMMEDIATELY);
        webView.post(this::launchImmediateLogPicker);
    }

    private void launchImmediateLogPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, LOG_MIME_TYPES);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );

        try {
            startActivityForResult(intent, IMMEDIATE_LOG_PICKER_REQUEST);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_document_picker, Toast.LENGTH_LONG).show();
        }
    }

    private void processIncomingIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        Uri uri = null;
        String action = intent.getAction();

        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }

        ClipData clipData = intent.getClipData();
        if (uri == null && clipData != null && clipData.getItemCount() > 0) {
            uri = clipData.getItemAt(0).getUri();
        }

        if (uri != null) {
            importSharedLog(uri);
        }
    }

    private void importSharedLog(Uri uri) {
        final String displayName = resolveDisplayName(uri);
        final String mimeType = resolveMimeType(uri);

        importExecutor.execute(() -> {
            File importDirectory = getImportDirectory();
            if (!importDirectory.exists() && !importDirectory.mkdirs()) {
                showImportError(getString(R.string.import_storage_error));
                return;
            }

            File destination = new File(
                importDirectory,
                "blackbox-" + System.nanoTime() + supportedExtension(displayName)
            );

            try (
                InputStream input = getContentResolver().openInputStream(uri);
                FileOutputStream output = new FileOutputStream(destination)
            ) {
                if (input == null) {
                    throw new FileNotFoundException("Selected log is unavailable");
                }

                byte[] buffer = new byte[128 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
                output.flush();
            } catch (IOException | SecurityException error) {
                deleteQuietly(destination);
                showImportError(getString(R.string.import_copy_error));
                return;
            }

            if (!destination.isFile() || destination.length() == 0) {
                deleteQuietly(destination);
                showImportError(getString(R.string.import_empty_error));
                return;
            }

            if (destroyed) {
                deleteQuietly(destination);
                return;
            }

            runOnUiThread(() -> {
                if (destroyed) {
                    deleteQuietly(destination);
                    return;
                }

                String token = UUID.randomUUID().toString();
                sharedLogFile = destination;
                sharedLogToken = token;
                sharedLogName = displayName;
                sharedLogMimeType = mimeType;
                installSharedLog(token, destination, mimeType);

                dispatchSharedLogIfReady();
                Toast.makeText(
                    ViewerActivity.this,
                    R.string.log_imported,
                    Toast.LENGTH_SHORT
                ).show();
            });
        });
    }

    private void showImportError(String message) {
        if (destroyed) {
            return;
        }
        runOnUiThread(() -> {
            if (!destroyed) {
                Toast.makeText(ViewerActivity.this, message, Toast.LENGTH_LONG).show();
            }
        });
    }

    private String resolveMimeType(Uri uri) {
        try {
            String type = getContentResolver().getType(uri);
            if (type != null && !type.trim().isEmpty()) {
                return type;
            }
        } catch (RuntimeException ignored) {
            // Use the binary fallback below.
        }
        return DEFAULT_MIME_TYPE;
    }

    private String resolveDisplayName(Uri uri) {
        if ("content".equalsIgnoreCase(uri.getScheme())) {
            try (Cursor cursor = getContentResolver().query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (column >= 0) {
                        String name = cursor.getString(column);
                        if (name != null && !name.trim().isEmpty()) {
                            return normalizeDisplayName(name);
                        }
                    }
                }
            } catch (RuntimeException ignored) {
                // Fall back to the final URI path segment below.
            }
        }

        return normalizeDisplayName(uri.getLastPathSegment());
    }

    private static String normalizeDisplayName(String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) {
            return DEFAULT_LOG_NAME;
        }

        String normalized = fileName.trim().replace('\\', '/');
        int finalSeparator = normalized.lastIndexOf('/');
        if (finalSeparator >= 0 && finalSeparator + 1 < normalized.length()) {
            normalized = normalized.substring(finalSeparator + 1);
        }
        return normalized.isEmpty() ? DEFAULT_LOG_NAME : normalized;
    }

    private static String supportedExtension(String fileName) {
        String normalized = fileName.toLowerCase(Locale.ROOT);
        String[] supported = { ".bbl", ".txt", ".cfl", ".bfl", ".log" };
        for (String extension : supported) {
            if (normalized.endsWith(extension)) {
                // Preserve the source filename's extension spelling in app cache.
                return fileName.substring(fileName.length() - extension.length());
            }
        }
        return ".bin";
    }

    private void dispatchSharedLogIfReady() {
        String token = sharedLogToken;
        if (!pageReady || webView == null || sharedLogFile == null || token == null) {
            return;
        }

        String requestUrl = SHARED_LOG_URL_PREFIX + token;
        String acknowledgementUrl = SHARED_LOG_ACK_URL_PREFIX + token;
        String script = "window.openRotorflightSharedFile("
            + JSONObject.quote(requestUrl)
            + ","
            + JSONObject.quote(sharedLogName)
            + ").then(function (opened) {"
            + "if (!opened) { return false; }"
            + "return fetch("
            + JSONObject.quote(acknowledgementUrl)
            + ", { cache: 'no-store' });"
            + "}).catch(function () {});";

        WebView targetWebView = webView;
        targetWebView.post(() -> {
            if (!destroyed) {
                targetWebView.evaluateJavascript(script, null);
            }
        });
    }

    private void launchWebFileChooser(
        ValueCallback<Uri[]> callback,
        WebChromeClient.FileChooserParams params
    ) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
        }
        filePathCallback = callback;

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );

        String[] mimeTypes = sanitizeMimeTypes(params.getAcceptTypes());
        if (mimeTypes.length == 1) {
            intent.setType(mimeTypes[0]);
        } else {
            intent.setType("*/*");
            if (mimeTypes.length > 1) {
                intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            }
        }

        intent.putExtra(
            Intent.EXTRA_ALLOW_MULTIPLE,
            params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
        );

        try {
            startActivityForResult(intent, WEB_FILE_CHOOSER_REQUEST);
        } catch (ActivityNotFoundException error) {
            filePathCallback = null;
            callback.onReceiveValue(null);
            Toast.makeText(this, R.string.no_document_picker, Toast.LENGTH_LONG).show();
        }
    }

    private static String[] sanitizeMimeTypes(String[] acceptedTypes) {
        Set<String> mimeTypes = new LinkedHashSet<>();

        if (acceptedTypes != null) {
            for (String acceptedType : acceptedTypes) {
                if (acceptedType == null) {
                    continue;
                }

                for (String candidate : acceptedType.split(",")) {
                    String value = candidate.trim();
                    if (value.contains("/") && !value.startsWith(".")) {
                        mimeTypes.add(value);
                    }
                }
            }
        }

        return mimeTypes.toArray(new String[0]);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != WEB_FILE_CHOOSER_REQUEST
            && requestCode != IMMEDIATE_LOG_PICKER_REQUEST) {
            return;
        }

        List<Uri> selectedUris = collectSelectedUris(resultCode, data);

        if (requestCode == IMMEDIATE_LOG_PICKER_REQUEST) {
            if (!selectedUris.isEmpty()) {
                importSharedLog(selectedUris.get(0));
            }
            return;
        }

        ValueCallback<Uri[]> callback = filePathCallback;
        filePathCallback = null;
        Uri[] results = selectedUris.isEmpty()
            ? null
            : selectedUris.toArray(new Uri[0]);

        if (callback != null) {
            // Returning document URIs through WebChromeClient is what creates a
            // genuine browser FileList and fires the viewer's existing input path.
            callback.onReceiveValue(results);
        } else if (!selectedUris.isEmpty()) {
            // If the WebView was recreated while the picker was open, preserve
            // the selected log through the lifecycle-independent cache path.
            importSharedLog(selectedUris.get(0));
        }
    }

    private List<Uri> collectSelectedUris(int resultCode, Intent data) {
        List<Uri> selectedUris = new ArrayList<>();
        if (resultCode != RESULT_OK || data == null) {
            return selectedUris;
        }

        ClipData clipData = data.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                Uri uri = clipData.getItemAt(index).getUri();
                if (uri != null) {
                    selectedUris.add(uri);
                    persistReadPermission(uri, data.getFlags());
                }
            }
        } else if (data.getData() != null) {
            Uri uri = data.getData();
            selectedUris.add(uri);
            persistReadPermission(uri, data.getFlags());
        }
        return selectedUris;
    }

    private void persistReadPermission(Uri uri, int resultFlags) {
        int takeFlags = resultFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION;
        if (takeFlags == 0) {
            return;
        }

        try {
            getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (SecurityException ignored) {
            // Some providers grant temporary access only. Immediate selections
            // are copied before that temporary grant expires.
        }
    }

    private File getImportDirectory() {
        return new File(getCacheDir(), IMPORT_DIRECTORY_NAME);
    }

    private void pruneImportDirectory() {
        File currentFile = sharedLogFile;
        File[] cachedFiles = getImportDirectory().listFiles();
        if (cachedFiles == null) {
            return;
        }

        for (File cachedFile : cachedFiles) {
            if (currentFile == null || !currentFile.equals(cachedFile)) {
                deleteQuietly(cachedFile);
            }
        }
    }

    private void restoreSharedLog(@Nullable Bundle state) {
        if (state == null) {
            return;
        }

        String cachedFileName = state.getString(STATE_SHARED_FILE_NAME);
        if (cachedFileName == null || !cachedFileName.equals(new File(cachedFileName).getName())) {
            return;
        }

        File cachedFile = new File(getImportDirectory(), cachedFileName);
        if (!cachedFile.isFile() || cachedFile.length() == 0) {
            return;
        }

        sharedLogFile = cachedFile;
        sharedLogToken = UUID.randomUUID().toString();
        sharedLogName = state.getString(STATE_SHARED_DISPLAY_NAME, DEFAULT_LOG_NAME);
        sharedLogMimeType = state.getString(STATE_SHARED_MIME_TYPE, DEFAULT_MIME_TYPE);
        installSharedLog(sharedLogToken, sharedLogFile, sharedLogMimeType);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        File file = sharedLogFile;
        if (file != null && file.isFile()) {
            outState.putString(STATE_SHARED_FILE_NAME, file.getName());
            outState.putString(STATE_SHARED_DISPLAY_NAME, sharedLogName);
            outState.putString(STATE_SHARED_MIME_TYPE, sharedLogMimeType);
        }
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        destroyed = true;

        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }

        importExecutor.shutdownNow();

        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    private static void deleteQuietly(File file) {
        if (file != null) {
            // Cache cleanup is best-effort; Android can reclaim the directory.
            file.delete();
        }
    }

    private void installSharedLog(String token, File file, String mimeType) {
        synchronized (sharedLogLock) {
            sharedLogs.put(token, new SharedLogResource(file, mimeType));
        }
    }

    private boolean acknowledgeSharedLog(String token) {
        List<SharedLogResource> staleResources;

        synchronized (sharedLogLock) {
            staleResources = pruneAcknowledgedSharedLogs(
                sharedLogs,
                sharedLogToken,
                token
            );
            if (staleResources == null) {
                return false;
            }
        }

        for (SharedLogResource staleResource : staleResources) {
            deleteQuietly(staleResource.file);
        }
        return true;
    }

    @Nullable
    static <T> List<T> pruneAcknowledgedSharedLogs(
        LinkedHashMap<String, T> resources,
        @Nullable String newestToken,
        String acknowledgedToken
    ) {
        // A slow parse may acknowledge after a newer import is installed. Only
        // the newest token may prune older entries, or that late ACK could delete
        // the newer file before WebView fetches it.
        if (!acknowledgedToken.equals(newestToken)
            || !resources.containsKey(acknowledgedToken)) {
            return null;
        }

        List<String> staleTokens = new ArrayList<>();
        List<T> staleResources = new ArrayList<>();
        for (Map.Entry<String, T> entry : resources.entrySet()) {
            if (!entry.getKey().equals(acknowledgedToken)) {
                staleTokens.add(entry.getKey());
                staleResources.add(entry.getValue());
            }
        }
        for (String staleToken : staleTokens) {
            resources.remove(staleToken);
        }
        return staleResources;
    }

    private static final class SharedLogResource {
        final File file;
        final String mimeType;

        SharedLogResource(File file, String mimeType) {
            this.file = file;
            this.mimeType = mimeType;
        }
    }

    private final class SharedLogPathHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(String path) {
            String token = path.startsWith("/") ? path.substring(1) : path;
            SharedLogResource resource;
            synchronized (sharedLogLock) {
                resource = sharedLogs.get(token);
            }

            File file = resource == null ? null : resource.file;
            if (file == null || !file.isFile()) {
                return errorResponse(404, "No shared Blackbox log is available");
            }

            try {
                InputStream stream = new FileInputStream(file);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("Content-Length", Long.toString(file.length()));
                headers.put("X-Content-Type-Options", "nosniff");
                return new WebResourceResponse(
                    resource.mimeType,
                    null,
                    200,
                    "OK",
                    headers,
                    stream
                );
            } catch (FileNotFoundException error) {
                return errorResponse(404, "Shared Blackbox log is no longer readable");
            }
        }

        private WebResourceResponse errorResponse(int status, String message) {
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                status,
                message,
                headers,
                new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8))
            );
        }
    }

    private final class SharedLogAckPathHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(String path) {
            String token = path.startsWith("/") ? path.substring(1) : path;
            boolean acknowledged = acknowledgeSharedLog(token);
            String message = acknowledged ? "OK" : "Unknown import";
            int status = acknowledged ? 200 : 404;
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                status,
                acknowledged ? "OK" : "Not Found",
                headers,
                new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8))
            );
        }
    }

    private final class LocalContentWebViewClient extends WebViewClientCompat {
        private final WebViewAssetLoader assetLoader;

        LocalContentWebViewClient(WebViewAssetLoader assetLoader) {
            this.assetLoader = assetLoader;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(
            WebView view,
            WebResourceRequest request
        ) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return assetLoader.shouldInterceptRequest(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (isLocalViewerUrl(url)) {
                pageReady = false;
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isLocalViewerUrl(url)) {
                pageReady = true;
                dispatchSharedLogIfReady();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(
            WebView view,
            WebResourceRequest request
        ) {
            return openExternalUrl(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return openExternalUrl(Uri.parse(url));
        }

        private boolean isLocalViewerUrl(String url) {
            return url != null && url.startsWith("https://" + LOCAL_HOST + "/assets/");
        }

        private boolean openExternalUrl(Uri uri) {
            if (LOCAL_HOST.equals(uri.getHost())) {
                return false;
            }

            String scheme = uri.getScheme();
            if (!"http".equalsIgnoreCase(scheme)
                && !"https".equalsIgnoreCase(scheme)
                && !"mailto".equalsIgnoreCase(scheme)) {
                // Cancel unknown/custom schemes instead of handing them back
                // to the trusted viewer origin.
                return true;
            }

            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException error) {
                Toast.makeText(
                    ViewerActivity.this,
                    R.string.no_external_app,
                    Toast.LENGTH_SHORT
                ).show();
            }
            return true;
        }
    }
}
