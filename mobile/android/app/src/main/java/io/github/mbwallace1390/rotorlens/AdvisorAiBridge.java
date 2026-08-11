package io.github.mbwallace1390.rotorlens;

import android.app.AlertDialog;
import android.net.Uri;
import android.webkit.WebView;

import androidx.annotation.Nullable;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

/** Origin-scoped WebView message listener for the on-device advisor runtime. */
final class AdvisorAiBridge implements AutoCloseable {
    static final String LISTENER_NAME = "advisorAI";
    static final String ALLOWED_ORIGIN = "https://appassets.androidplatform.net";

    private final ViewerActivity activity;
    private final WebView webView;
    private final String expectedPageUrl;
    private final AdvisorAiService service;
    private final Object consentLock = new Object();

    @Nullable
    private PendingConsent pendingConsent;
    @Nullable
    private AlertDialog consentDialog;
    private volatile boolean closed;
    private boolean installed;

    AdvisorAiBridge(ViewerActivity activity, WebView webView, String expectedPageUrl) {
        this.activity = activity;
        this.webView = webView;
        this.expectedPageUrl = expectedPageUrl;
        service = new AdvisorAiService(activity.getApplicationContext());
    }

    void install() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            return;
        }
        WebViewCompat.addWebMessageListener(
            webView,
            LISTENER_NAME,
            Collections.singleton(ALLOWED_ORIGIN),
            this::onPostMessage
        );
        installed = true;
    }

    private void onPostMessage(
        WebView sourceView,
        WebMessageCompat message,
        Uri sourceOrigin,
        boolean isMainFrame,
        JavaScriptReplyProxy replyProxy
    ) {
        if (closed
            || sourceView != webView
            || !isMainFrame
            || !isExactOrigin(sourceOrigin)
            || !isExpectedPageUrl(expectedPageUrl, sourceView.getUrl())
            || message.getType() != WebMessageCompat.TYPE_STRING) {
            return;
        }

        String data = message.getData();
        if (data == null) return;
        AdvisorAiProtocol.Request request;
        try {
            request = AdvisorAiProtocol.parse(data);
        } catch (AdvisorAiProtocol.ProtocolException error) {
            // A malformed request has no trustworthy binding to echo.
            return;
        }

        AdvisorAiService.Responder responder = response -> webView.post(() -> {
            if (!closed && isExpectedPageUrl(expectedPageUrl, webView.getUrl())) {
                replyProxy.postMessage(response);
            }
        });

        switch (request.type) {
            case AdvisorAiProtocol.TYPE_STATUS:
                if (hasPendingConsent()) {
                    sendError(request, responder, AdvisorAiProtocol.ERROR_BUSY);
                } else {
                    service.handleStatus(request, responder);
                }
                break;
            case AdvisorAiProtocol.TYPE_DOWNLOAD:
                requestDownloadConsent(request, responder);
                break;
            case AdvisorAiProtocol.TYPE_EXPLAIN:
                if (hasPendingConsent()) {
                    sendError(request, responder, AdvisorAiProtocol.ERROR_BUSY);
                } else {
                    service.explain(request, responder);
                }
                break;
            case AdvisorAiProtocol.TYPE_CANCEL:
                cancel(request);
                break;
            default:
                sendError(request, responder, AdvisorAiProtocol.ERROR_REQUEST_INVALID);
                break;
        }
    }

    private void requestDownloadConsent(
        AdvisorAiProtocol.Request request,
        AdvisorAiService.Responder responder
    ) {
        if (!AdvisorModelSpec.isRuntimeSupported()) {
            sendError(request, responder, AdvisorAiProtocol.ERROR_UNAVAILABLE);
            return;
        }
        synchronized (consentLock) {
            if (pendingConsent != null || service.hasActiveOperation()) {
                sendError(request, responder, AdvisorAiProtocol.ERROR_BUSY);
                return;
            }
            pendingConsent = new PendingConsent(request, responder);
        }

        activity.runOnUiThread(() -> {
            synchronized (consentLock) {
                if (closed || pendingConsent == null || pendingConsent.request != request) {
                    return;
                }
                consentDialog = new AlertDialog.Builder(activity)
                    .setTitle("Download on-device AI model?")
                    .setMessage(
                        "RotorLens will download the Apache-2.0 Qwen3-0.6B model "
                            + "(about 329 MiB) into this app's private storage. Wi-Fi is "
                            + "recommended; keep RotorLens open until it finishes. After "
                            + "verification, AI explanations run offline."
                    )
                    .setPositiveButton("Download", (dialog, which) -> {
                        PendingConsent accepted = takePendingConsent(request.requestId);
                        if (accepted != null && !closed) {
                            service.startDownload(accepted.request, accepted.responder);
                        }
                    })
                    .setNegativeButton("Cancel", (dialog, which) -> {
                        PendingConsent rejected = takePendingConsent(request.requestId);
                        if (rejected != null) {
                            sendError(
                                rejected.request,
                                rejected.responder,
                                AdvisorAiProtocol.ERROR_CANCELLED
                            );
                        }
                    })
                    .setOnCancelListener(dialog -> {
                        PendingConsent rejected = takePendingConsent(request.requestId);
                        if (rejected != null) {
                            sendError(
                                rejected.request,
                                rejected.responder,
                                AdvisorAiProtocol.ERROR_CANCELLED
                            );
                        }
                    })
                    .create();
                consentDialog.show();
            }
        });
    }

    private void cancel(AdvisorAiProtocol.Request request) {
        AlertDialog dialogToDismiss = null;
        synchronized (consentLock) {
            if (pendingConsent != null
                && pendingConsent.request.requestId.equals(request.requestId)) {
                pendingConsent = null;
                dialogToDismiss = consentDialog;
                consentDialog = null;
            }
        }
        if (dialogToDismiss != null) dialogToDismiss.dismiss();
        service.cancel(request);
    }

    void onNavigation() {
        dismissConsent(false);
        service.cancelForLifecycle();
    }

    void onBackground() {
        dismissConsent(true);
        service.cancelForBackground();
    }

    private boolean hasPendingConsent() {
        synchronized (consentLock) {
            return pendingConsent != null;
        }
    }

    @Nullable
    private PendingConsent takePendingConsent(String requestId) {
        synchronized (consentLock) {
            if (pendingConsent == null
                || !pendingConsent.request.requestId.equals(requestId)) {
                return null;
            }
            PendingConsent result = pendingConsent;
            pendingConsent = null;
            consentDialog = null;
            return result;
        }
    }

    private void dismissConsent(boolean replyCancelled) {
        AlertDialog dialog;
        PendingConsent cancelled;
        synchronized (consentLock) {
            cancelled = pendingConsent;
            pendingConsent = null;
            dialog = consentDialog;
            consentDialog = null;
        }
        if (dialog != null) dialog.dismiss();
        if (replyCancelled && cancelled != null) {
            sendError(
                cancelled.request,
                cancelled.responder,
                AdvisorAiProtocol.ERROR_CANCELLED
            );
        }
    }

    private static boolean isExactOrigin(Uri origin) {
        return origin != null
            && "https".equals(origin.getScheme())
            && "appassets.androidplatform.net".equals(origin.getHost())
            && origin.getPort() == -1
            && (origin.getUserInfo() == null || origin.getUserInfo().isEmpty());
    }

    /**
     * Matches the one pinned viewer document while allowing its same-document fragment to change.
     * Scheme, authority, path, and query remain byte-for-byte bound to {@code expectedPageUrl}.
     */
    static boolean isExpectedPageUrl(String expectedPageUrl, @Nullable String actualPageUrl) {
        if (expectedPageUrl == null || actualPageUrl == null || expectedPageUrl.indexOf('#') >= 0) {
            return false;
        }
        int fragmentStart = actualPageUrl.indexOf('#');
        String documentUrl = fragmentStart >= 0
            ? actualPageUrl.substring(0, fragmentStart)
            : actualPageUrl;
        return expectedPageUrl.equals(documentUrl);
    }

    private static void sendError(
        AdvisorAiProtocol.Request request,
        AdvisorAiService.Responder responder,
        String code
    ) {
        responder.send(AdvisorAiProtocol.reply(
            AdvisorAiProtocol.TYPE_ERROR,
            request,
            AdvisorAiProtocol.errorPayload(request, code)
        ));
    }

    @Override
    public void close() {
        closed = true;
        dismissConsent(false);
        service.close();
        if (installed) {
            WebViewCompat.removeWebMessageListener(webView, LISTENER_NAME);
            installed = false;
        }
    }

    private static final class PendingConsent {
        final AdvisorAiProtocol.Request request;
        final AdvisorAiService.Responder responder;

        PendingConsent(
            AdvisorAiProtocol.Request request,
            AdvisorAiService.Responder responder
        ) {
            this.request = request;
            this.responder = responder;
        }
    }
}
