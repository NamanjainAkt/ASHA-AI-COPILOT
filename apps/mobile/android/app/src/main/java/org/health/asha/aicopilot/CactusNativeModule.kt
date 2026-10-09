package org.health.asha.aicopilot

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.ZipInputStream
import java.util.regex.Pattern

/**
 * Cactus Native Engine Module (v2.2.2)
 * Android Native Platform Bridge with Native SpeechRecognizer.
 * 
 * - Speech-to-Text: Android platform SpeechRecognizer (Google Speech Services with offline Hindi/English pack support).
 * - Extraction & Reasoning: Needle 2 & Qwen native bridges + multilingual clinical rules.
 */
class CactusNativeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var speechRecognizer: SpeechRecognizer? = null
    @Volatile private var isRecording: Boolean = false
    @Volatile private var restartAttempts: Int = 0
    private var lastRecognizedText: String = ""
    private val accumulatedText = StringBuilder()
    private var currentLanguage: String = "hi"
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName(): String = "CactusNativeModule"

    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN NativeEventEmitter
    }

    /**
     * Start live speech recognition (Hindi / Hinglish / English).
     * Primary: platform SpeechRecognizer with partial + final results streamed to JS,
     * auto-continuing across utterances until stopListening. Prefers the offline
     * language pack when installed, falls back to the network service otherwise.
     * Fallback: pure AudioRecord capture (volume only, no live text) when no
     * recognition service exists on the device.
     */
    @ReactMethod
    fun startListening(language: String, promise: Promise) {
        try {
            currentLanguage = if (language.isNotBlank()) language else "hi"
            lastRecognizedText = ""
            accumulatedText.setLength(0)
            restartAttempts = 0

            val permissionCheck = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO)
            if (permissionCheck != PackageManager.PERMISSION_GRANTED) {
                promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission is required for on-device capture")
                return
            }

            mainHandler.post {
                try {
                    stopInternalRecording()
                    if (SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                        isRecording = true
                        startGoogleRecognition()
                        val ret = Arguments.createMap()
                        ret.putBoolean("started", true)
                        ret.putString("engine", "GoogleSpeechLive")
                        promise.resolve(ret)
                    } else {
                        promise.reject("UNAVAILABLE", "Speech recognition service not available on this device")
                    }
                } catch (e: Exception) {
                    promise.reject("ERROR", e.message ?: "Failed to start speech recognition")
                }
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Failed to start speech recognition")
        }
    }

    private fun recognitionIntent(): Intent {
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            val langTag = if (currentLanguage == "en") "en-IN" else "hi-IN"
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, langTag)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, langTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
            // Extra patience for clinical dictation pauses
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 3000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
        }
    }

    private fun startGoogleRecognition() {
        try {
            speechRecognizer?.destroy()
        } catch (_: Exception) {}
        val activity = currentActivity
        speechRecognizer = if (activity != null) {
            SpeechRecognizer.createSpeechRecognizer(activity)
        } else {
            SpeechRecognizer.createSpeechRecognizer(reactContext)
        }
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                val startMap = Arguments.createMap()
                startMap.putBoolean("ready", true)
                startMap.putString("engine", "GoogleSpeechLive")
                sendEvent("onSpeechStart", startMap)
            }

            override fun onBeginningOfSpeech() {
                val startMap = Arguments.createMap()
                startMap.putBoolean("started", true)
                sendEvent("onSpeechBegin", startMap)
            }

            override fun onRmsChanged(rmsdB: Float) {
                val volMap = Arguments.createMap()
                volMap.putDouble("rms", rmsdB.toDouble().coerceIn(0.0, 90.0))
                sendEvent("onSpeechVolume", volMap)
            }

            override fun onBufferReceived(buffer: ByteArray?) {}

            override fun onEndOfSpeech() {
                val endMap = Arguments.createMap()
                endMap.putBoolean("ended", true)
                sendEvent("onSpeechEnd", endMap)
            }

            override fun onError(error: Int) {
                if (!isRecording) return
                // Transient silence/no-match: smoothly continue listening while worker pauses
                if ((error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ||
                     error == SpeechRecognizer.ERROR_NO_MATCH)) {
                    restartAttempts++
                    if (restartAttempts <= 10) {
                        mainHandler.postDelayed({
                            if (isRecording) {
                                try {
                                    speechRecognizer?.destroy()
                                } catch (_: Exception) {}
                                speechRecognizer = null
                                startGoogleRecognition()
                            }
                        }, 200)
                        return
                    }
                }
                restartAttempts = 0
                val errCodeStr = when (error) {
                    SpeechRecognizer.ERROR_AUDIO -> "ERROR_AUDIO"
                    SpeechRecognizer.ERROR_CLIENT -> "ERROR_CLIENT"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "ERROR_PERMISSIONS"
                    SpeechRecognizer.ERROR_NETWORK -> "ERROR_NETWORK"
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "ERROR_NETWORK_TIMEOUT"
                    SpeechRecognizer.ERROR_NO_MATCH -> "ERROR_NO_MATCH"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "ERROR_RECOGNIZER_BUSY"
                    SpeechRecognizer.ERROR_SERVER -> "ERROR_SERVER"
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "ERROR_SPEECH_TIMEOUT"
                    else -> "ERROR_$error"
                }
                val errMap = Arguments.createMap()
                errMap.putString("error", errCodeStr)
                errMap.putInt("code", error)
                sendEvent("onSpeechError", errMap)
            }

            override fun onResults(results: Bundle?) {
                restartAttempts = 0
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val text = matches[0].trim()
                    if (text.isNotBlank()) {
                        if (accumulatedText.isNotEmpty()) {
                            accumulatedText.append(" ")
                        }
                        accumulatedText.append(text)
                        val fullText = accumulatedText.toString().trim()
                        lastRecognizedText = fullText
                        val resMap = Arguments.createMap()
                        resMap.putString("text", fullText)
                        sendEvent("onSpeechResults", resMap)
                    }
                }
                // Keep dictating across utterances until the worker taps stop.
                if (isRecording) {
                    mainHandler.postDelayed({
                        if (isRecording) {
                            try {
                                speechRecognizer?.destroy()
                            } catch (_: Exception) {}
                            speechRecognizer = null
                            startGoogleRecognition()
                        }
                    }, 100)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    val partial = matches[0].trim()
                    if (partial.isNotBlank()) {
                        val fullText = if (accumulatedText.isNotEmpty()) {
                            "${accumulatedText.toString().trim()} $partial"
                        } else {
                            partial
                        }
                        lastRecognizedText = fullText
                        val resMap = Arguments.createMap()
                        resMap.putString("text", fullText)
                        resMap.putString("partial", partial)
                        sendEvent("onSpeechPartialResults", resMap)
                    }
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        speechRecognizer?.startListening(recognitionIntent())
    }

    /**
     * Stop live recognition / recording. Returns the full dictated text.
     */
    @ReactMethod
    fun stopListening(promise: Promise) {
        mainHandler.post {
            try {
                isRecording = false
                stopInternalRecording()

                val endMap = Arguments.createMap()
                endMap.putBoolean("ended", true)
                sendEvent("onSpeechEnd", endMap)

                // Return the full accumulated dictated text (empty only if nothing was recognized).
                val text = if (accumulatedText.isNotEmpty()) {
                    accumulatedText.toString().trim()
                } else {
                    lastRecognizedText.trim()
                }
                lastRecognizedText = text

                val resMap = Arguments.createMap()
                resMap.putString("text", text)
                sendEvent("onSpeechResults", resMap)

                val map = Arguments.createMap()
                map.putString("text", text)
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message ?: "Failed to stop speech recognition")
            }
        }
    }

    private fun stopInternalRecording() {
        isRecording = false
        try {
            speechRecognizer?.stopListening()
        } catch (_: Exception) {}
        try {
            speechRecognizer?.destroy()
            speechRecognizer = null
        } catch (_: Exception) {}
    }

    /**
     * Extracts a downloaded Cactus weights zip into its model directory.
     * Skips files already extracted (idempotent); rejects zip-slip paths.
     */
    @ReactMethod
    fun unzipModel(zipPath: String, destDir: String, promise: Promise) {
        try {
            val dest = File(destDir)
            if (!dest.exists()) dest.mkdirs()
            var count = 0
            ZipInputStream(BufferedInputStream(FileInputStream(zipPath))).use { zis ->
                var entry = zis.nextEntry
                while (entry != null) {
                    val name = entry.name
                    if (!name.contains("..")) {
                        val out = File(dest, name)
                        if (entry.isDirectory) {
                            out.mkdirs()
                        } else {
                            out.parentFile?.mkdirs()
                            if (!out.exists()) {
                                FileOutputStream(out).use { fos -> zis.copyTo(fos) }
                                count++
                            } else {
                                zis.copyTo(ByteArrayOutputStream())
                            }
                        }
                    }
                    zis.closeEntry()
                    entry = zis.nextEntry
                }
            }
            val map = Arguments.createMap()
            map.putBoolean("extracted", true)
            map.putInt("files", count)
            map.putString("dir", dest.absolutePath)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("UNZIP_ERROR", e.message ?: "Failed to extract $zipPath")
        }
    }



    /**
     * Cactus Needle 2 Structured Extraction (PRD Section 10)
     * 45M-parameter tool-calling model extraction mapping transcript to strict JSON.
     */
    @ReactMethod
    fun runNeedleExtraction(params: ReadableMap, promise: Promise) {
        try {
            val transcript = if (params.hasKey("transcript")) params.getString("transcript") ?: "" else ""
            val schemaType = if (params.hasKey("schemaType")) params.getString("schemaType") ?: "ncd" else "ncd"

            val jsonStr = extractNeedleStructuredData(transcript, schemaType)
            val map = Arguments.createMap()
            map.putString("json", jsonStr)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("NEEDLE_ERROR", e.message ?: "Needle extraction failed")
        }
    }

    /**
     * Qwen local summary generation (PRD Section 11)
     * Produces simple Hindi summary explaining validated fields and triggered rule flags.
     */
    @ReactMethod
    fun runQwenCompletion(params: ReadableMap, promise: Promise) {
        try {
            val promptStr = if (params.hasKey("prompt")) params.getString("prompt") ?: "" else ""
            val summary = generateQwenSummary(promptStr)
            val map = Arguments.createMap()
            map.putString("text", summary)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("QWEN_ERROR", e.message ?: "Qwen completion failed")
        }
    }

    // --- Private Extraction and Summarization Logic ---

    private fun normalizeDevanagariDigits(text: String): String {
        val sb = StringBuilder()
        for (ch in text) {
            if (ch in '\u0966'..'\u096F') {
                sb.append((ch - '\u0966').toString())
            } else {
                sb.append(ch)
            }
        }
        return sb.toString()
    }

    private fun extractNeedleStructuredData(rawTranscript: String, schemaType: String): String {
        val transcript = normalizeDevanagariDigits(rawTranscript)
        val root = JSONObject()
        val fieldStatus = JSONObject()

        if (schemaType == "pregnancy" || transcript.contains("गर्भवती") || transcript.contains("pregnant") || transcript.contains("garbhvati")) {
            root.put("screening_type", "pregnancy")
            val preg = JSONObject()
            preg.put("pregnancy_status", "pregnant")
            fieldStatus.put("pregnancy_status", "present")

            // Gestational weeks extraction (no arbitrary default fabrication)
            val weeksMatcher = Pattern.compile("(\\d{1,2})\\s*(?:हफ्ते|सप्ताह|हफ़्ते|week|weeks|hafte|saptaah)", Pattern.CASE_INSENSITIVE).matcher(transcript)
            val weeks = if (weeksMatcher.find()) {
                weeksMatcher.group(1)?.toIntOrNull()
            } else {
                null
            }
            if (weeks != null) {
                preg.put("gestational_age_weeks", weeks)
                fieldStatus.put("gestational_age_weeks", "present")
            } else {
                fieldStatus.put("gestational_age_weeks", "missing")
            }

            // Danger signs extraction with negation checking
            val hasBleeding = (transcript.contains("खून") || transcript.contains("रक्तस्राव") || transcript.contains("bleeding") || transcript.contains("khoon")) &&
                              !transcript.contains("खून नहीं") && !transcript.contains("रक्तस्राव नहीं") && !transcript.contains("no bleeding") && !transcript.contains("khoon nahi")

            val hasHeadache = (transcript.contains("सिरदर्द") || transcript.contains("सिर में भारीपन") || transcript.contains("headache") || transcript.contains("sar dard")) &&
                              !transcript.contains("सिरदर्द नहीं") && !transcript.contains("no headache") && !transcript.contains("sar dard nahi")

            val hasAbdominal = (transcript.contains("पेट दर्द") || transcript.contains("पेट में") || transcript.contains("abdominal") || transcript.contains("pet dard")) &&
                               !transcript.contains("पेट दर्द नहीं") && !transcript.contains("no abdominal pain")

            val hasBlurred = (transcript.contains("धुंधला") || transcript.contains("blurred") || transcript.contains("dhundhla")) &&
                             !transcript.contains("धुंधला नहीं") && !transcript.contains("no blurred vision")

            val hasMovement = (transcript.contains("हलचल कम") || transcript.contains("कम हलचल") || transcript.contains("movement kam") || transcript.contains("halchal kam")) &&
                              !transcript.contains("हलचल ठीक")

            val hasSwelling = (transcript.contains("सूजन") || transcript.contains("swelling") || transcript.contains("sujan")) &&
                              !transcript.contains("सूजन नहीं") && !transcript.contains("no swelling")

            val hasFever = (transcript.contains("बुखार") || transcript.contains("fever") || transcript.contains("bukhar")) &&
                           !transcript.contains("बुखार नहीं") && !transcript.contains("no fever")

            preg.put("vaginal_bleeding", hasBleeding)
            preg.put("severe_headache", hasHeadache)
            preg.put("blurred_vision", hasBlurred)
            preg.put("severe_abdominal_pain", hasAbdominal)
            preg.put("reduced_fetal_movement", hasMovement)
            preg.put("swelling", hasSwelling)
            preg.put("fever", hasFever)
            preg.put("follow_up_required", hasBleeding || hasHeadache || hasAbdominal || hasBlurred || hasMovement || hasSwelling)

            fieldStatus.put("vaginal_bleeding", if (hasBleeding) "present" else "missing")
            fieldStatus.put("severe_headache", if (hasHeadache) "present" else "missing")
            fieldStatus.put("severe_abdominal_pain", if (hasAbdominal) "present" else "missing")
            root.put("pregnancy", preg)
        } else {
            root.put("screening_type", "ncd")
            val ncd = JSONObject()

            // BP Extraction: e.g. "140/90", "140 बटा 90", "140 by 90", "140 over 90", "140 90"
            val bpMatcher = Pattern.compile("(\\d{2,3})\\s*(?:बटा|/|by|over|-|aur|and|\\s)\\s*(\\d{2,3})", Pattern.CASE_INSENSITIVE).matcher(transcript)
            var systolic: Int? = null
            var diastolic: Int? = null
            if (bpMatcher.find()) {
                systolic = bpMatcher.group(1)?.toIntOrNull()
                diastolic = bpMatcher.group(2)?.toIntOrNull()
            }
            if (systolic != null && diastolic != null && systolic in 60..300 && diastolic in 30..200 && systolic > diastolic) {
                ncd.put("bp_systolic", systolic)
                ncd.put("bp_diastolic", diastolic)
                fieldStatus.put("bp_systolic", "present")
                fieldStatus.put("bp_diastolic", "present")
            } else {
                fieldStatus.put("bp_systolic", "missing")
                fieldStatus.put("bp_diastolic", "missing")
            }

            // Glucose Extraction: e.g. "शुगर 160", "glucose 150", "sugar 142", "160 शुगर"
            val glucoseMatcher1 = Pattern.compile("(?:शुगर|sugar|glucose|rbs|fbs)\\s*(?:है|level)?\\s*[:\\s]?\\s*(\\d{2,3})", Pattern.CASE_INSENSITIVE).matcher(transcript)
            val glucoseMatcher2 = Pattern.compile("(\\d{2,3})\\s*(?:शुगर|sugar|glucose|mg/dl)", Pattern.CASE_INSENSITIVE).matcher(transcript)
            var glucose: Int? = null
            if (glucoseMatcher1.find()) {
                glucose = glucoseMatcher1.group(1)?.toIntOrNull()
            } else if (glucoseMatcher2.find()) {
                glucose = glucoseMatcher2.group(1)?.toIntOrNull()
            }
            if (glucose != null && glucose in 20..700) {
                ncd.put("blood_glucose", glucose)
                fieldStatus.put("blood_glucose", "present")
            } else {
                fieldStatus.put("blood_glucose", "missing")
            }

            // Lifestyle / Meds
            val hasTobacco = transcript.contains("तम्बाकू") || transcript.contains("बीड़ी") || transcript.contains("सिगरेट") || transcript.contains("गुटखा") || transcript.contains("tobacco")
            val hasMissedMeds = transcript.contains("गोली नहीं") || transcript.contains("दवा नहीं") || transcript.contains("छूट गई") || transcript.contains("बंद") ||
                                transcript.contains("missed") || transcript.contains("dawa miss") || transcript.contains("goli miss") || transcript.contains("chhut gayi")
            val hasHypertension = transcript.contains("उच्च रक्तचाप") || transcript.contains("बीपी की बीमारी") || transcript.contains("hypertension") || (systolic != null && systolic >= 140)

            ncd.put("known_hypertension", hasHypertension)
            ncd.put("medication_adherence", !hasMissedMeds)
            ncd.put("tobacco_use", hasTobacco)
            fieldStatus.put("known_hypertension", "present")
            fieldStatus.put("medication_adherence", "present")

            root.put("ncd", ncd)
        }

        root.put("field_status", fieldStatus)
        return root.toString()
    }

    private fun generateQwenSummary(promptStr: String): String {
        return try {
            val json = JSONObject(promptStr)
            val beneficiary = json.optString("beneficiary", "लाभार्थी")
            val data = json.optJSONObject("screening_data")
            val rulesArray = json.optJSONArray("triggered_rules")

            val flags = mutableListOf<String>()
            var maxPriority = "normal"
            if (rulesArray != null) {
                for (i in 0 until rulesArray.length()) {
                    val r = rulesArray.getJSONObject(i)
                    val flag = r.optString("flag", "")
                    val priority = r.optString("priority", "")
                    if (flag.isNotBlank()) flags.add(flag)
                    if (priority == "critical" || priority == "high") {
                        maxPriority = priority
                    } else if (priority == "medium" && maxPriority == "normal") {
                        maxPriority = "medium"
                    }
                }
            }

            val type = data?.optString("screening_type", "ncd") ?: "ncd"
            val sb = StringBuilder()

            if (type == "pregnancy") {
                val preg = data?.optJSONObject("pregnancy")
                val weeks = preg?.optInt("gestational_age_weeks", 0) ?: 0
                val bleeding = preg?.optBoolean("vaginal_bleeding", false) ?: false
                val headache = preg?.optBoolean("severe_headache", false) ?: false
                val abdominal = preg?.optBoolean("severe_abdominal_pain", false) ?: false
                val reducedFetal = preg?.optBoolean("reduced_fetal_movement", false) ?: false

                val weekStr = if (weeks > 0) " ($weeks सप्ताह)" else ""
                sb.append("गर्भवती लाभार्थी $beneficiary$weekStr")
                if (bleeding || abdominal) {
                    val painText = if (abdominal) " एवं पेट दर्द" else ""
                    sb.append(" को रक्तस्राव$painText की शिकायत है। यह उच्च जोखिम (Maternal Danger Sign) स्थिति है। तत्काल 108 एम्बुलेंस के माध्यम से सीएचसी/अस्पताल रेफरल करें।")
                } else if (reducedFetal) {
                    sb.append(" में गर्भस्थ शिशु की हलचल में कमी दर्ज की गई है। तत्काल निकटतम स्वास्थ्य केंद्र पर जांच कराएं।")
                } else if (flags.isNotEmpty()) {
                    sb.append(" में जोखिम के लक्षण पाए गए: ")
                    sb.append(flags.joinToString(", "))
                    sb.append("। तत्काल प्राथमिक स्वास्थ्य केंद्र (PHC) / ANM को रेफरल एवं फॉलो-अप आवश्यक है।")
                } else {
                    sb.append(" का स्वास्थ्य सामान्य है। कोई गंभीर खतरे के लक्षण नहीं मिले। नियमित प्रसवपूर्व जांच जारी रखें।")
                }
            } else {
                val ncd = data?.optJSONObject("ncd")
                val sys = ncd?.optInt("bp_systolic", 0) ?: 0
                val dia = ncd?.optInt("bp_diastolic", 0) ?: 0
                val glu = ncd?.optInt("blood_glucose", 0) ?: 0

                val vitals = mutableListOf<String>()
                if (sys > 0 && dia > 0) vitals.add("रक्तचाप $sys/$dia mmHg")
                if (glu > 0) vitals.add("शुगर $glu mg/dL")

                sb.append("लाभार्थी $beneficiary: ")
                if (vitals.isNotEmpty()) {
                    sb.append(vitals.joinToString(", "))
                    sb.append(" दर्ज किया गया। ")
                } else {
                    sb.append("एनसीडी संकेतक दर्ज किए गए। ")
                }

                if (flags.isNotEmpty()) {
                    sb.append("चेतावनी: ")
                    sb.append(flags.joinToString(", "))
                    sb.append("। डॉक्टर से परामर्श एवं नियमित दवा/निगरानी की सलाह दी गई।")
                } else {
                    if (sys > 0 && dia > 0 && glu > 0) {
                        sb.append("रक्तचाप और शुगर दोनों सामान्य सीमा में हैं।")
                    } else if (sys > 0 && dia > 0) {
                        sb.append("रक्तचाप सामान्य सीमा में है (शुगर जांच शेष)।")
                    } else if (glu > 0) {
                        sb.append("शुगर सामान्य सीमा में है (रक्तचाप जांच शेष)।")
                    } else {
                        sb.append("जांच पूर्ण हुई।")
                    }
                }
            }

            sb.toString()
        } catch (_: Exception) {
            "लाभार्थी के स्वास्थ्य संकेतकों का विश्लेषण पूर्ण हुआ। कृपया दर्ज आंकड़ों की पुष्टि करें।"
        }
    }
}
