package org.rotorflight.blackbox;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
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

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + LOCAL_HOST + "/assets/index.html";
    private static final String SHARED_LOG_URL = "https://" + LOCAL_HOST + "/shared/current";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private volatile Uri sharedLogUri;
    private volatile String sharedLogName;
    private boolean pageReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.web_view);
        configureWebView();
        processIncomingIntent(getIntent());

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        processIncomingIntent(intent);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(
            settings.getUserAgentString()
                + " RotorflightBlackboxAndroid/"
                + BuildConfig.VERSION_NAME
        );

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                new WebViewAssetLoader.AssetsPathHandler(this)
            )
            .addPathHandler("/shared/", new SharedLogPathHandler())
            .build();

        webView.setWebViewClient(new LocalContentWebViewClient(assetLoader));
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                launchDocumentPicker(callback, params);
                return true;
            }
        });
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

        if (uri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
            uri = intent.getClipData().getItemAt(0).getUri();
        }

        if (uri == null) {
            return;
        }

        sharedLogUri = uri;
        sharedLogName = resolveDisplayName(uri);
        dispatchSharedLogIfReady();
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
                        if (name != null && !name.isBlank()) {
                            return name;
                        }
                    }
                }
            } catch (RuntimeException ignored) {
                // Fall back to the final URI path segment below.
            }
        }

        String segment = uri.getLastPathSegment();
        return segment == null || segment.isBlank() ? "BLACKBOX_LOG.BBL" : segment;
    }

    private void dispatchSharedLogIfReady() {
        if (!pageReady || webView == null || sharedLogUri == null) {
            return;
        }

        String requestUrl = SHARED_LOG_URL + "?t=" + System.nanoTime();
        String script = "window.openRotorflightSharedFile("
            + JSONObject.quote(requestUrl)
            + ","
            + JSONObject.quote(sharedLogName)
            + ");";

        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void launchDocumentPicker(
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
            startActivityForResult(intent, FILE_CHOOSER_REQUEST);
        } catch (ActivityNotFoundException error) {
            filePathCallback = null;
            callback.onReceiveValue(null);
            Toast.makeText(
                this,
                R.string.no_document_picker,
                Toast.LENGTH_LONG
            ).show();
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

        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) {
            return;
        }

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            List<Uri> selectedUris = new ArrayList<>();
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

            if (!selectedUris.isEmpty()) {
                results = selectedUris.toArray(new Uri[0]);
            }
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    private void persistReadPermission(Uri uri, int resultFlags) {
        int takeFlags = resultFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION;
        if (takeFlags == 0) {
            return;
        }

        try {
            getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (SecurityException ignored) {
            // Some document providers grant temporary access only. That is enough
            // for the current Blackbox session.
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }

        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    private final class SharedLogPathHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(String path) {
            Uri uri = sharedLogUri;
            if (uri == null) {
                return errorResponse(404, "No shared Blackbox log is available");
            }

            try {
                InputStream stream = getContentResolver().openInputStream(uri);
                if (stream == null) {
                    return errorResponse(404, "Unable to open shared Blackbox log");
                }

                String mimeType = getContentResolver().getType(uri);
                if (mimeType == null || mimeType.isBlank()) {
                    mimeType = "application/octet-stream";
                }

                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                return new WebResourceResponse(
                    mimeType,
                    null,
                    200,
                    "OK",
                    headers,
                    stream
                );
            } catch (FileNotFoundException | SecurityException error) {
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
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (url != null && url.startsWith("https://" + LOCAL_HOST + "/assets/")) {
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

        private boolean openExternalUrl(Uri uri) {
            if (LOCAL_HOST.equals(uri.getHost())) {
                return false;
            }

            String scheme = uri.getScheme();
            if (!"http".equalsIgnoreCase(scheme)
                && !"https".equalsIgnoreCase(scheme)
                && !"mailto".equalsIgnoreCase(scheme)) {
                return false;
            }

            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException error) {
                Toast.makeText(
                    MainActivity.this,
                    R.string.no_external_app,
                    Toast.LENGTH_SHORT
                ).show();
            }
            return true;
        }
    }
}
