import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  NativeModules,
  NativeEventEmitter,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { DEMO_SCENARIOS, DemoVoiceScenario } from '../../services/ai/simulatorDriver';
import { screeningOrchestrator } from '../../services/ai/orchestrator';
import { aiOrchestrator } from '../../services/ai/aiOrchestrator';
import { modelManager } from '../../services/ai/modelManager';
import { patientRepository } from '../../services/db/patientRepo';
import { Patient, ScreeningType } from '@asha/shared';

type CaptureMode = 'live' | 'scenarios';

export default function VoiceCaptureScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const params = useLocalSearchParams<{
    scenarioId?: string;
    patientId?: string;
    patientName?: string;
    screeningType?: string;
  }>();

  // Mode: Live Mic vs Scenario Fixtures
  const [mode, setMode] = useState<CaptureMode>('live');

  // Beneficiary selection state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(params.patientId || '');
  const [selectedPatientName, setSelectedPatientName] = useState<string>(params.patientName || '');
  const [screeningType, setScreeningType] = useState<ScreeningType>(
    (params.screeningType as ScreeningType) || 'ncd'
  );

  // Audio recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioUri, setAudioUri] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);

  // References for robust native recording lifecycle
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const timerRef = useRef<any>(null);
  const webRecognitionRef = useRef<any>(null);

  // Live transcript & dictation text (starts completely empty, no dummy values)
  const [transcript, setTranscript] = useState<string>('');

  // Live STT engine state: '' | 'GoogleSpeechLive' | 'OnDeviceAudioRecordFallback' | 'needs-network'
  const [sttEngine, setSttEngine] = useState<string>('');
  const [sttHint, setSttHint] = useState<string>('');

  // Scenario Fixture State
  const initialScenario = DEMO_SCENARIOS.find(s => s.id === params.scenarioId) || DEMO_SCENARIOS[0];
  const [selectedScenario, setSelectedScenario] = useState<DemoVoiceScenario>(initialScenario);

  // Native Speech Recognition Event Listeners
  useEffect(() => {
    let subResults: any = null;
    let subPartial: any = null;
    let subVolume: any = null;
    let subError: any = null;
    let subChunk: any = null;
    try {
      const module = NativeModules?.CactusNativeModule;
      if (module) {
        const emitter = new NativeEventEmitter(module);
        subResults = emitter.addListener('onSpeechResults', (event: any) => {
          if (event?.text && typeof event.text === 'string' && event.text.trim()) {
            setTranscript(event.text.trim());
            setSttHint('');
          }
        });
        subPartial = emitter.addListener('onSpeechPartialResults', (event: any) => {
          if (event?.text && typeof event.text === 'string' && event.text.trim()) {
            setTranscript(event.text.trim());
            setSttHint('');
          }
        });
        subError = emitter.addListener('onSpeechError', (event: any) => {
          const code = event?.error || '';
          if (code === 'ERROR_NETWORK' || code === 'ERROR_NETWORK_TIMEOUT' || code === 'ERROR_SERVER') {
            setSttEngine('needs-network');
            setSttHint(language === 'hi'
              ? 'इस डिवाइस पर बोलकर लिखने के लिए इंटरनेट चाहिए, या नीचे टाइप करें।'
              : 'Live dictation needs internet on this device, or type below.');
          } else if (code === 'ERROR_PERMISSIONS') {
            setSttHint(language === 'hi'
              ? 'माइक्रोफ़ोन अनुमति दें और पुनः प्रयास करें।'
              : 'Grant microphone permission and try again.');
          }
        });
        subVolume = emitter.addListener('onSpeechVolume', (event: any) => {
          if (event?.rms && typeof event.rms === 'number') {
            const scale1 = 1 + Math.min(event.rms / 60, 0.5);
            const scale2 = 1 + Math.min(event.rms / 50, 0.8);
            waveAnim1.setValue(scale1);
            waveAnim2.setValue(scale2);
          }
        });
        subChunk = emitter.addListener('onSpeechChunk', async (event: any) => {
          if (event?.pcmBase64 && aiOrchestrator.isLiveSessionActive()) {
            try {
              const { confirmed, pending } = await aiOrchestrator.pushLiveAudio(event.pcmBase64);
              const live = (confirmed + (pending ? ' ' + pending : '')).trim();
              if (live) {
                setTranscript(live);
                setSttHint('');
              }
            } catch (e: any) {
              setSttHint(
                language === 'hi'
                  ? `व्हिस्पर त्रुटि (${e?.message || 'error'}) — रोकें और पुनः प्रयास करें।`
                  : `Whisper error (${e?.message || 'error'}) — stop and retry.`
              );
            }
          }
        });
      }
    } catch (e) {
      console.warn('Native speech listener init notice:', e);
    }

    return () => {
      subResults?.remove?.();
      subPartial?.remove?.();
      subVolume?.remove?.();
      subError?.remove?.();
      subChunk?.remove?.();
    };
  }, []);

  // Wave animations
  const waveAnim1 = useRef(new Animated.Value(1)).current;
  const waveAnim2 = useRef(new Animated.Value(1)).current;

  // Load patients from SQLite
  useEffect(() => {
    let isMounted = true;
    const loadPatients = async () => {
      try {
        const pList = await patientRepository.getAll();
        if (!isMounted) return;
        setPatients(pList);

        if (!selectedPatientId && pList.length > 0) {
          setSelectedPatientId(pList[0].id);
          setSelectedPatientName(pList[0].name);
          if (pList[0].sex === 'female' && pList[0].age < 45) {
            setScreeningType('pregnancy');
          }
        } else if (selectedPatientId) {
          const found = pList.find(p => p.id === selectedPatientId);
          if (found) {
            setSelectedPatientName(found.name);
          }
        }
      } catch (err) {
        console.warn('Error loading patients:', err);
      }
    };
    loadPatients();
    return () => {
      isMounted = false;
    };
  }, [selectedPatientId]);

  // Request audio recording permissions and lifecycle cleanup
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        await Audio.requestPermissionsAsync();
      } catch (e) {
        console.warn('Failed to request mic permissions', e);
      }
    };
    requestPermissions();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (webRecognitionRef.current) {
        try { webRecognitionRef.current.stop(); } catch (_) {}
        webRecognitionRef.current = null;
      }
      if (recordingRef.current) {
        const dangling = recordingRef.current;
        recordingRef.current = null;
        isRecordingRef.current = false;
        dangling.stopAndUnloadAsync().catch(() => {});
      }
      if (NativeModules?.CactusNativeModule?.stopListening) {
        NativeModules.CactusNativeModule.stopListening().catch(() => {});
      }
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
      }).catch(() => {});
    };
  }, []);

  // Animation controller
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isRecording) {
      anim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(waveAnim1, { toValue: 1.4, duration: 600, useNativeDriver: true }),
            Animated.timing(waveAnim1, { toValue: 1, duration: 600, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(waveAnim2, { toValue: 1.7, duration: 800, useNativeDriver: true }),
            Animated.timing(waveAnim2, { toValue: 1, duration: 800, useNativeDriver: true }),
          ]),
        ])
      );
      anim.start();
    } else {
      waveAnim1.setValue(1);
      waveAnim2.setValue(1);
    }
    return () => {
      if (anim) anim.stop();
    };
  }, [isRecording]);

  const startRecording = async () => {
    if (isStartingRef.current || isRecordingRef.current) return;
    isStartingRef.current = true;

    try {
      // 1. Microphone permission verification (native only)
      if (Platform.OS !== 'web') {
        try {
          const perm = await Audio.requestPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              language === 'hi' ? 'माइक्रोफ़ोन अनुमति आवश्यक' : 'Microphone Permission Required',
              language === 'hi'
                ? 'ऑडियो रिकॉर्डिंग के लिए कृपया माइक्रोफोन अनुमति प्रदान करें।'
                : 'Please grant microphone permission to record audio.'
            );
            isStartingRef.current = false;
            return;
          }
        } catch (permErr) {
          console.warn('Mic permission check notice:', permErr);
        }
      }

      setDuration(0);
      setIsRecording(true);
      isRecordingRef.current = true;
      setSttHint('');

      // 2. Speech Recognition routing to capture real speech without mic lock conflicts:
      // Cactus Whisper streaming first (fully offline, weights from Profile → AI Models),
      // platform dictation only as fallback when weights are absent.
      if (NativeModules?.CactusNativeModule?.startListening) {
        const langTag = language === 'hi' ? 'hi' : 'en';
        let cactusLive = false;
        let cactusStartError = '';
        // Fresh disk probe: never decide readiness on possibly-stale memory.
        let diskReport = '';
        try {
          const report = await modelManager.refreshStatuses();
          diskReport = ` [disk: tiny=${report['whisper-hindi'] || '?'}, base=${report['whisper-base'] || '?'}]`;
        } catch (_) {}
        const sttModel = modelManager.getActiveSttModel();
        if (sttModel === null) {
          // No STT weights on device: Cactus is skipped entirely. Fallback below
          // needs internet for Hindi (hi-IN has no offline pack on most phones).
          setSttHint(
            language === 'hi'
              ? `वॉयस मॉडल डाउनलोड नहीं है — Profile → AI Models से Whisper डाउनलोड करें। बिना मॉडल के हिंदी सुनवाई को इंटरनेट चाहिए।${diskReport}`
              : `Voice model not downloaded — get Whisper from Profile → AI Models. Fallback dictation needs internet.${diskReport}`
          );
        } else if (NativeModules.CactusNativeModule.startAudioCapture) {
          try {
            await aiOrchestrator.startLiveSession(langTag);
            const res = await NativeModules.CactusNativeModule.startAudioCapture();
            setSttEngine('CactusWhisperLive');
            setSttHint(language === 'hi' ? 'व्हिस्पर सुन रहा है… बोलें' : 'Whisper listening… speak now');
            cactusLive = true;
            void res;
          } catch (liveErr: any) {
            try {
              await aiOrchestrator.stopLiveSession();
            } catch (_) {}
            cactusStartError = liveErr?.message || 'error';
            setSttHint(
              language === 'hi'
                ? `व्हिस्पर शुरू नहीं हुआ (${cactusStartError}) — वैकल्पिक सुनवाई चालू।`
                : `Whisper failed to start (${cactusStartError}) — trying fallback.`
            );
          }
        }
        if (!cactusLive) {
          // Native Android: live platform dictation (hi-IN/en-IN) streaming into the notes box
          try {
            const res = await NativeModules.CactusNativeModule.startListening(langTag);
            const engine = res?.engine || '';
            setSttEngine(engine);
            const whisperNote = cactusStartError ? ` (Whisper failed: ${cactusStartError})` : '';
            if (engine === 'OnDeviceAudioRecordFallback') {
              setSttHint(language === 'hi'
                ? `इस डिवाइस पर लाइव लिखाई उपलब्ध नहीं${whisperNote} — मॉडल डाउनलोड करें या नीचे टाइप करें।`
                : `Live transcription unavailable${whisperNote} — download voice model or type below.`);
            } else {
              setSttHint(language === 'hi'
                ? `सुन रहा है… बोलें${whisperNote}`
                : `Listening… speak now${whisperNote}`);
            }
          } catch (err: any) {
            setSttEngine('start-failed');
            setSttHint(
              language === 'hi'
                ? `सुनवाई शुरू नहीं हुई (${err?.message || 'error'}) — Profile से वॉयस मॉडल डाउनलोड करें या टाइप करें।`
                : `Dictation failed to start (${err?.message || 'error'}) — download the voice model from Profile or type.`
            );
          }
        }
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Web / Chrome: Native browser Web Speech Recognition API
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          try {
            const recognition = new SpeechRec();
            recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.onresult = (event: any) => {
              let text = '';
              for (let i = 0; i < event.results.length; i++) {
                text += event.results[i][0].transcript;
              }
              if (text.trim()) setTranscript(text.trim());
            };
            recognition.onerror = (e: any) => {
              console.warn('Web speech recognition notice:', e?.error);
            };
            recognition.start();
            webRecognitionRef.current = recognition;
          } catch (webErr) {
            console.warn('Web speech start error:', webErr);
          }
        }
      } else {
        // Standalone Expo Go fallback: record audio via Expo AV
        try {
          if (recordingRef.current) {
            try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
            recordingRef.current = null;
          }
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
          const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          recordingRef.current = recording;
        } catch (recErr) {
          console.warn('Expo Audio recording start notice:', recErr);
        }
      }

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Failed to start recording:', err);
      Alert.alert(t.error, err.message || 'Error starting recording');
      setIsRecording(false);
      isRecordingRef.current = false;
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopRecording = async (): Promise<string | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
    isRecordingRef.current = false;

    // 1. Stop native recognition/capture if active; keep dictated text + real file path
    let nativeAudioPath: string | null = null;
    let heardText = false;
    if (NativeModules?.CactusNativeModule?.stopListening) {
      try {
        const res = await NativeModules.CactusNativeModule.stopListening();
        if (res?.text && typeof res.text === 'string' && res.text.trim()) {
          setTranscript(res.text.trim());
          setSttHint('');
          heardText = true;
        }
        if (res?.audioPath && typeof res.audioPath === 'string') {
          nativeAudioPath = res.audioPath;
          setAudioUri(res.audioPath);
        }
      } catch (e) {
        console.warn('Native stopListening notice:', e);
      }
    }
    // 1b. Flush an active Cactus live session (offline Whisper streaming tail)
    if (aiOrchestrator.isLiveSessionActive()) {
      try {
        const live = await aiOrchestrator.stopLiveSession();
        if (live.text) {
          setTranscript(live.text);
          setSttHint('');
          heardText = true;
        } else if (live.decodeTokens === 0) {
          setSttHint(
            language === 'hi'
              ? 'व्हिस्पर ने 0 शब्द डिकोड किए (भाषा सेटिंग समस्या) — अंग्रेज़ी में बोलकर देखें।'
              : 'Whisper decoded 0 tokens (language/prompt issue) — try English.'
          );
        } else {
          setSttHint(
            language === 'hi'
              ? `व्हिस्पर ने ${live.decodeTokens} टोकन डिकोड किए पर शब्द नहीं बने — पुनः प्रयास करें।`
              : `Whisper decoded ${live.decodeTokens} tokens but formed no words — retry.`
          );
        }
      } catch (e) {
        console.warn('Live session stop notice:', e);
      }
    }

    // 2. Stop Web Speech Recognition if active
    if (webRecognitionRef.current) {
      try {
        webRecognitionRef.current.stop();
      } catch (_) {}
      webRecognitionRef.current = null;
    }

    // 3. Stop Expo AV recording if active
    let uri: string | null = nativeAudioPath;
    if (recordingRef.current) {
      try {
        const currentRec = recordingRef.current;
        recordingRef.current = null;
        await currentRec.stopAndUnloadAsync();
        uri = currentRec.getURI();
        if (uri) setAudioUri(uri);
      } catch (recErr) {
        console.warn('Expo Audio stop notice:', recErr);
        recordingRef.current = null;
      }
    }

    // 4. Nothing from any engine this session: say so plainly (never silent).
    if (!heardText && !transcript.trim()) {
      setSttHint(
        language === 'hi'
          ? 'माइक ने कुछ नहीं सुना/पहचाना — ज़ोर से बोलें, या Profile से वॉयस मॉडल जांचें, या नीचे टाइप करें।'
          : 'Microphone heard nothing recognizable — speak louder, check the voice model in Profile, or type below.'
      );
    }

    return uri;
  };

  const handleClose = async () => {
    if (isRecording || isRecordingRef.current) {
      const uri = await stopRecording();
      if (uri) {
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (_) {}
      }
    } else if (audioUri) {
      try { await FileSystem.deleteAsync(audioUri, { idempotent: true }); } catch (_) {}
    }
    setAudioUri('');
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const appendSnippet = (snippet: string) => {
    setTranscript(prev => (prev ? `${prev}, ${snippet}` : snippet));
  };

  // Process and Analyze with AI
  const handleAnalyzeAndProceed = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      let finalAudioUri = audioUri;
      if (isRecording || isRecordingRef.current) {
        const stoppedUri = await stopRecording();
        if (stoppedUri) finalAudioUri = stoppedUri;
      }

      const targetPatientId = selectedPatientId || (params.patientId as string);
      if (!targetPatientId || targetPatientId === 'undefined') {
        Alert.alert(
          language === 'hi' ? 'लाभार्थी आवश्यक' : 'Beneficiary Required',
          language === 'hi'
            ? 'कृपया पहले लाभार्थी का चयन करें।'
            : 'Please select a beneficiary before proceeding with screening.'
        );
        isProcessingRef.current = false;
        setIsProcessing(false);
        return;
      }

      const activeText = mode === 'live' ? transcript : selectedScenario.transcript;
      const activeType = mode === 'live' ? screeningType : selectedScenario.screeningType;
      const patientName = selectedPatientName || (language === 'hi' ? 'लाभार्थी' : 'Beneficiary');

      const hasRealAudioFile = !!finalAudioUri && finalAudioUri !== 'live_voice_session.m4a';

      // Live mode with audio but no typed notes: run real STT on the file.
      // Never silently substitute fixture text — fail openly when weights are missing.
      let result;
      if (mode === 'live' && (!activeText || activeText.trim().length === 0) && hasRealAudioFile) {
        try {
          result = await screeningOrchestrator.processVoiceScreening(
            finalAudioUri,
            activeType,
            { id: targetPatientId, name: patientName }
          );
        } catch (sttErr: any) {
          Alert.alert(
            language === 'hi' ? 'वॉयस मॉडल उपलब्ध नहीं' : 'Voice Model Unavailable',
            language === 'hi'
              ? `ऑडियो दर्ज हुआ, पर Whisper मॉडल लोड नहीं है। Wi-Fi पर मॉडल डाउनलोड करें या लक्षण टाइप करें। (${sttErr?.message || ''})`
              : `Audio captured, but the Whisper model is not loaded. Download it on Wi-Fi or type symptoms. (${sttErr?.message || ''})`
          );
          isProcessingRef.current = false;
          setIsProcessing(false);
          return;
        }
        if (!result.transcript || result.transcript.trim().length === 0) {
          Alert.alert(
            language === 'hi' ? 'लक्षण या आवाज़ आवश्यक' : 'Symptoms or Audio Required',
            language === 'hi'
              ? 'ऑडियो से कोई पाठ नहीं मिला। कृपया नीचे दिए गए नोट्स बॉक्स में लक्षण दर्ज करें।'
              : 'No speech recognized from audio. Please type symptoms in the notes box.'
          );
          isProcessingRef.current = false;
          setIsProcessing(false);
          return;
        }
      } else {
        // Ensure user provided speech or notes before proceeding in live mode
        if (mode === 'live' && (!activeText || activeText.trim().length === 0)) {
          Alert.alert(
            language === 'hi' ? 'लक्षण या आवाज़ आवश्यक' : 'Symptoms or Audio Required',
            language === 'hi'
              ? 'कृपया माइक दबाकर बोलें या नीचे दिए गए नोट्स बॉक्स में लक्षण दर्ज करें।'
              : 'Please tap the microphone to speak or enter symptoms in the notes box.'
          );
          isProcessingRef.current = false;
          setIsProcessing(false);
          return;
        }

        // Execute on-device AI Pipeline (Speech -> Needle 2 Extraction -> Validation -> Rule Engine -> Qwen Summary)
        // Typed/dictated text is user-confirmed input; scenarios pass fixture transcripts.
        result = await screeningOrchestrator.processVoiceScreening(
          finalAudioUri || 'live_voice_session.m4a',
          activeType,
          {
            id: targetPatientId,
            name: patientName,
          },
          activeText
        );
      }

      // Clean up ephemeral audio file (Privacy Invariant: raw audio never retained/synced)
      if (finalAudioUri && finalAudioUri !== 'live_voice_session.m4a') {
        try {
          await FileSystem.deleteAsync(finalAudioUri, { idempotent: true });
        } catch (_) {}
      }
      setAudioUri('');

      // Store in memory cache to avoid URI encoding bottlenecks
      screeningOrchestrator.setLastResult(result);

      // Navigate to Visit Summary Screen safely without patientName in URL (ISS-118)
      router.replace({
        pathname: '/screening/summary',
        params: {
          patientId: targetPatientId,
          screeningType: activeType,
        }
      });
    } catch (err: any) {
      console.warn('Voice screening error:', err);
      Alert.alert(t.error, err.message || 'Error analyzing screening');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `0${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleClose}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.voiceScreeningTitle}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {selectedPatientName ? `${t.beneficiaryLabel} ${selectedPatientName}` : t.voicePromptSub}
          </Text>
        </View>

        <View style={styles.aiBadge}>
          <Ionicons name="shield-checkmark" size={13} color={Colors.primary} />
          <Text style={styles.aiBadgeText}>{t.offline}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Mode Selector Tab (Live Mic vs Clinical Scenarios) */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'live' && styles.modeTabActive]}
            onPress={() => setMode('live')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="mic"
              size={16}
              color={mode === 'live' ? Colors.surface : Colors.primaryDark}
            />
            <Text style={[styles.modeTabText, mode === 'live' && styles.modeTabTextActive]}>
              {t.liveMicTab}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, mode === 'scenarios' && styles.modeTabActive]}
            onPress={() => setMode('scenarios')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="list"
              size={16}
              color={mode === 'scenarios' ? Colors.surface : Colors.primaryDark}
            />
            <Text style={[styles.modeTabText, mode === 'scenarios' && styles.modeTabTextActive]}>
              {t.scenariosTab}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Beneficiary Selector Carousel */}
        <View style={styles.patientSelectorBox}>
          <Text style={styles.selectorLabel}>{t.selectBeneficiaryPrompt}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientChipsRow}>
            {patients.length === 0 ? (
              <TouchableOpacity
                style={styles.addPatientBannerBtn}
                onPress={() => router.push('/patients/new')}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add" size={14} color={Colors.primary} />
                <Text style={styles.addPatientBannerText}>
                  {language === 'hi' ? '+ नया लाभार्थी जोड़ें' : '+ Register Beneficiary'}
                </Text>
              </TouchableOpacity>
            ) : (
              patients.map(p => {
                const isSelected = p.id === selectedPatientId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.patientChip, isSelected && styles.patientChipActive]}
                    onPress={() => {
                      setSelectedPatientId(p.id);
                      setSelectedPatientName(p.name);
                      if (p.sex === 'female' && p.age < 45) {
                        setScreeningType('pregnancy');
                      } else {
                        setScreeningType('ncd');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={p.sex === 'female' ? 'woman-outline' : 'man-outline'}
                      size={14}
                      color={isSelected ? Colors.surface : Colors.primary}
                    />
                    <Text style={[styles.patientChipText, isSelected && styles.patientChipTextActive]} numberOfLines={1}>
                      {p.name} ({p.age}y)
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* Screening Category Toggle */}
        <View style={styles.typeToggleRow}>
          <TouchableOpacity
            style={[styles.typeBtn, screeningType === 'ncd' && styles.typeBtnActive]}
            onPress={() => setScreeningType('ncd')}
          >
            <Ionicons
              name="pulse"
              size={15}
              color={screeningType === 'ncd' ? Colors.surface : Colors.primaryDark}
            />
            <Text style={[styles.typeBtnText, screeningType === 'ncd' && styles.typeBtnTextActive]}>
              {t.ncdType}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeBtn, screeningType === 'pregnancy' && styles.typeBtnActive]}
            onPress={() => setScreeningType('pregnancy')}
          >
            <Ionicons
              name="woman"
              size={15}
              color={screeningType === 'pregnancy' ? Colors.surface : Colors.primaryDark}
            />
            <Text style={[styles.typeBtnText, screeningType === 'pregnancy' && styles.typeBtnTextActive]}>
              {t.pregnancyType}
            </Text>
          </TouchableOpacity>
        </View>

        {/* MODE 1: LIVE MICROPHONE */}
        {mode === 'live' ? (
          <View style={styles.liveContainer}>
            {/* Visualizer Pulsing Mic Center */}
            <View style={styles.micVisualizerArea}>
              {isRecording && (
                <>
                  <Animated.View style={[styles.waveCircle, { transform: [{ scale: waveAnim2 }], opacity: 0.25 }]} />
                  <Animated.View style={[styles.waveCircle, { transform: [{ scale: waveAnim1 }], opacity: 0.45 }]} />
                </>
              )}

              <TouchableOpacity
                style={[styles.micBigButton, isRecording && styles.micBigButtonActive]}
                onPress={isRecording ? stopRecording : startRecording}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={isRecording ? 'stop' : 'mic'}
                  size={36}
                  color={Colors.surface}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.timerDisplay}>
              {isRecording ? `${t.recordingActive} (${formatTime(duration)})` : t.tapMicToStart}
            </Text>
            {sttHint.length > 0 && (
              <Text style={styles.sttHint}>
                {sttHint}
              </Text>
            )}

            {/* Live Dictation / Speech Notes Field */}
            <View style={styles.transcriptCard}>
              <View style={styles.transcriptCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.primary} />
                  <Text style={styles.transcriptCardTitle}>{t.speechNotesLabel}</Text>
                </View>
                {transcript.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setTranscript('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.clearBtn}
                    accessibilityLabel={language === 'hi' ? 'नोट्स साफ़ करें' : 'Clear notes'}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.clearBtnText}>{language === 'hi' ? 'साफ़ करें' : 'Clear'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.transcriptInput}
                value={transcript}
                onChangeText={setTranscript}
                multiline
                numberOfLines={3}
                placeholder={language === 'hi' ? 'बोलें या लिखें... उदा. रक्तचाप 140/90, शुगर 160' : 'Speak or type... e.g. BP 140/90, Glucose 160'}
                placeholderTextColor={Colors.textMuted}
              />

              {/* Quick Clinical Chips */}
              <Text style={styles.quickChipsTitle}>{t.quickChipsLabel}</Text>
              <View style={styles.quickChipsWrap}>
                <TouchableOpacity style={styles.quickChip} onPress={() => appendSnippet(language === 'hi' ? 'रक्तचाप 165/105 mmHg' : 'BP 165/105 mmHg')}>
                  <Text style={styles.quickChipText}>+ 165/105 BP</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickChip} onPress={() => appendSnippet(language === 'hi' ? 'शुगर 185 mg/dL' : 'Glucose 185 mg/dL')}>
                  <Text style={styles.quickChipText}>+ 185 Glucose</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickChip} onPress={() => appendSnippet(language === 'hi' ? '32 हफ्ते गर्भवती' : '32 weeks pregnant')}>
                  <Text style={styles.quickChipText}>+ 32w</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickChip} onPress={() => appendSnippet(language === 'hi' ? 'रक्तस्राव' : 'Bleeding')}>
                  <Text style={styles.quickChipText}>{language === 'hi' ? '+ रक्तस्राव' : '+ Bleeding'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickChip} onPress={() => appendSnippet(language === 'hi' ? 'सूजन एवं सिरदर्द' : 'Swelling and headache')}>
                  <Text style={styles.quickChipText}>{language === 'hi' ? '+ सूजन/सिरदर्द' : '+ Swelling/Headache'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          /* MODE 2: CLINICAL SCENARIOS */
          <View style={styles.scenarioContainer}>
            <Text style={styles.scenarioHeading}>
              {language === 'hi' ? 'परीक्षण हेतु नैदानिक केस चुनें:' : 'Select Clinical Test Case:'}
            </Text>
            {DEMO_SCENARIOS.map(s => {
              const isSelected = selectedScenario.id === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.scenarioCard, isSelected && styles.scenarioCardActive]}
                  onPress={() => setSelectedScenario(s)}
                  activeOpacity={0.8}
                >
                  <View style={styles.scenarioCardTop}>
                    <Text style={styles.scenarioName} numberOfLines={1}>
                      {language === 'hi' ? s.title_hi : s.title}
                    </Text>
                    <View style={[
                      styles.scenarioBadge,
                      s.screeningType === 'pregnancy' ? styles.pregBadge : styles.ncdBadge
                    ]}>
                      <Text style={styles.scenarioBadgeText}>
                        {s.screeningType === 'pregnancy' ? t.pregnancyType : t.ncdType}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.scenarioTranscript} numberOfLines={2}>
                    {s.transcript}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom Process CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.processCTA}
          onPress={handleAnalyzeAndProceed}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={Colors.surface} />
          ) : (
            <>
              <Text style={styles.processCTAText}>{t.extractAndReviewBtn}</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.surface} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
    flexShrink: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.primary,
    marginTop: 1,
    fontWeight: '600',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.surfaceContainer,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  content: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: Colors.primary,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  modeTabTextActive: {
    color: Colors.surface,
  },
  patientSelectorBox: {
    marginBottom: 10,
  },
  selectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  patientChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  patientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  patientChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  patientChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  patientChipTextActive: {
    color: Colors.surface,
    fontWeight: '700',
  },
  addPatientBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addPatientBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  typeBtnTextActive: {
    color: Colors.surface,
  },
  liveContainer: {
    alignItems: 'center',
  },
  micVisualizerArea: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  waveCircle: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primaryBright,
  },
  micBigButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  micBigButtonActive: {
    backgroundColor: Colors.danger,
  },
  timerDisplay: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
    textAlign: 'center',
  },
  sttHint: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.danger,
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  transcriptCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transcriptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  transcriptCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Colors.surfaceContainer,
  },
  clearBtnText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  transcriptInput: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    color: Colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  quickChipsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 4,
  },
  quickChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  quickChip: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  scenarioContainer: {
    width: '100%',
  },
  scenarioHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  scenarioCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  scenarioCardActive: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.surfaceContainer,
  },
  scenarioCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scenarioName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
    flexShrink: 1,
    marginRight: 6,
  },
  scenarioBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pregBadge: {
    backgroundColor: Colors.accentLight,
  },
  ncdBadge: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  scenarioBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  scenarioTranscript: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  footer: {
    padding: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  processCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  processCTAText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.surface,
  },
});
