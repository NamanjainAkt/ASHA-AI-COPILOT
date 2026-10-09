import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { getDatabase } from '../../services/db/database';
import { hashPin } from '@asha/shared';

export default function OnboardingScreen() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const [step, setStep] = useState<number>(1);
  
  // Worker profile form initialized empty (ISS-221)
  const [name, setName] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [village, setVillage] = useState('');
  const [subCenter, setSubCenter] = useState('');
  const [phone, setPhone] = useState('');

  // PIN setup initialized empty (ISS-221)
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handleNextStep = () => {
    if (step === 2) {
      if (!name.trim()) {
        Alert.alert(t.error, t.nameError);
        return;
      }
      if (!workerId.trim()) {
        Alert.alert(t.error, language === 'hi' ? 'कृपया अपनी आशा आईडी दर्ज करें' : 'Please enter your ASHA ID');
        return;
      }
      if (!village.trim()) {
        Alert.alert(t.error, language === 'hi' ? 'कृपया अपने गांव का नाम दर्ज करें' : 'Please enter your village name');
        return;
      }
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        Alert.alert(
          t.error,
          language === 'hi'
            ? 'कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें'
            : 'Please enter a valid 10-digit mobile number'
        );
        return;
      }
    } else if (step === 3) {
      if (pin.length !== 4) {
        Alert.alert(t.error, t.invalidPinMsg);
        return;
      }
      if (pin !== confirmPin) {
        Alert.alert(t.error, t.pinsDoNotMatch);
        return;
      }
    }
    setStep(s => s + 1);
  };

  const handleCompleteOnboarding = async () => {
    try {
      // 1. Save credentials in SecureStore (hashed PIN: ISS-219)
      const hashedPin = await hashPin(pin);
      await SecureStore.setItemAsync('has_onboarded', 'true');
      await SecureStore.setItemAsync('session_active', 'true');
      await SecureStore.setItemAsync('worker_auth_pin', hashedPin);
      await SecureStore.setItemAsync('user_language', language);
      await SecureStore.setItemAsync(
        'worker_profile',
        JSON.stringify({
          id: workerId,
          name,
          village,
          subCenter,
          phone,
          role: 'asha'
        })
      );

      // 2. Insert or update in SQLite database
      const db = await getDatabase();
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT OR REPLACE INTO workers (id, name, phone, role, village, sub_center, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [workerId, name, phone, 'asha', village, subCenter, now]
      );

      Alert.alert(
        t.success,
        `${language === 'hi' ? 'नमस्ते' : 'Hello'} ${name}! ${t.onboardingCompleteMsg}`,
        [{ text: t.completeOnboardingBtn, onPress: () => router.replace('/(tabs)') }]
      );
    } catch (err: any) {
      Alert.alert(t.error, err.message || 'Error saving onboarding');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header Progress Bar */}
        <View style={styles.header}>
          <View style={styles.progressContainer}>
            {[1, 2, 3, 4].map(s => (
              <View
                key={s}
                style={[
                  styles.progressSegment,
                  s <= step && styles.progressSegmentActive,
                  s === step && styles.progressSegmentCurrent
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepIndicator}>
            {language === 'hi' ? `चरण ${step}/4` : `Step ${step} of 4`}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* STEP 1: LANGUAGE SELECTION */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="language" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.stepTitle}>
                {language === 'hi' ? 'अपनी भाषा चुनें' : 'Select Your Language'}
              </Text>
              <Text style={styles.stepSub}>
                {language === 'hi' ? 'ऐप की मुख्य भाषा निर्धारित करें' : 'Choose primary application language'}
              </Text>

              <View style={styles.optionsList}>
                <TouchableOpacity
                  style={[styles.langCard, language === 'hi' && styles.langCardActive]}
                  onPress={() => setLanguage('hi')}
                  activeOpacity={0.8}
                >
                  <View style={styles.langRadio}>
                    {language === 'hi' && <View style={styles.langRadioInner} />}
                  </View>
                  <View style={{ flex: 1, flexShrink: 1 }}>
                    <Text style={styles.langName}>हिंदी</Text>
                    <Text style={styles.langDesc}>सभी निर्देश एवं वॉइस सहायक हिंदी में</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.langCard, language === 'en' && styles.langCardActive]}
                  onPress={() => setLanguage('en')}
                  activeOpacity={0.8}
                >
                  <View style={styles.langRadio}>
                    {language === 'en' && <View style={styles.langRadioInner} />}
                  </View>
                  <View style={{ flex: 1, flexShrink: 1 }}>
                    <Text style={styles.langName}>English</Text>
                    <Text style={styles.langDesc}>Instructions & Voice Assistant in English</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.noticeBox}>
                <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
                <Text style={styles.noticeText}>
                  {language === 'hi'
                    ? 'आप बाद में प्रोफ़ाइल सेटिंग से कभी भी भाषा बदल सकती हैं।'
                    : 'You can change the language anytime from your profile.'}
                </Text>
              </View>
            </View>
          )}

          {/* STEP 2: WORKER PROFILE SETUP */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="person" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.stepTitle}>
                {language === 'hi' ? 'आशा कार्यकर्ता विवरण' : 'Worker Profile'}
              </Text>
              <Text style={styles.stepSub}>
                {language === 'hi' ? 'अपनी पहचान एवं कार्यक्षेत्र दर्ज करें' : 'Enter your credentials and assigned area'}
              </Text>

              <View style={styles.formCard}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t.fullNameLabel}</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder={t.namePlaceholder}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t.workerIdLabel}</Text>
                  <TextInput
                    style={styles.input}
                    value={workerId}
                    onChangeText={setWorkerId}
                    placeholder="ASHA-UP-402"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t.villageLabel} *</Text>
                  <TextInput
                    style={styles.input}
                    value={village}
                    onChangeText={setVillage}
                    placeholder={language === 'hi' ? 'रामपुर' : 'Rampur'}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t.subCenterLabel}</Text>
                  <TextInput
                    style={styles.input}
                    value={subCenter}
                    onChangeText={setSubCenter}
                    placeholder={language === 'hi' ? 'रामपुर उप-केंद्र' : 'Rampur Sub-Center'}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t.phoneLabel}</Text>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="9876543210"
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: SECURITY PIN SETUP */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="lock-closed" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.stepTitle}>{t.createPinLabel}</Text>
              <Text style={styles.stepSub}>
                {language === 'hi' ? 'ऑफलाइन सुरक्षा एवं लॉगिन के लिए 4 अंकों का पिन' : '4-digit PIN for offline login security'}
              </Text>

              <View style={styles.pinCard}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t.createPinLabel}</Text>
                  <TextInput
                    style={styles.pinInput}
                    value={pin}
                    onChangeText={setPin}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t.confirmPinLabel}</Text>
                  <TextInput
                    style={styles.pinInput}
                    value={confirmPin}
                    onChangeText={setConfirmPin}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 4: CONFIRMATION & OVERVIEW */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <View style={[styles.iconCircle, { backgroundColor: Colors.successLight }]}>
                <Ionicons name="checkmark-done" size={32} color={Colors.success} />
              </View>
              <Text style={styles.stepTitle}>
                {language === 'hi' ? 'तैयार है!' : 'Ready!'}
              </Text>
              <Text style={styles.stepSub}>{t.welcomeTagline}</Text>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{language === 'hi' ? 'कार्यकर्ता:' : 'Worker:'}</Text>
                  <Text style={styles.summaryVal}>{name}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{language === 'hi' ? 'आईडी:' : 'ID:'}</Text>
                  <Text style={styles.summaryVal}>#{workerId}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{language === 'hi' ? 'कार्यक्षेत्र:' : 'Area:'}</Text>
                  <Text style={styles.summaryVal}>{village}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{language === 'hi' ? 'भाषा:' : 'Language:'}</Text>
                  <Text style={styles.summaryVal}>{language === 'hi' ? 'हिंदी' : 'English'}</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer Navigation Buttons */}
        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(s => s - 1)}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>{language === 'hi' ? 'पीछे' : 'Back'}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.nextButton, step === 1 && { flex: 1 }]}
            onPress={step === 4 ? handleCompleteOnboarding : handleNextStep}
            activeOpacity={0.85}
          >
            <Text style={styles.nextButtonText}>
              {step === 4 ? t.completeOnboardingBtn : (language === 'hi' ? 'आगे बढ़ें' : 'Next')}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.surface} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  progressSegmentActive: {
    backgroundColor: Colors.primary,
  },
  progressSegmentCurrent: {
    backgroundColor: Colors.primaryBright,
  },
  stepIndicator: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  scrollContent: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  stepContainer: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  stepSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  optionsList: {
    width: '100%',
    gap: 10,
    marginBottom: 14,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langCardActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.surfaceContainer,
  },
  langRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  langName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  langDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  formCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  inputGroup: {
    marginBottom: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pinCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  pinInput: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainer,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  nextButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.surface,
  },
});
