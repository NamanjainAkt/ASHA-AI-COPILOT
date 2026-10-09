#include <jni.h>

#include <android/log.h>

#include <cstdio>
#include <string>
#include <vector>

#include "whisper.h"

#define LOG_TAG "WhisperCpp"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

std::string jstring_to_std(JNIEnv* env, jstring value) {
    if (!value) return "";
    const char* chars = env->GetStringUTFChars(value, nullptr);
    std::string result(chars ? chars : "");
    if (chars) env->ReleaseStringUTFChars(value, chars);
    return result;
}

// Escape for embedding in a small JSON string response.
std::string json_escape(const std::string& in) {
    std::string out;
    out.reserve(in.size() + 8);
    for (unsigned char c : in) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += (char) c;
                }
        }
    }
    return out;
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_org_health_asha_aicopilot_WhisperCppModule_whisperInit(JNIEnv* env, jobject /* self */, jstring modelPath) {
    const std::string path = jstring_to_std(env, modelPath);
    struct whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false;
    struct whisper_context* ctx = whisper_init_from_file_with_params(path.c_str(), cparams);
    if (!ctx) {
        LOGE("whisper_init failed for %s", path.c_str());
        return 0;
    }
    LOGI("whisper_init ok: %s", path.c_str());
    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT jstring JNICALL
Java_org_health_asha_aicopilot_WhisperCppModule_whisperTranscribeFile(
        JNIEnv* env, jobject /* self */, jlong handle, jstring audioPath, jstring language) {
    auto* ctx = reinterpret_cast<struct whisper_context*>(handle);
    if (!ctx) return env->NewStringUTF("{\"error\":\"null context\"}");
    const std::string path = jstring_to_std(env, audioPath);
    std::string lang = jstring_to_std(env, language);
    if (lang.empty()) lang = "hi";

    FILE* f = fopen(path.c_str(), "rb");
    if (!f) {
        LOGE("cannot open pcm: %s", path.c_str());
        return env->NewStringUTF("{\"error\":\"cannot open pcm file\"}");
    }
    fseek(f, 0, SEEK_END);
    const long bytes = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (bytes < 3200) {
        fclose(f);
        return env->NewStringUTF("{\"error\":\"pcm too short\"}");
    }
    const size_t n_samples = (size_t) bytes / sizeof(int16_t);
    std::vector<int16_t> pcm16(n_samples);
    const size_t got = fread(pcm16.data(), sizeof(int16_t), n_samples, f);
    fclose(f);
    std::vector<float> pcmf32(got);
    for (size_t i = 0; i < got; i++) pcmf32[i] = float(pcm16[i]) / 32768.0f;

    struct whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    wparams.print_progress = false;
    wparams.print_special = false;
    wparams.print_realtime = false;
    wparams.print_timestamps = false;
    wparams.translate = false;
    wparams.language = lang.c_str();
    wparams.n_threads = 4;
    // NOTE: wparams.language points at `lang`; whisper copies it internally during the call.
    // Keep `lang` alive until whisper_full returns (it is, same scope).

    std::string out;
    if (whisper_full(ctx, wparams, pcmf32.data(), (int) pcmf32.size()) != 0) {
        out = "{\"error\":\"whisper_full failed\"}";
    } else {
        const int n_segments = whisper_full_n_segments(ctx);
        std::string text;
        for (int i = 0; i < n_segments; i++) {
            const char* seg = whisper_full_get_segment_text(ctx, i);
            if (seg && seg[0] != '\0') {
                if (!text.empty()) text += " ";
                text += seg;
            }
        }
        char head[128];
        snprintf(head, sizeof(head), "{\"segments\":%d,\"text\":\"", n_segments);
        out = head + json_escape(text) + "\"}";
    }
    return env->NewStringUTF(out.c_str());
}

JNIEXPORT void JNICALL
Java_org_health_asha_aicopilot_WhisperCppModule_whisperFree(JNIEnv* /* env */, jobject /* self */, jlong handle) {
    auto* ctx = reinterpret_cast<struct whisper_context*>(handle);
    if (ctx) whisper_free(ctx);
}

}  // extern "C"
