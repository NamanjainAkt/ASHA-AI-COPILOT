import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { RiskCard } from '../../components/RiskCard';
import { patientRepository } from '../../services/db/patientRepo';
import { screeningRepository } from '../../services/db/screeningRepo';
import { followupRepository } from '../../services/db/followupRepo';
import { syncQueueRepository } from '../../services/db/syncQueueRepo';
import { getDatabase } from '../../services/db/database';
import { evaluateRules } from '../../services/rules/engine';
import { screeningOrchestrator } from '../../services/ai/orchestrator';
import { StructuredScreeningData, RuleResult, ScreeningType } from '@asha/shared';

export default function VisitSummaryScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const params = useLocalSearchParams<{
    resultJson?: string;
    screeningId?: string;
    patientId?: string;
    patientName?: string;
    screeningType?: string;
  }>();

  // Parse result from in-memory orchestrator cache first
  let initialResult = screeningOrchestrator.getLastResult();
  if (!initialResult && params.resultJson) {
    try {
      initialResult = JSON.parse(params.resultJson);
    } catch (e) {
      console.warn('Could not parse resultJson', e);
    }
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const [patientRecord, setPatientRecord] = useState<any>(null);

  useEffect(() => {
    if (params.patientId) {
      patientRepository.getById(params.patientId).then((p: any) => {
        if (p) setPatientRecord(p);
      });
    }
  }, [params.patientId]);

  const patientName = patientRecord?.name || params.patientName || (language === 'hi' ? 'लाभार्थी' : 'Beneficiary');
  const screeningType: ScreeningType = (params.screeningType as ScreeningType) || 'ncd';

  // State for editable structured data (ISS-102: Do not manufacture vitals defaults)
  const [systolic, setSystolic] = useState<string>(
    initialResult?.extracted?.ncd?.bp_systolic != null ? String(initialResult.extracted.ncd.bp_systolic) : ''
  );
  const [diastolic, setDiastolic] = useState<string>(
    initialResult?.extracted?.ncd?.bp_diastolic != null ? String(initialResult.extracted.ncd.bp_diastolic) : ''
  );
  const [glucose, setGlucose] = useState<string>(
    initialResult?.extracted?.ncd?.blood_glucose != null ? String(initialResult.extracted.ncd.blood_glucose) : ''
  );
  const [gestationalWeeks, setGestationalWeeks] = useState<string>(
    initialResult?.extracted?.pregnancy?.gestational_age_weeks != null ? String(initialResult.extracted.pregnancy.gestational_age_weeks) : ''
  );
  const [hasBleeding, setHasBleeding] = useState<boolean>(
    initialResult?.extracted?.pregnancy?.vaginal_bleeding ?? false
  );

  const [summaryText, setSummaryText] = useState<string>(
    initialResult?.summary || ''
  );

  // Human verification confirmation checkbox (ISS-101: Opt-in, default false)
  const [isHumanConfirmed, setIsHumanConfirmed] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Dynamically re-evaluate rules based on current editable values (ISS-233: memoized)
  const currentStructuredData: StructuredScreeningData = useMemo(() => ({
    screening_type: screeningType,
    ncd: screeningType === 'ncd' ? {
      bp_systolic: systolic ? parseInt(systolic, 10) : null,
      bp_diastolic: diastolic ? parseInt(diastolic, 10) : null,
      blood_glucose: glucose ? parseInt(glucose, 10) : null,
      known_hypertension: initialResult?.extracted?.ncd?.known_hypertension ?? false,
      medication_adherence: initialResult?.extracted?.ncd?.medication_adherence ?? true,
    } : undefined,
    pregnancy: screeningType === 'pregnancy' ? {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: gestationalWeeks ? parseInt(gestationalWeeks, 10) : undefined,
      vaginal_bleeding: hasBleeding,
      severe_headache: initialResult?.extracted?.pregnancy?.severe_headache ?? false,
      severe_abdominal_pain: initialResult?.extracted?.pregnancy?.severe_abdominal_pain ?? false,
      swelling: initialResult?.extracted?.pregnancy?.swelling ?? false,
      follow_up_required: hasBleeding,
    } : undefined
  }), [screeningType, systolic, diastolic, glucose, gestationalWeeks, hasBleeding, initialResult]);

  const dynamicRules: RuleResult[] = useMemo(() => {
    return evaluateRules(currentStructuredData);
  }, [currentStructuredData]);

  const handleConfirmAndSave = async () => {
    if (!isHumanConfirmed) {
      Alert.alert(
        language === 'hi' ? 'पुष्टि आवश्यक' : 'Confirmation Required',
        language === 'hi'
          ? 'कृपया डेटा को अंतिम रूप से सहेजने से पहले जांच कर पुष्टि चेकबॉक्स पर टिक करें।'
          : 'Please review values and check the confirmation box before saving.'
      );
      return;
    }

    // ISS-020: Block saving when beneficiary cannot be resolved
    const patientId = (params.patientId as string) || patientRecord?.id;
    if (!patientId || patientId === 'undefined') {
      Alert.alert(
        language === 'hi' ? 'लाभार्थी अनुपलब्ध' : 'Beneficiary Missing',
        language === 'hi'
          ? 'कृपया पहले लाभार्थी का चयन करें।'
          : 'Please select a beneficiary before saving.'
      );
      return;
    }

    // ISS-102: Block save if vitals are empty
    if (screeningType === 'ncd' && (!systolic || !diastolic)) {
      Alert.alert(
        language === 'hi' ? 'रक्तचाप आवश्यक' : 'Blood Pressure Required',
        language === 'hi'
          ? 'कृपया सिस्टोलिक और डायस्टोलिक रक्तचाप दर्ज करें।'
          : 'Please enter systolic and diastolic blood pressure readings.'
      );
      return;
    }

    setIsSaving(true);
    try {
      // ISS-019: Guard against 'undefined' string primary key
      let screeningId = params.screeningId as string;
      if (!screeningId || screeningId === 'undefined') {
        screeningId = `screen-${Date.now()}`;
      }

      // 1. Create Screening & Followup in SQLite and Enqueue in Sync Queue (atomic transaction)
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await screeningRepository.create({
          id: screeningId,
          patient_id: patientId,
          screening_type: screeningType,
          transcript: initialResult?.transcript || (language === 'hi' ? 'स्वास्थ्य जांच सत्र' : 'Health screening session'),
          structured_data: currentStructuredData,
          rule_results: dynamicRules,
          summary: summaryText || (language === 'hi' ? 'जांच पूरी हुई।' : 'Screening complete.'),
          confirmed: true,
          sync_status: 'pending'
        }, db);

        // 2. Automatically generate required Follow-up if High Risk detected
        const highRisk = dynamicRules.find(r => r.priority === 'high');
        if (highRisk) {
          const followupId = `fol-${Date.now()}`;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 3);
          const dateStr = dueDate.toISOString().split('T')[0];

          await followupRepository.create({
            id: followupId,
            patient_id: patientId,
            screening_id: screeningId,
            reason: language === 'hi' ? (highRuleReasonHi(highRisk)) : highRisk.reason,
            priority: 'high',
            due_date: dateStr,
            status: 'pending',
            sync_status: 'pending'
          }, db);

          await syncQueueRepository.enqueue('followup', followupId, 'create', {
            patient_id: patientId,
            reason: highRisk.reason,
            priority: 'high',
            due_date: dateStr
          }, db);
        }

        // 3. Enqueue Screening in Sync Queue
        await syncQueueRepository.enqueue('screening', screeningId, 'create', {
          patient_id: patientId,
          screening_type: screeningType,
          structured_data: currentStructuredData,
          rule_results: dynamicRules,
          summary: summaryText,
          confirmed: true
        }, db);
      });

      setIsSaving(false);
      Alert.alert(
        t.saveSuccessTitle,
        t.saveSuccessMsg,
        [{ text: t.okBtn, onPress: () => router.replace('/(tabs)') }]
      );
    } catch (err: any) {
      setIsSaving(false);
      Alert.alert(t.error, err.message || 'Error saving record');
    }
  };

  const highRuleReasonHi = (rule: RuleResult) => {
    return rule.reason_hi || rule.reason;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.summaryTitle}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{t.summarySub}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Beneficiary Header Card */}
        <View style={styles.patientCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={20} color={Colors.primary} />
          </View>
          <View style={styles.patientInfo}>
            <Text style={styles.patientName} numberOfLines={1}>{patientName}</Text>
            <Text style={styles.patientMeta}>
              {screeningType === 'pregnancy' ? t.pregnancyType : t.ncdType}
            </Text>
          </View>
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={13} color={Colors.success} />
            <Text style={styles.verifiedBadgeText}>{t.verified}</Text>
          </View>
        </View>

        {/* Structured Fields (Editable by Worker) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="create-outline" size={16} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.extractedVitalsTitle}</Text>
          </View>

          {screeningType === 'pregnancy' ? (
            <View style={styles.fieldsGrid}>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>{t.gestationalWeeksLabel}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={gestationalWeeks}
                  onChangeText={setGestationalWeeks}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldItemSwitch}>
                <Text style={styles.fieldLabel}>{t.bleedingLabel}</Text>
                <Switch
                  value={hasBleeding}
                  onValueChange={setHasBleeding}
                  trackColor={{ false: Colors.border, true: Colors.danger }}
                  thumbColor={hasBleeding ? Colors.surface : Colors.outline}
                />
              </View>
            </View>
          ) : (
            <View style={styles.fieldsGrid}>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>{t.systolicLabel}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={systolic}
                  onChangeText={setSystolic}
                  keyboardType="numeric"
                  placeholder="120"
                />
              </View>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>{t.diastolicLabel}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={diastolic}
                  onChangeText={setDiastolic}
                  keyboardType="numeric"
                  placeholder="80"
                />
              </View>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>{t.glucoseLabel}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={glucose}
                  onChangeText={setGlucose}
                  keyboardType="numeric"
                  placeholder="100"
                />
              </View>
            </View>
          )}
        </View>

        {/* Clinical Risk Alerts Section */}
        <View style={styles.sectionHeaderRowClean}>
          <Ionicons name="shield-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.sectionTitle}>{t.riskFlagsTitle}</Text>
        </View>

        {dynamicRules.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={28} color={Colors.success} />
            <Text style={styles.emptyCardText}>{t.noRiskFlags}</Text>
          </View>
        ) : (
          dynamicRules.map((rule, idx) => (
            <RiskCard key={idx} rule={rule} />
          ))
        )}

        {/* AI Clinical Summary (Editable) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.aiSummaryTitle}</Text>
          </View>
          <TextInput
            style={styles.summaryInput}
            value={summaryText}
            onChangeText={setSummaryText}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Human-in-the-Loop Verification Switch */}
        <View style={styles.verificationCard}>
          <Switch
            value={isHumanConfirmed}
            onValueChange={setIsHumanConfirmed}
            trackColor={{ false: Colors.border, true: Colors.success }}
            thumbColor={isHumanConfirmed ? Colors.surface : Colors.outline}
          />
          <Text style={styles.verificationText}>
            {language === 'hi'
              ? 'मैंने दर्ज किए गए स्वास्थ्य आंकड़ों और जोखिम चेतावनियों की स्वयं पुष्टि कर ली है।'
              : 'I have verified all clinical vitals and risk warnings.'}
          </Text>
        </View>

        {/* Confirm and Save CTA */}
        <TouchableOpacity
          style={[styles.saveBtn, (!isHumanConfirmed || isSaving) && styles.saveBtnDisabled]}
          onPress={handleConfirmAndSave}
          disabled={!isHumanConfirmed || isSaving}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-done-circle" size={18} color={Colors.surface} />
          <Text style={styles.saveBtnText}>{t.confirmAndSaveBtn}</Text>
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
  scrollContent: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    gap: 10,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfo: {
    flex: 1,
    flexShrink: 1,
  },
  patientName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  patientMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionHeaderRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  fieldsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fieldItem: {
    flex: 1,
    minWidth: '28%',
  },
  fieldItemSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 4,
  },
  fieldLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 3,
  },
  fieldInput: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryInput: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    color: Colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  emptyCardText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '600',
  },
  verificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  verificationText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textPrimary,
    lineHeight: 15,
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
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.surface,
  },
});
