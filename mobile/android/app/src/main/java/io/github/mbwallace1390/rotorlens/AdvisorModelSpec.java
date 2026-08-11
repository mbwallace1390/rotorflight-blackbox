package io.github.mbwallace1390.rotorlens;

import android.content.Context;
import android.os.Build;

import java.io.File;

/** Immutable identity for the only model RotorLens will download and execute. */
final class AdvisorModelSpec {
    static final String MODEL_REPOSITORY = "litert-community/Qwen3-0.6B";
    static final String MODEL_REVISION =
        "8414150f2e9dcc82449bcc9c5abc404b399a4d06";
    static final String MODEL_FILE_NAME =
        "Qwen3-0.6B_dynamic_wi4b32_afp32.litertlm";
    static final long MODEL_BYTES = 344_437_808L;
    static final String MODEL_SHA256 =
        "e3e290109da4388d65a17510a0c66af91c8039f52d2c465868dbc43c09a776cf";
    static final String MODEL_URL =
        "https://huggingface.co/litert-community/Qwen3-0.6B/resolve/"
            + MODEL_REVISION
            + "/"
            + MODEL_FILE_NAME;

    private static final String MODEL_DIRECTORY_NAME = "advisor-ai";
    private static final String RECEIPT_FILE_NAME = "verification-v1.json";

    private AdvisorModelSpec() {}

    static File directory(Context context) {
        return new File(context.getFilesDir(), MODEL_DIRECTORY_NAME);
    }

    static File modelFile(Context context) {
        return new File(directory(context), MODEL_FILE_NAME);
    }

    static File partialFile(Context context) {
        return new File(directory(context), MODEL_FILE_NAME + ".partial");
    }

    static File verificationReceiptFile(Context context) {
        return new File(directory(context), RECEIPT_FILE_NAME);
    }

    static File verificationReceiptPartialFile(Context context) {
        return new File(directory(context), RECEIPT_FILE_NAME + ".partial");
    }

    static File runtimeCacheDirectory(Context context) {
        return new File(context.getCacheDir(), "advisor-ai-runtime");
    }

    static boolean isRuntimeSupported() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return false;
        }
        for (String abi : Build.SUPPORTED_ABIS) {
            if ("arm64-v8a".equals(abi) || "x86_64".equals(abi)) {
                return true;
            }
        }
        return false;
    }
}
