package io.github.mbwallace1390.rotorlens;

import android.content.Context;
import android.system.ErrnoException;
import android.system.Os;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-triggered, pinned, verified model download into app-private storage. */
final class AdvisorModelDownloader implements AutoCloseable {
    interface Listener {
        void onProgress(long downloadedBytes, long totalBytes);

        void onComplete(Outcome outcome);
    }

    enum Outcome {
        READY,
        CANCELLED,
        FAILED
    }

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 15_000;
    private static final int MAX_REDIRECTS = 5;
    private static final int BUFFER_BYTES = 128 * 1024;
    private static final long PROGRESS_STEP_BYTES = 512 * 1024L;

    private final File modelDirectory;
    private final File modelFile;
    private final File partialFile;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Object stateLock = new Object();

    private volatile HttpURLConnection activeConnection;
    private volatile AtomicBoolean activeCancellation;
    private volatile Future<?> activeFuture;
    private volatile long downloadedBytes;

    AdvisorModelDownloader(Context context) {
        Context appContext = context.getApplicationContext();
        modelDirectory = AdvisorModelSpec.directory(appContext);
        modelFile = AdvisorModelSpec.modelFile(appContext);
        partialFile = AdvisorModelSpec.partialFile(appContext);
    }

    File getModelFile() {
        return modelFile;
    }

    long getDownloadedBytes() {
        return downloadedBytes;
    }

    boolean isDownloading() {
        Future<?> future = activeFuture;
        return future != null && !future.isDone();
    }

    boolean start(Listener listener) {
        synchronized (stateLock) {
            if (activeFuture != null && !activeFuture.isDone()) {
                return false;
            }
            AtomicBoolean cancellation = new AtomicBoolean(false);
            activeCancellation = cancellation;
            downloadedBytes = 0L;
            activeFuture = executor.submit(() -> download(cancellation, listener));
            return true;
        }
    }

    void cancel() {
        AtomicBoolean cancellation = activeCancellation;
        if (cancellation != null) {
            cancellation.set(true);
        }
        HttpURLConnection connection = activeConnection;
        if (connection != null) {
            connection.disconnect();
        }
        Future<?> future = activeFuture;
        if (future != null) {
            future.cancel(true);
        }
    }

    private void download(AtomicBoolean cancellation, Listener listener) {
        Outcome outcome = Outcome.FAILED;
        try {
            if (AdvisorModelVerifier.verifyPinnedModel(modelFile, cancellation)
                == AdvisorModelVerifier.Result.VALID) {
                outcome = Outcome.READY;
                return;
            }
            ensureNotCancelled(cancellation);
            if (!modelDirectory.isDirectory() && !modelDirectory.mkdirs()) {
                throw new IOException("Could not create the private model directory");
            }
            if (partialFile.exists() && !partialFile.delete()) {
                throw new IOException("Could not remove an incomplete model download");
            }

            MessageDigest digest = sha256Digest();
            HttpURLConnection connection = openPinnedConnection(cancellation);
            activeConnection = connection;
            long responseBytes = connection.getContentLengthLong();
            if (responseBytes >= 0L && responseBytes != AdvisorModelSpec.MODEL_BYTES) {
                throw new IOException("Pinned model response has an unexpected size");
            }

            long total = 0L;
            long nextProgress = 0L;
            try (
                InputStream input = new BufferedInputStream(connection.getInputStream());
                FileOutputStream output = new FileOutputStream(partialFile, false)
            ) {
                byte[] buffer = new byte[BUFFER_BYTES];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    ensureNotCancelled(cancellation);
                    total += count;
                    if (total > AdvisorModelSpec.MODEL_BYTES) {
                        throw new IOException("Pinned model response exceeded its expected size");
                    }
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                    downloadedBytes = total;
                    if (total >= nextProgress) {
                        listener.onProgress(total, AdvisorModelSpec.MODEL_BYTES);
                        nextProgress = total + PROGRESS_STEP_BYTES;
                    }
                }
                output.flush();
                output.getFD().sync();
            } finally {
                connection.disconnect();
                activeConnection = null;
            }

            ensureNotCancelled(cancellation);
            if (total != AdvisorModelSpec.MODEL_BYTES
                || !AdvisorModelSpec.MODEL_SHA256.equals(hex(digest.digest()))) {
                throw new IOException("Pinned model verification failed");
            }

            publishAtomically(partialFile, modelFile);
            // The streamed bytes were already length- and SHA-verified, and
            // rename publishes that exact inode without another 329 MiB read.
            if (!modelFile.isFile() || modelFile.length() != AdvisorModelSpec.MODEL_BYTES) {
                throw new IOException("Published model size changed unexpectedly");
            }
            downloadedBytes = AdvisorModelSpec.MODEL_BYTES;
            listener.onProgress(downloadedBytes, AdvisorModelSpec.MODEL_BYTES);
            outcome = Outcome.READY;
        } catch (CancellationException error) {
            outcome = Outcome.CANCELLED;
        } catch (IOException | RuntimeException error) {
            outcome = cancellation.get() ? Outcome.CANCELLED : Outcome.FAILED;
        } finally {
            if (outcome != Outcome.READY && partialFile.exists()) {
                partialFile.delete();
            }
            synchronized (stateLock) {
                if (activeCancellation == cancellation) {
                    activeCancellation = null;
                    activeFuture = null;
                }
            }
            listener.onComplete(outcome);
        }
    }

    private HttpURLConnection openPinnedConnection(AtomicBoolean cancellation)
        throws IOException {
        URL url = new URL(AdvisorModelSpec.MODEL_URL);
        for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
            ensureNotCancelled(cancellation);
            if (!"https".equalsIgnoreCase(url.getProtocol())) {
                throw new IOException("Refusing a non-HTTPS model URL");
            }

            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Accept", "application/octet-stream");
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_OK) {
                String encoding = connection.getContentEncoding();
                if (encoding != null && !"identity".equalsIgnoreCase(encoding)) {
                    connection.disconnect();
                    throw new IOException("Refusing transformed model bytes");
                }
                return connection;
            }

            if (status != HttpURLConnection.HTTP_MOVED_PERM
                && status != HttpURLConnection.HTTP_MOVED_TEMP
                && status != HttpURLConnection.HTTP_SEE_OTHER
                && status != 307
                && status != 308) {
                connection.disconnect();
                throw new IOException("Model server returned HTTP " + status);
            }

            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null || redirects == MAX_REDIRECTS) {
                throw new IOException("Model redirect was invalid");
            }
            URL redirected = new URL(url, location);
            if (!"https".equalsIgnoreCase(redirected.getProtocol())) {
                throw new IOException("Refusing an insecure model redirect");
            }
            url = redirected;
        }
        throw new IOException("Too many model redirects");
    }

    private static MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new AssertionError("Every Android runtime provides SHA-256", impossible);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte octet : bytes) {
            value.append(String.format(Locale.ROOT, "%02x", octet & 0xff));
        }
        return value.toString();
    }

    private static void publishAtomically(File partial, File target) throws IOException {
        try {
            // Both files are in one app-private directory; Linux rename is atomic.
            Os.rename(partial.getAbsolutePath(), target.getAbsolutePath());
        } catch (ErrnoException error) {
            throw new IOException("Could not publish the verified model", error);
        }
    }

    private static void ensureNotCancelled(AtomicBoolean cancellation) {
        if (cancellation.get() || Thread.currentThread().isInterrupted()) {
            throw new CancellationException("Model download cancelled");
        }
    }

    @Override
    public void close() {
        cancel();
        executor.shutdownNow();
    }
}
