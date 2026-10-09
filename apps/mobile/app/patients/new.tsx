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
  const [phoneOwner, setPhoneOwner] = useState<'self' | 'spouse' | 'parent' | 'neighbor' | 'other'>('self');
  const [village, setVillage] = useState(language === 'hi' ? 'रामपुर' : 'Rampur');
  const [hamletTola, setHamletTola] = useState('');
  const [householdId, setHouseholdId] = useState('HH-');
  const [relationshipToHead, setRelationshipToHead] = useState(language === 'hi' ? 'स्वयं' : 'Self');
  const [abhaId, setAbhaId] = useState('');
  const [disabilityAccessNeeds, setDisabilityAccessNeeds] = useState('');
  const [consentObtained, setConsentObtained] = useState(true);
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
        phone_owner: phoneOwner,
        village: village.trim(),
        hamlet_tola: hamletTola.trim() || undefined,
        household_id: householdId.trim() || undefined,
        relationship_to_head: relationshipToHead.trim() || undefined,
        abha_id: abhaId.trim() || undefined,
        disability_access_needs: disabilityAccessNeeds.trim() || undefined,
        consent_obtained: consentObtained,
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
          <View style={[styles.genderRow, { marginTop: 6 }]}>
            {(['self', 'spouse', 'parent', 'other'] as const).map(owner => (
              <TouchableOpacity
                key={owner}
                style={[styles.genderBtn, phoneOwner === owner && styles.genderBtnActive]}
                onPress={() => setPhoneOwner(owner)}
              >
                <Text style={[styles.genderText, phoneOwner === owner && styles.genderTextActive]}>
                  {owner === 'self' ? (language === 'hi' ? 'स्वयं' : 'Self') :
                   owner === 'spouse' ? (language === 'hi' ? 'पति/पत्नी' : 'Spouse') :
                   owner === 'parent' ? (language === 'hi' ? 'माता/पिता' : 'Parent') :
                   (language === 'hi' ? 'अन्य' : 'Other')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>{t.villageLabel}</Text>
            <TextInput
              style={styles.input}
              value={village}
              onChangeText={setVillage}
            />
          </View>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>{language === 'hi' ? 'टोला / मोहल्ला' : 'Hamlet / Tola'}</Text>
            <TextInput
              style={styles.input}
              placeholder={language === 'hi' ? 'उदा. पटेल नगर' : 'e.g. Patel Nagar'}
              placeholderTextColor={Colors.textMuted}
              value={hamletTola}
              onChangeText={setHamletTola}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>{t.householdLabel}</Text>
            <TextInput
              style={styles.input}
              placeholder="HH-101"
              placeholderTextColor={Colors.textMuted}
              value={householdId}
              onChangeText={setHouseholdId}
            />
          </View>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>{language === 'hi' ? 'मुखिया से संबंध' : 'Relation to Head'}</Text>
            <TextInput
              style={styles.input}
              placeholder={language === 'hi' ? 'स्वयं / पत्नी / बेटा' : 'Self / Spouse / Child'}
              placeholderTextColor={Colors.textMuted}
              value={relationshipToHead}
              onChangeText={setRelationshipToHead}
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{language === 'hi' ? 'आभा कार्ड संख्या (ABHA ID - 14 अंक)' : 'ABHA Health ID (14 digits)'}</Text>
          <TextInput
            style={styles.input}
            placeholder="12-3456-7890-1234"
            placeholderTextColor={Colors.textMuted}
            value={abhaId}
            onChangeText={setAbhaId}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{language === 'hi' ? 'दिव्यांगता / विशेष सहायता' : 'Disability / Access Needs'}</Text>
          <TextInput
            style={styles.input}
            placeholder={language === 'hi' ? 'यदि कोई हो (उदा. चलने में असमर्थ)' : 'If any (e.g. mobility assistance)'}
            placeholderTextColor={Colors.textMuted}
            value={disabilityAccessNeeds}
            onChangeText={setDisabilityAccessNeeds}
          />
        </View>

        <View style={[styles.formGroup, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }]}>
          <Text style={[styles.label, { marginBottom: 0, flex: 1 }]}>
            {language === 'hi' ? 'लाभार्थी की सहमति ली गई (Consent)' : 'Informed Consent Obtained'}
          </Text>
          <TouchableOpacity
            style={[styles.genderBtn, { flex: 0, paddingHorizontal: 16 }, consentObtained && styles.genderBtnActive]}
            onPress={() => setConsentObtained(!consentObtained)}
          >
            <Text style={[styles.genderText, consentObtained && styles.genderTextActive]}>
              {consentObtained ? (language === 'hi' ? 'हाँ (Yes)' : 'Yes') : (language === 'hi' ? 'नहीं (No)' : 'No')}
            </Text>
          </TouchableOpacity>
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
