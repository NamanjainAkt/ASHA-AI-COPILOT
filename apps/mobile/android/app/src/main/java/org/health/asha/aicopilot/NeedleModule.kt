package org.health.asha.aicopilot

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Needle 3 native module (Implementation Prompt §2-3).
 * Thin bridge over the Needle static engine (libneedle.a via needle_jni):
 * load .cact weights, init grammar-constrained tools, complete text→JSON.
 * No clinical decisions here — output is validated against Needle schemas in JS.
 */
class NeedleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NeedleModule"

    private external fun needleLoad(cactPath: String): Int
    private external fun needleInit(systemPrompt: String, toolsJson: String): Int
    private external fun needleComplete(input: String, maxTokens: Int): String?
    private external fun needleReset()
    private external fun needleLastError(): String

    companion object {
        private var libLoaded = false

        const val NEEDLE_SYSTEM_PROMPT =
            "You extract ASHA field-screening facts from a Hindi/Hinglish transcript into JSON. " +
            "Extract ONLY information stated or clearly implied by the transcript. " +
            "Every field is {value, state} with state known, unknown, uncertain, or not_applicable. " +
            "NEVER invent numbers, names, or symptoms. Do NOT diagnose or assess risk. Output JSON only."

        @Synchronized
        fun ensureLib(): Boolean {
            if (libLoaded) return true
            return try {
                System.loadLibrary("needle_jni")
                libLoaded = true
                true
            } catch (_: UnsatisfiedLinkError) {
                false
            }
        }
    }

    @ReactMethod
    fun load(cactPath: String, promise: Promise) {
        try {
            if (!ensureLib()) {
                promise.reject("NOT_SUPPORTED", "Needle engine not built for this ABI")
                return
            }
            val models = needleLoad(cactPath)
            if (models < 0) {
                promise.reject("LOAD_FAILED", needleLastError().ifEmpty { "needle_load failed for $cactPath" })
                return
            }
            val map = Arguments.createMap()
            map.putBoolean("loaded", true)
            map.putInt("models", models)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message ?: "Needle load failed")
        }
    }

    @ReactMethod
    fun init(systemPrompt: String, toolsJson: String, promise: Promise) {
        try {
            if (!ensureLib()) {
                promise.reject("NOT_SUPPORTED", "Needle engine not built for this ABI")
                return
            }
            val prefixLen = needleInit(systemPrompt, toolsJson)
            if (prefixLen < 0) {
                promise.reject("INIT_FAILED", needleLastError().ifEmpty { "needle_init failed" })
                return
            }
            val map = Arguments.createMap()
            map.putBoolean("ready", true)
            map.putInt("prefixTokens", prefixLen)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message ?: "Needle init failed")
        }
    }

    @ReactMethod
    fun complete(input: String, toolsJson: String, maxTokens: Int, promise: Promise) {
        try {
            if (!ensureLib()) {
                promise.reject("NOT_SUPPORTED", "Needle engine not built for this ABI")
                return
            }
            val prefixLen = needleInit(NEEDLE_SYSTEM_PROMPT, toolsJson)
            if (prefixLen < 0) {
                promise.reject("INIT_FAILED", needleLastError().ifEmpty { "needle_init failed" })
                return
            }
            val json = needleComplete(input, maxTokens)
            if (json == null) {
                promise.reject("COMPLETE_FAILED", needleLastError().ifEmpty { "needle_complete failed" })
                return
            }
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("COMPLETE_ERROR", e.message ?: "Needle complete failed")
        }
    }

    @ReactMethod
    fun reset(promise: Promise) {
        try {
            if (ensureLib()) needleReset()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESET_ERROR", e.message ?: "Needle reset failed")
        }
    }

    @ReactMethod
    fun lastError(promise: Promise) {
        try {
            promise.resolve(if (ensureLib()) needleLastError() else "")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Failed to read last error")
        }
    }
}
