package io.github.mbwallace1390.rotorlens;

import android.content.Context;

import com.google.gson.JsonObject;

import java.io.File;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Owns model verification, download, and one cancellable inference request. */
final class AdvisorAiService implements AutoCloseable {
    interface Responder {
        void send(String message);
    }

    // Supported devices vary widely; user cancellation remains available below this ceiling.
    private static final long INFERENCE_TIMEOUT_SECONDS = 120L;
    static final long STATUS_VERIFICATION_TIMEOUT_SECONDS = 120L;

    private final Object activeLock = new Object();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private final AdvisorModelDownloader downloader;
    private final AdvisorModelVerificationReceipt verificationReceipt;
    private final AdvisorAiRuntime runtime;

    private volatile boolean closed;
    private volatile boolean modelVerified;
    private ActiveOperation active;

    AdvisorAiService(Context context) {
        Context appContext = context.getApplicationContext();
        downloader = new AdvisorModelDownloader(appContext);
        verificationReceipt = new AdvisorModelVerificationReceipt(appContext);
        File runtimeCache = AdvisorModelSpec.runtimeCacheDirectory(appContext);
        if (!runtimeCache.isDirectory()) runtimeCache.mkdirs();
        runtime = new AdvisorAiRuntime(runtimeCache);
    }

    boolean hasActiveOperation() {
        synchronized (activeLock) {
            return active != null;
        }
    }

    void handleStatus(AdvisorAiProtocol.Request request, Responder responder) {
        if (!AdvisorModelSpec.isRuntimeSupported()) {
            sendStatus(request, responder, "unavailable");
            return;
        }
        if (closed) {
            sendError(request, responder, AdvisorAiProtocol.ERROR_UNAVAILABLE);
            return;
        }
        if (downloader.isDownloading()) {
            sendStatus(request, responder, "downloading");
            return;
        }
        ActiveOperation operation = begin(request, responder, AdvisorAiProtocol.TYPE_STATUS);
        if (operation == null) return;
        operation.future = worker.submit(() -> {
            boolean ready = verifyInstalledModel(operation.cancelled);
            if (finish(operation)) {
                sendStatus(request, responder, ready ? "ready" : "not-installed");
            }
        });
        operation.timeout = timer.schedule(
            () -> timeout(operation),
            STATUS_VERIFICATION_TIMEOUT_SECONDS,
            TimeUnit.SECONDS
        );
    }

    void startDownload(AdvisorAiProtocol.Request request, Responder responder) {
        if (!AdvisorModelSpec.isRuntimeSupported()) {
            sendError(request, responder, AdvisorAiProtocol.ERROR_UNAVAILABLE);
            return;
        }
        ActiveOperation operation = begin(request, responder, AdvisorAiProtocol.TYPE_DOWNLOAD);
        if (operation == null) return;

        boolean started = downloader.start(new AdvisorModelDownloader.Listener() {
            @Override
            public void onProgress(long downloadedBytes, long totalBytes) {
                if (!isCurrent(operation) || operation.cancelled.get()) return;
                JsonObject payload = AdvisorAiProtocol.contextPayload(request, "downloading");
                payload.addProperty("downloadedBytes", downloadedBytes);
                payload.addProperty("totalBytes", totalBytes);
                responder.send(AdvisorAiProtocol.reply(
                    AdvisorAiProtocol.TYPE_DOWNLOAD_PROGRESS,
                    request,
                    payload
                ));
            }

            @Override
            public void onComplete(AdvisorModelDownloader.Outcome outcome) {
                if (!finish(operation)) return;
                if (outcome == AdvisorModelDownloader.Outcome.READY) {
                    modelVerified = true;
                    verificationReceipt.record(downloader.getModelFile());
                    sendStatusWithType(
                        request,
                        responder,
                        AdvisorAiProtocol.TYPE_DOWNLOAD_RESULT,
                        "ready"
                    );
                } else if (outcome == AdvisorModelDownloader.Outcome.CANCELLED) {
                    sendError(request, responder, AdvisorAiProtocol.ERROR_CANCELLED);
                } else {
                    modelVerified = false;
                    sendError(request, responder, AdvisorAiProtocol.ERROR_DOWNLOAD_FAILED);
                }
            }
        });

        if (!started && finish(operation)) {
            sendError(request, responder, AdvisorAiProtocol.ERROR_BUSY);
        }
    }

