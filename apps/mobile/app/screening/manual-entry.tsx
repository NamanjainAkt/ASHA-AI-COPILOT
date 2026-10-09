import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { getDatabase } from '../../services/db/database';
import { evaluateRules } from '../../services/rules/engine';
import { screeningRepository } from '../../services/db/screeningRepo';
import { syncQueueRepository } from '../../services/db/syncQueueRepo';
import { followupRepository } from '../../services/db/followupRepo';
import { StructuredScreeningData, ScreeningType } from '@asha/shared';

export default function ManualEntryScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const params = useLocalSearchParams<{ patientId?: string; patientName?: string }>();

  const [patientName, setPatientName] = useState(params.patientName || '');
  const [screeningType, setScreeningType] = useState<ScreeningType>('ncd');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [glucose, setGlucose] = useState('');
  const [tobacco, setTobacco] = useState(false);
  const [missedMeds, setMissedMeds] = useState(false);
  const [gestationalWeeks, setGestationalWeeks] = useState('28');
  const [vaginalBleeding, setVaginalBleeding] = useState(false);
  const [severeHeadache, setSevereHeadache] = useState(false);
  const [isHumanConfirmed, setIsHumanConfirmed] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!patientName.trim()) {
      Alert.alert(t.error, t.nameError);
      return;
    }
    if (!isHumanConfirmed) {
      Alert.alert(
        language === 'hi' ? 'पुष्टि आवश्यक' : 'Confirmation Required',
        language === 'hi' ? 'कृपया डेटा पुष्टि चेकबॉक्स पर टिक करें' : 'Please check the confirmation box'
      );
      return;
    }

    setSaving(true);
    try {
      const structuredData: StructuredScreeningData = {
        screening_type: screeningType,
        ncd: screeningType === 'ncd' ? {
          bp_systolic: systolic ? parseInt(systolic, 10) : null,
          bp_diastolic: diastolic ? parseInt(diastolic, 10) : null,
          blood_glucose: glucose ? parseInt(glucose, 10) : null,
          tobacco_use: tobacco,
          medication_adherence: !missedMeds,
          known_hypertension: true,
        } : undefined,
        pregnancy: screeningType === 'pregnancy' ? {
          pregnancy_status: 'pregnant',
          gestational_age_weeks: gestationalWeeks ? parseInt(gestationalWeeks, 10) : 28,
          vaginal_bleeding: vaginalBleeding,
          severe_headache: severeHeadache,
          follow_up_required: vaginalBleeding || severeHeadache,
        } : undefined
      };

      const patientId = params.patientId as string;
      if (!patientId || patientId === 'undefined') {
        setSaving(false);
        Alert.alert(
          language === 'hi' ? 'लाभार्थी अनुपलब्ध' : 'Beneficiary Missing',
          language === 'hi'
            ? 'कृपया पहले लाभार्थी का चयन करें।'
            : 'Please select a beneficiary before saving.'
        );
        return;
      }

      const rules = evaluateRules(structuredData);
      const screeningId = `screen-${Date.now()}`;

      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await screeningRepository.create({
          id: screeningId,
          patient_id: patientId,
          screening_type: screeningType,
          transcript: language === 'hi' ? 'मैन्युअल फॉर्म प्रविष्टि' : 'Manual form entry',
          structured_data: structuredData,
          rule_results: rules,
          summary: language === 'hi'
            ? `${patientName} की स्वास्थ्य जांच दर्ज की गई।`
            : `Health screening recorded for ${patientName}.`,
          confirmed: true,
          sync_status: 'pending'
        }, db);

        // Enqueue sync item
        await syncQueueRepository.enqueue('screening', screeningId, 'create', {
          patient_id: patientId,
          screening_type: screeningType,
          structured_data: structuredData,
          rule_results: rules,
          summary: `${patientName} screening saved.`,
          confirmed: true
        }, db);

        // Generate followup if high risk (ISS-112: Enqueue follow-up for sync)
        const highRisk = rules.find(r => r.priority === 'high');
        if (highRisk) {
          const followupId = `fol-${Date.now()}`;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 3);
          const dateStr = dueDate.toISOString().split('T')[0];
          const followupReason = language === 'hi' ? (highRisk.reason_hi || highRisk.reason) : highRisk.reason;

          await followupRepository.create({
            id: followupId,
            patient_id: patientId,
            screening_id: screeningId,
            reason: followupReason,
            priority: 'high',
            due_date: dateStr,
            status: 'pending',
            sync_status: 'pending'
          }, db);

          await syncQueueRepository.enqueue('followup', followupId, 'create', {
            patient_id: patientId,
            screening_id: screeningId,
            reason: followupReason,
            priority: 'high',
            due_date: dateStr,
            status: 'pending'
          }, db);
        }
      });

      setSaving(false);
      Alert.alert(
        t.saveSuccessTitle,
        t.saveSuccessMsg,
        [{ text: t.okBtn, onPress: () => router.replace('/(tabs)') }]
      );
    } catch (e: any) {
      setSaving(false);
      Alert.alert(t.error, e.message || 'Error saving record');
    }
  };

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleClose} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.manualEntryTitle}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{t.manualEntrySub}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Beneficiary Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>{t.fullNameLabel}</Text>
          <TextInput
            style={styles.input}
            value={patientName}
            onChangeText={setPatientName}
            placeholder={t.namePlaceholder}
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Screening Type Toggle */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>{t.selectScreeningType}</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, screeningType === 'ncd' && styles.typeBtnActive]}
              onPress={() => setScreeningType('ncd')}
            >
              <Text style={[styles.typeBtnText, screeningType === 'ncd' && styles.typeBtnTextActive]}>
                {t.ncdType}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, screeningType === 'pregnancy' && styles.typeBtnActive]}
              onPress={() => setScreeningType('pregnancy')}
            >
              <Text style={[styles.typeBtnText, screeningType === 'pregnancy' && styles.typeBtnTextActive]}>
                {t.pregnancyType}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Screening Specific Fields */}
        {screeningType === 'ncd' ? (
          <>
            <View style={styles.row}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t.systolicLabel}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="120"
                  placeholderTextColor={Colors.textMuted}
                  value={systolic}
                  onChangeText={setSystolic}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t.diastolicLabel}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="80"
                  placeholderTextColor={Colors.textMuted}
                  value={diastolic}
                  onChangeText={setDiastolic}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t.glucoseLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder="110"
                placeholderTextColor={Colors.textMuted}
                value={glucose}
                onChangeText={setGlucose}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                {language === 'hi' ? 'तंबाकू / बीड़ी सेवन:' : 'Tobacco / Beedi Use:'}
              </Text>
              <Switch
                value={tobacco}
                onValueChange={setTobacco}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={tobacco ? Colors.surface : Colors.outline}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                {language === 'hi' ? 'नियमित बीपी दवा छूटी है:' : 'Missed BP Medication:'}
              </Text>
              <Switch
                value={missedMeds}
                onValueChange={setMissedMeds}
                trackColor={{ false: Colors.border, true: Colors.danger }}
                thumbColor={missedMeds ? Colors.surface : Colors.outline}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t.gestationalWeeksLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder="28"
                placeholderTextColor={Colors.textMuted}
                value={gestationalWeeks}
                onChangeText={setGestationalWeeks}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t.bleedingLabel}</Text>
              <Switch
                value={vaginalBleeding}
                onValueChange={setVaginalBleeding}
                trackColor={{ false: Colors.border, true: Colors.danger }}
                thumbColor={vaginalBleeding ? Colors.surface : Colors.outline}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                {language === 'hi' ? 'तेज सिरदर्द / धुंधला दिखना:' : 'Severe Headache / Blurred Vision:'}
              </Text>
              <Switch
                value={severeHeadache}
                onValueChange={setSevereHeadache}
                trackColor={{ false: Colors.border, true: Colors.danger }}
                thumbColor={severeHeadache ? Colors.surface : Colors.outline}
              />
            </View>
          </>
        )}

        {/* Verification Check */}
        <View style={styles.verificationRow}>
          <Switch
            value={isHumanConfirmed}
            onValueChange={setIsHumanConfirmed}
            trackColor={{ false: Colors.border, true: Colors.success }}
            thumbColor={isHumanConfirmed ? Colors.surface : Colors.outline}
          />
          <Text style={styles.verificationText}>
            {language === 'hi' ? 'मैंने उपरोक्त सभी आंकड़े जांच लिए हैं।' : 'I have verified all the entered values.'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-done" size={18} color={Colors.surface} />
          <Text style={styles.saveBtnText}>{t.evaluateAndSaveBtn}</Text>
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
    marginBottom: 10,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainer,
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginVertical: 12,
  },
  verificationText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textPrimary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
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
