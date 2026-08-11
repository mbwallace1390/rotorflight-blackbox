package io.github.mbwallace1390.rotorlens;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class AdvisorModelVerifierTest {
    @Rule
    public final TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void missingModelFailsClosed() {
        File missing = new File(temporaryFolder.getRoot(), "missing.litertlm");

        assertEquals(
            AdvisorModelVerifier.Result.MISSING,
            AdvisorModelVerifier.verify(missing, 3L, sha256OfAbc())
        );
    }

    @Test
    public void wrongByteCountIsRejectedBeforeHash() throws Exception {
        File model = write("model.litertlm", "ab");

        assertEquals(
            AdvisorModelVerifier.Result.SIZE_MISMATCH,
            AdvisorModelVerifier.verify(model, 3L, sha256OfAbc())
        );
    }

    @Test
    public void wrongHashIsRejected() throws Exception {
        File model = write("model.litertlm", "abd");

        assertEquals(
            AdvisorModelVerifier.Result.HASH_MISMATCH,
            AdvisorModelVerifier.verify(model, 3L, sha256OfAbc())
        );
    }

    @Test
    public void exactByteCountAndHashAreAccepted() throws Exception {
        File model = write("model.litertlm", "abc");

        assertEquals(
            AdvisorModelVerifier.Result.VALID,
            AdvisorModelVerifier.verify(model, 3L, sha256OfAbc())
        );
        assertEquals(sha256OfAbc(), AdvisorModelVerifier.sha256(model));
    }

    @Test
    public void cancellationStopsVerification() throws Exception {
        File model = write("model.litertlm", "abc");

        assertEquals(
            AdvisorModelVerifier.Result.CANCELLED,
            AdvisorModelVerifier.verify(
                model,
                3L,
                sha256OfAbc(),
                new AtomicBoolean(true)
            )
        );
    }

    @Test
    public void pinnedUrlContainsImmutableRevisionAndFile() {
        assertTrue(AdvisorModelSpec.MODEL_URL.startsWith("https://huggingface.co/"));
        assertTrue(AdvisorModelSpec.MODEL_URL.contains(AdvisorModelSpec.MODEL_REVISION));
        assertTrue(AdvisorModelSpec.MODEL_URL.endsWith(AdvisorModelSpec.MODEL_FILE_NAME));
        assertEquals(344_437_808L, AdvisorModelSpec.MODEL_BYTES);
        assertEquals(64, AdvisorModelSpec.MODEL_SHA256.length());
    }

    private File write(String name, String contents) throws Exception {
        File file = temporaryFolder.newFile(name);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(contents.getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    private static String sha256OfAbc() {
        return "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    }
}
