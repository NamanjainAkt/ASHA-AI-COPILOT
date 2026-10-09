#include <jni.h>
#include <string>
#include <vector>
#include <fstream>
#include "needle.h"

namespace {

std::string jstringToStd(JNIEnv* env, jstring value) {
    if (!value) return "";
    const char* chars = env->GetStringUTFChars(value, nullptr);
    std::string result(chars ? chars : "");
    if (chars) env->ReleaseStringUTFChars(value, chars);
    return result;
}

jstring stdToJstring(JNIEnv* env, const char* value) {
    if (!value) return nullptr;
    return env->NewStringUTF(value);
}

}  // namespace

extern "C" {

JNIEXPORT jint JNICALL
Java_org_health_asha_aicopilot_NeedleModule_needleLoad(JNIEnv* env, jobject /* self */, jstring cactPath) {
    const std::string path = jstringToStd(env, cactPath);
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) return -100;
    const auto size = static_cast<unsigned long long>(file.tellg());
    if (size == 0) return -101;
    file.seekg(0);
    std::vector<unsigned char> bytes(static_cast<size_t>(size));
    if (!file.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(size))) return -102;
    return needle_load(bytes.data(), size);
}

JNIEXPORT jint JNICALL
Java_org_health_asha_aicopilot_NeedleModule_needleInit(JNIEnv* env, jobject /* self */, jstring systemPrompt, jstring toolsJson) {
    const std::string prompt = jstringToStd(env, systemPrompt);
    const std::string tools = jstringToStd(env, toolsJson);
    return needle_init(prompt.c_str(), tools.c_str(), nullptr);
}

JNIEXPORT jstring JNICALL
Java_org_health_asha_aicopilot_NeedleModule_needleComplete(JNIEnv* env, jobject /* self */, jstring input, jint maxTokens) {
    const std::string text = jstringToStd(env, input);
    constexpr int kOutCapacity = 32768;
    std::vector<char> out(static_cast<size_t>(kOutCapacity));
    const int rc = needle_complete(text.c_str(), nullptr, 0, static_cast<int>(maxTokens), out.data(), kOutCapacity);
    if (rc < 0) return nullptr;
    return stdToJstring(env, out.data());
}

JNIEXPORT void JNICALL
Java_org_health_asha_aicopilot_NeedleModule_needleReset(JNIEnv* /* env */, jobject /* self */) {
    needle_reset();
}

JNIEXPORT jstring JNICALL
Java_org_health_asha_aicopilot_NeedleModule_needleLastError(JNIEnv* env, jobject /* self */) {
    return stdToJstring(env, needle_last_error());
}

}  // extern "C"
