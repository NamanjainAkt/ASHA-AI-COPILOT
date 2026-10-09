import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing } from '../constants/theme';
import { useLanguage } from '../context/LanguageContext';
import { hashPin } from '@asha/shared';

export default function LoginScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [selectedRole, setSelectedRole] = useState<'asha' | 'supervisor'>('asha');
  const [pin, setPin] = useState('');
  const [workerProfile, setWorkerProfile] = useState<{
    name: string;
    id: string;
    village: string;
    subCenter?: string;
  }>({
    name: language === 'hi' ? 'सुनीता देवी' : 'Sunita Devi',
    id: 'ASHA-UP-402',
    village: language === 'hi' ? 'रामपुर' : 'Rampur',
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const raw = await SecureStore.getItemAsync('worker_profile');
        if (raw) {
          const parsed = JSON.parse(raw);
          setWorkerProfile({
            name: parsed.name || (language === 'hi' ? 'सुनीता देवी' : 'Sunita Devi'),
            id: parsed.id || 'ASHA-UP-402',
            village: parsed.village || (language === 'hi' ? 'रामपुर' : 'Rampur'),
            subCenter: parsed.subCenter,
          });
        }
      } catch (e) {
        console.warn('Could not load worker profile', e);
      }
    };
    loadProfile();
  }, [language]);

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  useEffect(() => {
    // Check if previously locked out with active cooldown (ISS-001)
    SecureStore.getItemAsync('auth_lockout_until').then(val => {
      if (val) {
        const until = parseInt(val, 10);
        if (Date.now() < until) {
          setLockoutUntil(until);
        } else {
          SecureStore.deleteItemAsync('auth_lockout_until').catch(() => {});
        }
      }
    }).catch(() => {});
  }, []);

  const handleLogin = async () => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingMin = Math.ceil((lockoutUntil - Date.now()) / 60000);
      Alert.alert(
        t.error,
        language === 'hi'
          ? `अत्यधिक गलत प्रयासों के कारण लॉगिन लॉक है। कृपया ${remainingMin} मिनट प्रतीक्षा करें।`
          : `Login is locked due to too many failed attempts. Please wait ${remainingMin} minute(s).`
      );
      return;
    } else if (lockoutUntil && Date.now() >= lockoutUntil) {
      setLockoutUntil(null);
      setFailedAttempts(0);
      await SecureStore.deleteItemAsync('auth_lockout_until').catch(() => {});
    }

    if (pin.length !== 4) {
      Alert.alert(t.error, t.invalidPinMsg);
      return;
    }

    try {
      const savedPin = await SecureStore.getItemAsync('worker_auth_pin');

      if (!savedPin) {
        Alert.alert(
          t.error,
          language === 'hi' ? 'कोई पिन सेट नहीं है। कृपया ऑनबोर्डिंग पूरी करें।' : 'No PIN configured. Please complete onboarding first.'
        );
        router.replace('/onboarding');
        return;
      }

      const hashedAttempt = await hashPin(pin);
      // ISS-001: Strictly verify hash; only allow legacy 4-char comparison for automatic upgrade
      const isLegacyPlaintext = savedPin.length === 4;
      const isMatch = isLegacyPlaintext ? (pin === savedPin) : (hashedAttempt === savedPin);

      if (isMatch) {
        if (isLegacyPlaintext) {
          // Upgrade legacy cleartext PIN to hash
          await SecureStore.setItemAsync('worker_auth_pin', hashedAttempt);
        }
        await SecureStore.setItemAsync('session_active', 'true');
        await SecureStore.setItemAsync('worker_role', selectedRole);
        await SecureStore.deleteItemAsync('auth_lockout_until').catch(() => {});
        setFailedAttempts(0);
        setLockoutUntil(null);
        router.replace('/(tabs)');
      } else {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          const cooldownUntil = Date.now() + 5 * 60 * 1000; // 5-minute lockout cooldown
          setLockoutUntil(cooldownUntil);
          await SecureStore.setItemAsync('auth_lockout_until', String(cooldownUntil));
          Alert.alert(
            t.error,
            language === 'hi'
              ? 'अत्यधिक गलत प्रयास (5/5)। लॉगिन 5 मिनट के लिए लॉक कर दिया गया है।'
              : 'Too many incorrect attempts (5/5). Login locked for 5 minutes.'
          );
        } else {
          Alert.alert(
            t.error,
            language === 'hi'
              ? `गलत पिन। शेष प्रयास: ${5 - nextAttempts}`
              : `Incorrect PIN. Remaining attempts: ${5 - nextAttempts}`
          );
        }
      }
    } catch (e) {
      console.error('SecureStore login exception:', e);
      Alert.alert(
        t.error,
        language === 'hi' ? 'सुरक्षा भंडारण त्रुटि। कृपया पुनः प्रयास करें।' : 'Secure storage error. Please try again.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          {/* Top Banner */}
          <View style={styles.header}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>{t.appName}</Text>
            <Text style={styles.subtitle}>{t.loginHeaderTitle}</Text>
          </View>

          {/* Role Picker */}
          <View style={styles.roleCard}>
            <Text style={styles.sectionLabel}>{t.selectRole}</Text>
            <View style={styles.roleButtonsRow}>
              <TouchableOpacity
                style={[styles.roleBtn, selectedRole === 'asha' && styles.roleBtnActive]}
                onPress={() => setSelectedRole('asha')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={18}
                  color={selectedRole === 'asha' ? Colors.surface : Colors.primary}
                />
                <Text style={[styles.roleBtnText, selectedRole === 'asha' && styles.roleBtnTextActive]}>
                  {t.ashaRoleTitle}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleBtn, selectedRole === 'supervisor' && styles.roleBtnActive]}
                onPress={() => setSelectedRole('supervisor')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={selectedRole === 'supervisor' ? Colors.surface : Colors.primary}
                />
                <Text style={[styles.roleBtnText, selectedRole === 'supervisor' && styles.roleBtnTextActive]}>
                  {t.supervisorRoleTitle}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Worker ID Banner */}
          <View style={styles.workerIdCard}>
            <Image
              source={require('../assets/worker_avatar.png')}
              style={styles.avatarImg}
            />
            <View style={styles.workerMetaCol}>
              <Text style={styles.workerName} numberOfLines={1}>{workerProfile.name}</Text>
              <Text style={styles.workerIdText}>ID: #{workerProfile.id} · {workerProfile.village}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{t.verified}</Text>
            </View>
          </View>

          {/* PIN Input Section */}
          <View style={styles.pinSection}>
            <Text style={styles.pinLabel}>{t.pinPrompt}</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={setPin}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.hintText}>
              {language === 'hi' ? '4-अंकीय गोपनीय पिन दर्ज करें' : 'Enter 4-digit secret PIN'}
            </Text>
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            activeOpacity={0.85}
          >
            <Ionicons name="log-in-outline" size={20} color={Colors.surface} />
            <Text style={styles.loginBtnText}>{t.loginBtn}</Text>
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
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  roleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  roleButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  roleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  roleBtnTextActive: {
    color: Colors.surface,
  },
  workerIdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
    gap: 10,
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  workerMetaCol: {
    flex: 1,
    flexShrink: 1,
  },
  workerName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  workerIdText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  statusPill: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
  },
  pinSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 10,
    width: 140,
    height: 48,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 10,
    color: Colors.textPrimary,
  },
  hintText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  loginBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.surface,
  },
});
