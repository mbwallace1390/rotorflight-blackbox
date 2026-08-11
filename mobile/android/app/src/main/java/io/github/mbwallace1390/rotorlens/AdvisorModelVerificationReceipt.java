package io.github.mbwallace1390.rotorlens;

import android.content.Context;
import android.system.ErrnoException;
import android.system.Os;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Small app-private performance receipt for an already SHA-verified model.
 *
 * <p>The receipt is never a replacement for verification: missing or changed
 * metadata falls back to a full size/SHA scan. It contains the complete pinned
 * model identity and the exact file length/mtime observed after verification.
 */
final class AdvisorModelVerificationReceipt {
    interface AtomicPublisher {
        void publish(File partial, File target) throws IOException;
    }

    private static final int RECEIPT_VERSION = 1;
    private static final int MAX_RECEIPT_BYTES = 4 * 1024;
    private static final Pattern JSON_INTEGER = Pattern.compile("(0|[1-9][0-9]*)");
    private static final Set<String> RECEIPT_KEYS = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList(
            "receiptVersion",
            "repository",
            "revision",
            "fileName",
            "expectedBytes",
            "sha256",
            "fileBytes",
            "fileLastModifiedMs"
        ))
    );

    private final File receiptFile;
    private final File partialFile;
    private final AtomicPublisher publisher;
    private final long expectedBytes;

    AdvisorModelVerificationReceipt(Context context) {
        this(
            AdvisorModelSpec.verificationReceiptFile(context),
            AdvisorModelSpec.verificationReceiptPartialFile(context),
            AdvisorModelVerificationReceipt::publishWithOsRename,
            AdvisorModelSpec.MODEL_BYTES
        );
    }

    AdvisorModelVerificationReceipt(
        File receiptFile,
        File partialFile,
        AtomicPublisher publisher,
        long expectedBytes
    ) {
        this.receiptFile = receiptFile;
        this.partialFile = partialFile;
        this.publisher = publisher;
        this.expectedBytes = expectedBytes;
    }

    boolean matches(File modelFile) {
        if (!validModelMetadata(modelFile) || !receiptFile.isFile()) return false;
        try {
            byte[] encoded = readBounded(receiptFile);
            if (encoded == null) return false;
            JsonElement parsed = JsonParser.parseString(
                new String(encoded, StandardCharsets.UTF_8)
            );
            if (!parsed.isJsonObject()) return false;
            JsonObject receipt = parsed.getAsJsonObject();
            return receipt.keySet().equals(RECEIPT_KEYS)
                && exactLong(receipt, "receiptVersion") == RECEIPT_VERSION
                && exactString(receipt, "repository").equals(
                    AdvisorModelSpec.MODEL_REPOSITORY
                )
                && exactString(receipt, "revision").equals(
                    AdvisorModelSpec.MODEL_REVISION
                )
                && exactString(receipt, "fileName").equals(
                    AdvisorModelSpec.MODEL_FILE_NAME
                )
                && exactLong(receipt, "expectedBytes") == expectedBytes
                && exactString(receipt, "sha256").equals(
                    AdvisorModelSpec.MODEL_SHA256
                )
                && exactLong(receipt, "fileBytes") == modelFile.length()
                && exactLong(receipt, "fileLastModifiedMs") == modelFile.lastModified();
        } catch (IOException | RuntimeException error) {
            return false;
        }
    }

    boolean record(File modelFile) {
        if (!validModelMetadata(modelFile)) return false;
        File directory = receiptFile.getParentFile();
        if (directory == null || (!directory.isDirectory() && !directory.mkdirs())) {
            return false;
        }
        if (partialFile.exists() && !partialFile.delete()) return false;

        JsonObject receipt = new JsonObject();
        receipt.addProperty("receiptVersion", RECEIPT_VERSION);
        receipt.addProperty("repository", AdvisorModelSpec.MODEL_REPOSITORY);
        receipt.addProperty("revision", AdvisorModelSpec.MODEL_REVISION);
        receipt.addProperty("fileName", AdvisorModelSpec.MODEL_FILE_NAME);
        receipt.addProperty("expectedBytes", expectedBytes);
        receipt.addProperty("sha256", AdvisorModelSpec.MODEL_SHA256);
        receipt.addProperty("fileBytes", modelFile.length());
        receipt.addProperty("fileLastModifiedMs", modelFile.lastModified());
        byte[] encoded = receipt.toString().getBytes(StandardCharsets.UTF_8);
        if (encoded.length > MAX_RECEIPT_BYTES) return false;

        try (FileOutputStream output = new FileOutputStream(partialFile, false)) {
            output.write(encoded);
            output.flush();
            output.getFD().sync();
        } catch (IOException error) {
            partialFile.delete();
            return false;
        }

        try {
            publisher.publish(partialFile, receiptFile);
            boolean published = receiptFile.isFile()
                && receiptFile.length() == encoded.length;
            if (!published) clear();
            return published;
        } catch (IOException | RuntimeException error) {
            clear();
            return false;
        }
    }

    void clear() {
        if (receiptFile.isFile()) receiptFile.delete();
        if (partialFile.isFile()) partialFile.delete();
    }

    private boolean validModelMetadata(File modelFile) {
        return modelFile != null
            && modelFile.isFile()
            && modelFile.length() == expectedBytes
            && modelFile.lastModified() > 0L;
    }

    private static byte[] readBounded(File file) throws IOException {
        try (
            FileInputStream input = new FileInputStream(file);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[512];
            int total = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > MAX_RECEIPT_BYTES) return null;
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private static String exactString(JsonObject object, String key) {
        JsonElement element = object.get(key);
        if (element == null
            || !element.isJsonPrimitive()
            || !element.getAsJsonPrimitive().isString()) {
            throw new IllegalArgumentException("Receipt string was invalid");
        }
        return element.getAsString();
    }

    private static long exactLong(JsonObject object, String key) {
        JsonElement element = object.get(key);
        if (element == null || !element.isJsonPrimitive()) {
            throw new IllegalArgumentException("Receipt integer was invalid");
        }
        JsonPrimitive primitive = element.getAsJsonPrimitive();
        if (!primitive.isNumber() || !JSON_INTEGER.matcher(primitive.getAsString()).matches()) {
            throw new IllegalArgumentException("Receipt integer was invalid");
        }
        return primitive.getAsLong();
    }

    private static void publishWithOsRename(File partial, File target) throws IOException {
        try {
            Os.rename(partial.getAbsolutePath(), target.getAbsolutePath());
        } catch (ErrnoException error) {
            throw new IOException("Could not publish the model verification receipt", error);
        }
    }
}
