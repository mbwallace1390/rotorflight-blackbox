package io.github.mbwallace1390.rotorlens;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class AdvisorModelVerificationReceiptTest {
    private static final byte[] MODEL_BYTES = {1, 2, 3, 4};

    @Rule
    public final TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void recordsAndMatchesExactPinnedMetadata() throws Exception {
        File model = modelFile();
        AdvisorModelVerificationReceipt receipt = receipt();

        assertTrue(receipt.record(model));
        assertTrue(receipt.matches(model));
    }

    @Test
    public void missingReceiptFallsBackToVerification() throws Exception {
        assertFalse(receipt().matches(modelFile()));
    }

    @Test
    public void changedSizeOrMtimeInvalidatesReceipt() throws Exception {
        File model = modelFile();
        AdvisorModelVerificationReceipt receipt = receipt();
        assertTrue(receipt.record(model));

        long recordedMtime = model.lastModified();
        assertTrue(model.setLastModified(recordedMtime + 2_000L));
        assertFalse(receipt.matches(model));

        assertTrue(receipt.record(model));
        try (FileOutputStream output = new FileOutputStream(model, true)) {
            output.write(5);
        }
        assertFalse(receipt.matches(model));
    }

    @Test
    public void changedIdentityOrExtraFieldInvalidatesReceipt() throws Exception {
        File model = modelFile();
        AdvisorModelVerificationReceipt receipt = receipt();
        assertTrue(receipt.record(model));
        File receiptFile = new File(temporary.getRoot(), "verification.json");

        JsonObject value = JsonParser.parseString(
            new String(Files.readAllBytes(receiptFile.toPath()), StandardCharsets.UTF_8)
        ).getAsJsonObject();
        value.addProperty("revision", "different-revision");
        Files.write(
            receiptFile.toPath(),
            value.toString().getBytes(StandardCharsets.UTF_8)
        );
        assertFalse(receipt.matches(model));

        assertTrue(receipt.record(model));
        value = JsonParser.parseString(
            new String(Files.readAllBytes(receiptFile.toPath()), StandardCharsets.UTF_8)
        ).getAsJsonObject();
        value.addProperty("unexpected", true);
        Files.write(
            receiptFile.toPath(),
            value.toString().getBytes(StandardCharsets.UTF_8)
        );
        assertFalse(receipt.matches(model));
    }

    @Test
    public void failedPublishLeavesNoTrustedReceipt() throws Exception {
        File receiptFile = new File(temporary.getRoot(), "failed-verification.json");
        File partialFile = new File(temporary.getRoot(), "failed-verification.partial");
        AdvisorModelVerificationReceipt receipt = new AdvisorModelVerificationReceipt(
            receiptFile,
            partialFile,
            (partial, target) -> {
                throw new IOException("simulated atomic publish failure");
            },
            MODEL_BYTES.length
        );

        assertFalse(receipt.record(modelFile()));
        assertFalse(receiptFile.exists());
        assertFalse(partialFile.exists());
    }

    private File modelFile() throws IOException {
        File model = new File(temporary.getRoot(), AdvisorModelSpec.MODEL_FILE_NAME);
        try (FileOutputStream output = new FileOutputStream(model, false)) {
            output.write(MODEL_BYTES);
        }
        return model;
    }

    private AdvisorModelVerificationReceipt receipt() {
        File receiptFile = new File(temporary.getRoot(), "verification.json");
        File partialFile = new File(temporary.getRoot(), "verification.partial");
        return new AdvisorModelVerificationReceipt(
            receiptFile,
            partialFile,
            (partial, target) -> {
                if (target.exists() && !target.delete()) {
                    throw new IOException("Could not replace test receipt");
                }
                if (!partial.renameTo(target)) {
                    throw new IOException("Could not publish test receipt");
                }
            },
            MODEL_BYTES.length
        );
    }
}
