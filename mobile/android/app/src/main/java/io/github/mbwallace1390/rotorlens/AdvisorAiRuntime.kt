package io.github.mbwallace1390.rotorlens

import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.ThinkingConfig
import java.io.Closeable
import java.io.File
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

/** Small, CPU-first LiteRT-LM adapter. It never performs network I/O. */
internal class AdvisorAiRuntime(private val cacheDirectory: File) : Closeable {
    private val lifecycleLock = Any()

    @Volatile
    private var closed = false

    @Volatile
    private var activeConversation: Conversation? = null

    @Throws(Exception::class)
    fun generate(modelFile: File, prompt: String, cancelled: AtomicBoolean): String {
        check(!closed) { "AI runtime is closed" }
        if (cancelled.get()) throw CancellationException("AI request cancelled")

        val engine = Engine(
            EngineConfig(
                modelPath = modelFile.absolutePath,
                backend = Backend.CPU(),
                cacheDir = cacheDirectory.absolutePath,
            ),
        )
        try {
            engine.initialize()
            if (cancelled.get() || closed) {
                throw CancellationException("AI request cancelled")
            }

            val conversation = engine.createConversation(
                ConversationConfig(
                    systemInstruction = Contents.of(SYSTEM_INSTRUCTION),
                    samplerConfig = SamplerConfig(
                        topK = 1,
                        topP = 1.0,
                        temperature = 0.0,
                        seed = 0,
                    ),
                    maxOutputToken = MAX_OUTPUT_TOKENS,
                    thinkingConfig = ThinkingConfig(enableThinking = false),
                ),
            )

            synchronized(lifecycleLock) {
                if (closed || cancelled.get()) {
                    conversation.close()
                    throw CancellationException("AI request cancelled")
                }
                activeConversation = conversation
            }

            try {
                val response = conversation.sendMessage("/no_think\n$prompt")
                if (cancelled.get() || closed) {
                    throw CancellationException("AI request cancelled")
                }
                return response.contents.contents
                    .filterIsInstance<Content.Text>()
                    .joinToString(separator = "") { it.text }
            } finally {
                synchronized(lifecycleLock) {
                    if (activeConversation === conversation) activeConversation = null
                }
                conversation.close()
            }
        } finally {
            engine.close()
        }
    }

    fun cancelActive() {
        try {
            activeConversation?.cancelProcess()
        } catch (_: RuntimeException) {
            // Native cancellation is best effort; lifecycle cleanup must still complete.
        } catch (_: LinkageError) {
            // A missing/incompatible JNI symbol must not strand the active operation.
        }
    }

    override fun close() {
        closed = true
        cancelActive()
    }

    private companion object {
        const val MAX_OUTPUT_TOKENS = 96
        const val SYSTEM_INSTRUCTION =
            "You are RotorLens AI Coach. Prioritize only the supplied validated status and " +
                "reason codes. Return one compact JSON object and nothing else. Never invent " +
                "measurements, settings, evidence, reasons, codes, or tuning directions. Copy " +
                "one message code and one next-step code only from the supplied focus arrays."
    }
}