    void explain(AdvisorAiProtocol.Request request, Responder responder) {
        if (!AdvisorModelSpec.isRuntimeSupported()) {
            sendError(request, responder, AdvisorAiProtocol.ERROR_UNAVAILABLE);
            return;
        }
        ActiveOperation operation = begin(request, responder, AdvisorAiProtocol.TYPE_EXPLAIN);
        if (operation == null) return;

        operation.future = worker.submit(() -> {
            try {
                if (!modelVerified && !verifyInstalledModel(operation.cancelled)) {
                    if (finish(operation)) {
                        sendError(
                            request,
                            responder,
                            AdvisorAiProtocol.ERROR_MODEL_NOT_INSTALLED
                        );
                    }
                    return;
                }
                if (operation.cancelled.get()) throw new CancellationException();
                String prompt = AdvisorAiProtocol.buildModelPrompt(request);
                String rawResult = runtime.generate(
                    downloader.getModelFile(),
                    prompt,
                    operation.cancelled
                );
                JsonObject result = AdvisorAiProtocol.validateModelResult(request, rawResult);
                if (finish(operation)) {
                    responder.send(AdvisorAiProtocol.reply(
                        AdvisorAiProtocol.TYPE_EXPLAIN_RESULT,
                        request,
                        result
                    ));
                }
            } catch (CancellationException error) {
                if (finish(operation)) {
                    sendError(request, responder, AdvisorAiProtocol.ERROR_CANCELLED);
                }
            } catch (AdvisorAiProtocol.ProtocolException error) {
                if (finish(operation)) {
                    sendError(request, responder, AdvisorAiProtocol.ERROR_INTERNAL);
                }
            } catch (Exception | LinkageError error) {
                if (finish(operation)) {
                    sendError(request, responder, AdvisorAiProtocol.ERROR_INTERNAL);
                }
            }
        });
        operation.timeout = timer.schedule(
            () -> timeout(operation),
            INFERENCE_TIMEOUT_SECONDS,
            TimeUnit.SECONDS
        );
    }

    void cancel(AdvisorAiProtocol.Request request) {
        ActiveOperation operation;
        synchronized (activeLock) {
            operation = active;
            if (operation == null || !operation.request.requestId.equals(request.requestId)) {
                return;
            }
            active = null;
        }
        cancelResources(operation);
    }

    void cancelForLifecycle() {
        cancelForLifecycle(false);
    }

    void cancelForBackground() {
        cancelForLifecycle(true);
    }

    private void cancelForLifecycle(boolean replyCancelled) {
        ActiveOperation operation;
        synchronized (activeLock) {
            operation = active;
            active = null;
        }
        if (operation != null) {
            cancelResources(operation);
            if (replyCancelled) {
                sendError(
                    operation.request,
                    operation.responder,
                    AdvisorAiProtocol.ERROR_CANCELLED
                );
            }
        }
    }

    private ActiveOperation begin(
        AdvisorAiProtocol.Request request,
        Responder responder,
        String type
    ) {
        synchronized (activeLock) {
            if (closed) {
                sendError(request, responder, AdvisorAiProtocol.ERROR_UNAVAILABLE);
                return null;
            }
            if (active != null) {
                sendError(request, responder, AdvisorAiProtocol.ERROR_BUSY);
                return null;
            }
            active = new ActiveOperation(request, responder, type);
            return active;
        }
    }

