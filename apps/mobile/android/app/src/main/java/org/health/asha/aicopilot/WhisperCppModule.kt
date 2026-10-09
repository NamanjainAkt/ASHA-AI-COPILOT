package org.health.asha.aicopilot

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * whisper.cpp STT module (offline Hindi).
 * Thin bridge over whisper.cpp built for arm64-v8a: load ggml model once,
 * transcribe 16kHz mono 16-bit PCM files on mic stop, unload to free RAM.
 * No network, no cloud, no Google services involved.
 */
class WhisperCppModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WhisperCppModule"

    private external fun whisperInit(modelPath: String): Long
    private external fun whisperTranscribeFile(handle: Long, audioPath: String, language: String): String?
    private external fun whisperFree(handle: Long)

    companion object {
        private var libLoaded = false

        @Synchronized
        fun ensureLib(): Boolean {
            if (libLoaded) return true
            return try {
                System.loadLibrary("whisper_asha")
                libLoaded = true
                true
            } catch (_: UnsatisfiedLinkError) {
                false
            }
        }
    }

    @ReactMethod
    fun load(modelPath: String, promise: Promise) {
        try {
            if (!ensureLib()) {
                promise.reject("NOT_SUPPORTED", "whisper.cpp engine not built for this ABI")
                return
            }
            val handle = whisperInit(modelPath)
            if (handle == 0L) {
                promise.reject("LOAD_FAILED", "whisper_init failed for $modelPath")
                return
            }
            val map = Arguments.createMap()
            map.putBoolean("loaded", true)
            map.putString("handle", handle.toString())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message ?: "whisper.cpp load failed")
        }
    }

    @ReactMethod
    fun transcribe(handleStr: String, audioPath: String, language: String, promise: Promise) {
        try {
            if (!ensureLib()) {
                promise.reject("NOT_SUPPORTED", "whisper.cpp engine not built for this ABI")
                return
            }
            val handle = handleStr.toLongOrNull() ?: 0L
            if (handle == 0L) {
                promise.reject("NO_HANDLE", "whisper.cpp model not loaded")
                return
            }
            val json = whisperTranscribeFile(handle, audioPath, language) ?: "{\"error\":\"null result\"}"
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("TRANSCRIBE_ERROR", e.message ?: "whisper.cpp transcribe failed")
        }
    }

    @ReactMethod
    fun unload(handleStr: String, promise: Promise) {
        try {
            val handle = handleStr.toLongOrNull() ?: 0L
            if (handle != 0L && ensureLib()) {
                try {
                    whisperFree(handle)
                } catch (_: Exception) {}
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UNLOAD_ERROR", e.message ?: "whisper.cpp unload failed")
        }
    }
}
