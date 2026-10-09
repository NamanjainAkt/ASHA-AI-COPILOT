import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { getDatabase } from '../../services/db/database';
import { patientRepository } from '../../services/db/patientRepo';
import { syncQueueRepository } from '../../services/db/syncQueueRepo';
import { Patient } from '@asha/shared';

type Sex = NonNullable<Patient['sex']>;
type PhoneOwner = NonNullable<Patient['phone_owner']>;

export default function EditPatientScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language, t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('female');
  const [phone, setPhone] = useState('');
  const [phoneOwner, setPhoneOwner] = useState<PhoneOwner>('self');
  const [village, setVillage] = useState('');
  const [hamletTola, setHamletTola] = useState('');
  const [householdId, setHouseholdId] = useState('');
  const [relationshipToHead, setRelationshipToHead] = useState('');
  const [abhaId, setAbhaId] = useState('');
  const [disabilityAccessNeeds, setDisabilityAccessNeeds] = useState('');
  const [consentObtained, setConsentObtained] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    patientRepository.getById(id).then((p) => {
      if (p) {
        setPatient(p);
        setName(p.name);
        setAge(p.age.toString());
        setSex(p.sex);
        setPhone(p.phone || '');
        setPhoneOwner(p.phone_owner || 'self');
        setVillage(p.village);
        setHamletTola(p.hamlet_tola || '');
        setHouseholdId(p.household_id || '');
        setRelationshipToHead(p.relationship_to_head || '');
        setAbhaId(p.abha_id || '');
        setDisabilityAccessNeeds(p.disability_access_needs || '');
        setConsentObtained(p.consent_obtained !== false);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [id]);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/patients');
    }
  };

  const handleSave = async () => {
    if (!patient) return;
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
      const updatedPatient: Patient = {
        ...patient,
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
        sync_status: 'pending'
      };

      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await patientRepository.update(updatedPatient, db);
        await syncQueueRepository.enqueue('patient', patient.id, 'update', updatedPatient as unknown as Record<string, unknown>, db);
      });

      setSaving(false);
      Alert.alert(
        t.success,
        language === 'hi' ? 'लाभार्थी विवरण सफलतापूर्वक अपडेट किया गया।' : 'Beneficiary details updated successfully.',
        [{ text: t.ok, onPress: () => router.back() }]
      );
    } catch (e: any) {
      setSaving(false);
      Alert.alert(t.error, e.message || 'Error updating beneficiary');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!patient) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={handleClose}>
            <Ionicons name="close" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.patientNotFound}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={44} color={Colors.danger} />
          <Text style={styles.loadingText}>{t.patientNotFound}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleClose} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {language === 'hi' ? 'लाभार्थी विवरण संपादित करें' : 'Edit Beneficiary Details'}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>ID: #{patient.id}</Text>
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
            {(['self', 'spouse', 'parent', 'neighbor', 'other'] as const).map(owner => (
              <TouchableOpacity
                key={owner}
                style={[styles.genderBtn, phoneOwner === owner && styles.genderBtnActive]}
                onPress={() => setPhoneOwner(owner)}
              >
                <Text style={[styles.genderText, phoneOwner === owner && styles.genderTextActive]}>
                  {owner === 'self' ? (language === 'hi' ? 'स्वयं' : 'Self') :
                   owner === 'spouse' ? (language === 'hi' ? 'पति/पत्नी' : 'Spouse') :
                   owner === 'parent' ? (language === 'hi' ? 'माता/पिता' : 'Parent') :
                   owner === 'neighbor' ? (language === 'hi' ? 'पड़ोसी' : 'Neighbor') :
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
          <Text style={styles.saveBtnText}>
            {language === 'hi' ? 'परिवर्तन सुरक्षित करें' : 'Save Changes'}
          </Text>
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
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
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl + 20,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  genderRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  genderBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  genderText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  genderTextActive: {
    color: Colors.primary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: Spacing.md,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: Colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
});
