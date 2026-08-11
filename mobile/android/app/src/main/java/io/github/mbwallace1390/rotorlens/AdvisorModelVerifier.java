package io.github.mbwallace1390.rotorlens;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Verifies model identity before the runtime is allowed to open it. */
final class AdvisorModelVerifier {
    enum Result {
        VALID,
        MISSING,
        SIZE_MISMATCH,
        HASH_MISMATCH,
        IO_ERROR,
        CANCELLED
    }

    private AdvisorModelVerifier() {}

    static Result verifyPinnedModel(File file) {
        return verify(file, AdvisorModelSpec.MODEL_BYTES, AdvisorModelSpec.MODEL_SHA256);
    }

    static Result verifyPinnedModel(File file, AtomicBoolean cancellation) {
        return verify(
            file,
            AdvisorModelSpec.MODEL_BYTES,
            AdvisorModelSpec.MODEL_SHA256,
            cancellation
        );
    }

    static Result verify(File file, long expectedBytes, String expectedSha256) {
        return verify(file, expectedBytes, expectedSha256, null);
    }

    static Result verify(
        File file,
        long expectedBytes,
        String expectedSha256,
        AtomicBoolean cancellation
    ) {
        if (file == null || !file.isFile()) {
            return Result.MISSING;
        }
        if (file.length() != expectedBytes) {
            return Result.SIZE_MISMATCH;
        }
        try {
            return expectedSha256.equalsIgnoreCase(sha256(file, cancellation))
                ? Result.VALID
                : Result.HASH_MISMATCH;
        } catch (CancellationException error) {
            return Result.CANCELLED;
        } catch (IOException error) {
            return Result.IO_ERROR;
        }
    }

    static String sha256(File file) throws IOException {
        return sha256(file, null);
    }

    private static String sha256(File file, AtomicBoolean cancellation) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new AssertionError("Every Android runtime provides SHA-256", impossible);
        }

        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[128 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if ((cancellation != null && cancellation.get())
                    || Thread.currentThread().isInterrupted()) {
                    throw new CancellationException("Model verification cancelled");
                }
                digest.update(buffer, 0, count);
            }
        }

        StringBuilder value = new StringBuilder(64);
        for (byte octet : digest.digest()) {
            value.append(String.format(Locale.ROOT, "%02x", octet & 0xff));
        }
        return value.toString();
    }
}