    private boolean finish(ActiveOperation operation) {
        synchronized (activeLock) {
            if (active != operation) return false;
            active = null;
        }
        ScheduledFuture<?> timeout = operation.timeout;
        if (timeout != null) timeout.cancel(false);
        return !operation.cancelled.get();
    }

    private boolean isCurrent(ActiveOperation operation) {
        synchronized (activeLock) {
            return active == operation;
        }
    }

    private void timeout(ActiveOperation operation) {
        synchronized (activeLock) {
            if (active != operation) return;
            active = null;
        }
        operation.cancelled.set(true);
        if (AdvisorAiProtocol.TYPE_EXPLAIN.equals(operation.type)) {
            cancelRuntimeQuietly();
        }
        Future<?> future = operation.future;
        if (future != null) future.cancel(true);
        sendError(
            operation.request,
            operation.responder,
            AdvisorAiProtocol.ERROR_TIMEOUT
        );
    }

    private void cancelResources(ActiveOperation operation) {
        operation.cancelled.set(true);
        ScheduledFuture<?> timeout = operation.timeout;
        if (timeout != null) timeout.cancel(false);
        if (AdvisorAiProtocol.TYPE_DOWNLOAD.equals(operation.type)) {
            downloader.cancel();
        } else if (AdvisorAiProtocol.TYPE_EXPLAIN.equals(operation.type)) {
            cancelRuntimeQuietly();
            Future<?> future = operation.future;
            if (future != null) future.cancel(true);
        } else {
            Future<?> future = operation.future;
            if (future != null) future.cancel(true);
        }
    }

    private boolean verifyInstalledModel(AtomicBoolean cancellation) {
        if (modelVerified) return true;
        File modelFile = downloader.getModelFile();
        if (verificationReceipt.matches(modelFile)) {
            modelVerified = true;
            return true;
        }
        verificationReceipt.clear();
        boolean ready = AdvisorModelVerifier.verifyPinnedModel(
            modelFile,
            cancellation
        )
            == AdvisorModelVerifier.Result.VALID;
        modelVerified = ready;
        if (ready) {
            verificationReceipt.record(modelFile);
        } else {
            verificationReceipt.clear();
        }
        return ready;
    }

    private static void sendStatus(
        AdvisorAiProtocol.Request request,
        Responder responder,
        String state
    ) {
        sendStatusWithType(
            request,
            responder,
            AdvisorAiProtocol.TYPE_STATUS_RESULT,
            state
        );
    }

    private static void sendStatusWithType(
        AdvisorAiProtocol.Request request,
        Responder responder,
        String type,
        String state
    ) {
        responder.send(AdvisorAiProtocol.reply(
            type,
            request,
            AdvisorAiProtocol.contextPayload(request, state)
        ));
    }

    private static void sendError(
        AdvisorAiProtocol.Request request,
        Responder responder,
        String code
    ) {
        responder.send(AdvisorAiProtocol.reply(
            AdvisorAiProtocol.TYPE_ERROR,
            request,
            AdvisorAiProtocol.errorPayload(request, code)
        ));
    }

    private void cancelRuntimeQuietly() {
        try {
            runtime.cancelActive();
        } catch (RuntimeException | LinkageError ignored) {
            // Cancellation is best effort; cleanup and stale-response guards remain active.
        }
    }

    @Override
    public void close() {
        closed = true;
        cancelForLifecycle();
        downloader.close();
        try {
            runtime.close();
        } catch (RuntimeException | LinkageError ignored) {
            // Do not let a JNI teardown failure prevent executor shutdown.
        } finally {
            worker.shutdownNow();
            timer.shutdownNow();
        }
    }

    private static final class ActiveOperation {
        final AdvisorAiProtocol.Request request;
        final Responder responder;
        final String type;
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        volatile Future<?> future;
        volatile ScheduledFuture<?> timeout;

        ActiveOperation(
            AdvisorAiProtocol.Request request,
            Responder responder,
            String type
        ) {
            this.request = request;
            this.responder = responder;
            this.type = type;
        }
    }
}
