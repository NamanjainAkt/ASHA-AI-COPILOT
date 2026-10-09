import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { patientRepository } from '../../services/db/patientRepo';
import { syncQueueRepository } from '../../services/db/syncQueueRepo';
import { getDatabase } from '../../services/db/database';
import { Gender } from '@asha/shared';

export default function NewPatientScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Gender>('female');
  const [phone, setPhone] = useState('');
  const [village, setVillage] = useState(language === 'hi' ? 'रामपुर' : 'Rampur');
  const [householdId, setHouseholdId] = useState('HH-');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('worker_profile').then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.village) setVillage(parsed.village);
        } catch (_) {}
      }
    });
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t.error, t.nameError);
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
      Alert.alert(t.error, t.ageError);
      return;
    }

    setSaving(true);
    try {
      const patientId = `p-${Date.now()}`;
      const newPatient = {
        id: patientId,
        name: name.trim(),
        age: ageNum,
        sex,
        phone: phone.trim() || undefined,
        village: village.trim(),
        household_id: householdId.trim() || undefined,
        sync_status: 'pending' as const
      };

      // 1. Save in SQLite & 2. Enqueue in Sync Queue (atomic transaction)
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await patientRepository.create(newPatient, db);
        await syncQueueRepository.enqueue('patient', patientId, 'create', newPatient, db);
      });

      setSaving(false);
      Alert.alert(
        t.success,
        t.beneficiarySaved,
        [{ text: t.ok, onPress: () => router.back() }]
      );
    } catch (e: any) {
      setSaving(false);
      Alert.alert(t.error, e.message || 'Error saving beneficiary');
    }
  };

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/patients');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleClose} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.newBeneficiaryTitle}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{t.newBeneficiarySub}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>{t.fullNameLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.namePlaceholder}
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>{t.ageLabel}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.agePlaceholder}
              placeholderTextColor={Colors.textMuted}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
            />
          </View>

          <View style={[styles.formGroup, { flex: 1.3 }]}>
            <Text style={styles.label}>{t.genderLabel}</Text>
            <View style={styles.genderRow}>
              <TouchableOpacity
                style={[styles.genderBtn, sex === 'female' && styles.genderBtnActive]}
                onPress={() => setSex('female')}
              >
                <Text style={[styles.genderText, sex === 'female' && styles.genderTextActive]}>
                  {t.gender.female}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderBtn, sex === 'male' && styles.genderBtnActive]}
                onPress={() => setSex('male')}
              >
                <Text style={[styles.genderText, sex === 'male' && styles.genderTextActive]}>
                  {t.gender.male}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t.phoneLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder="9876543210"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t.villageLabel}</Text>
          <TextInput
            style={styles.input}
            value={village}
            onChangeText={setVillage}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t.householdLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder="HH-101"
            placeholderTextColor={Colors.textMuted}
            value={householdId}
            onChangeText={setHouseholdId}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle" size={18} color={Colors.surface} />
          <Text style={styles.saveBtnText}>{t.saveBeneficiaryBtn}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
    flexShrink: 1,
    marginLeft: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  content: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 6,
  },
  genderBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  genderBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  genderText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  genderTextActive: {
    color: Colors.surface,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.surface,
  },
});
