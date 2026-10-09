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

  // Module B: Common Visit
  const [mainComplaint, setMainComplaint] = useState<string>(
    initialResult?.extracted?.common_visit?.main_complaint || ''
  );
  const [complaintOnset, setComplaintOnset] = useState<string>(
    initialResult?.extracted?.common_visit?.complaint_onset || ''
  );
  const [complaintCourse, setComplaintCourse] = useState<'worsening' | 'improving' | 'unchanged' | 'fluctuating'>(
    initialResult?.extracted?.common_visit?.complaint_course || 'unchanged'
  );
  const [missedMeds, setMissedMeds] = useState<boolean>(
    initialResult?.extracted?.common_visit?.missed_medication_doses ?? false
  );

  // Vitals & CBAC
  const [systolic, setSystolic] = useState<string>(
    initialResult?.extracted?.ncd?.bp_systolic != null ? String(initialResult.extracted.ncd.bp_systolic) : ''
  );
  const [diastolic, setDiastolic] = useState<string>(
    initialResult?.extracted?.ncd?.bp_diastolic != null ? String(initialResult.extracted.ncd.bp_diastolic) : ''
  );
  const [glucose, setGlucose] = useState<string>(
    initialResult?.extracted?.ncd?.blood_glucose != null ? String(initialResult.extracted.ncd.blood_glucose) : ''
  );
  const [waistCm, setWaistCm] = useState<string>(
    initialResult?.extracted?.cbac?.waist_circumference_cm != null ? String(initialResult.extracted.cbac.waist_circumference_cm) : ''
  );

  // Pregnancy Danger Signs
  const [gestationalWeeks, setGestationalWeeks] = useState<string>(
    initialResult?.extracted?.pregnancy?.gestational_age_weeks != null ? String(initialResult.extracted.pregnancy.gestational_age_weeks) : ''
  );
  const [hasBleeding, setHasBleeding] = useState<boolean>(
    initialResult?.extracted?.pregnancy?.vaginal_bleeding ?? false
  );
  const [hasConvulsions, setHasConvulsions] = useState<boolean>(
    initialResult?.extracted?.pregnancy?.convulsions ?? false
  );
  const [hasLeakingFluid, setHasLeakingFluid] = useState<boolean>(
    initialResult?.extracted?.pregnancy?.leaking_fluid ?? false
  );

  // PNC / Newborn
  const [poorFeeding, setPoorFeeding] = useState<boolean>(
    initialResult?.extracted?.pnc_child?.poor_feeding_or_sucking ?? false
  );
  const [fastBreathing, setFastBreathing] = useState<boolean>(
    initialResult?.extracted?.pnc_child?.fast_breathing_or_indrawing ?? false
  );
  const [birthWeight, setBirthWeight] = useState<string>(
    initialResult?.extracted?.pnc_child?.birth_weight_kg != null ? String(initialResult.extracted.pnc_child.birth_weight_kg) : ''
  );

  // Referral / Action
  const [referralDestination, setReferralDestination] = useState<'sub_center' | 'phc' | 'chc' | 'sub_district_hospital' | 'district_hospital'>(
    initialResult?.extracted?.referral_action?.destination || 'phc'
  );
  const [referralUrgency, setReferralUrgency] = useState<'immediate' | 'urgent' | 'routine'>(
    initialResult?.extracted?.referral_action?.urgency || 'urgent'
  );

  const [summaryText, setSummaryText] = useState<string>(
    initialResult?.summary || ''
  );

  // Human verification confirmation checkbox (ISS-101: Opt-in, default false)
  const [isHumanConfirmed, setIsHumanConfirmed] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Dynamically re-evaluate rules based on current editable values
  const currentStructuredData: StructuredScreeningData = useMemo(() => ({
    screening_type: screeningType,
    visit_type: screeningType,
    common_visit: {
      ...initialResult?.extracted?.common_visit,
      main_complaint: mainComplaint.trim() || undefined,
      complaint_onset: complaintOnset.trim() || undefined,
      complaint_course: complaintCourse,
      missed_medication_doses: missedMeds,
    },
    cbac: {
      ...initialResult?.extracted?.cbac,
      waist_circumference_cm: waistCm ? parseFloat(waistCm) : null,
    },
    referral_action: {
      ...initialResult?.extracted?.referral_action,
      referral_recommended: hasBleeding || hasConvulsions || hasLeakingFluid || poorFeeding || fastBreathing,
      destination: referralDestination,
      urgency: referralUrgency,
    },
    ncd: (screeningType === 'ncd' || screeningType === 'general') ? {
      bp_systolic: systolic ? parseInt(systolic, 10) : null,
      bp_diastolic: diastolic ? parseInt(diastolic, 10) : null,
      blood_glucose: glucose ? parseInt(glucose, 10) : null,
      known_hypertension: initialResult?.extracted?.ncd?.known_hypertension ?? false,
      medication_adherence: !missedMeds,
    } : undefined,
    pregnancy: screeningType === 'pregnancy' ? {
      pregnancy_status: 'pregnant',
      gestational_age_weeks: gestationalWeeks ? parseInt(gestationalWeeks, 10) : undefined,
      vaginal_bleeding: hasBleeding,
      convulsions: hasConvulsions,
      leaking_fluid: hasLeakingFluid,
      severe_headache: initialResult?.extracted?.pregnancy?.severe_headache ?? false,
      severe_abdominal_pain: initialResult?.extracted?.pregnancy?.severe_abdominal_pain ?? false,
      swelling: initialResult?.extracted?.pregnancy?.swelling ?? false,
      follow_up_required: hasBleeding || hasConvulsions || hasLeakingFluid,
    } : undefined,
    pnc_child: ((screeningType as string) === 'pnc' || (screeningType as any) === 'child_hbnc' || initialResult?.extracted?.pnc_child) ? {
      ...initialResult?.extracted?.pnc_child,
      poor_feeding_or_sucking: poorFeeding,
      fast_breathing_or_indrawing: fastBreathing,
      convulsions: hasConvulsions,
      birth_weight_kg: birthWeight ? parseFloat(birthWeight) : null,
    } : undefined
  }), [
    screeningType,
    mainComplaint,
    complaintOnset,
    complaintCourse,
    missedMeds,
    waistCm,
    systolic,
    diastolic,
    glucose,
    gestationalWeeks,
    hasBleeding,
    hasConvulsions,
    hasLeakingFluid,
    poorFeeding,
    fastBreathing,
    birthWeight,
    referralDestination,
    referralUrgency,
    initialResult
  ]);

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
            priority: highRisk.priority,
            due_date: dateStr,
            status: 'pending',
            destination: referralDestination,
            urgency: referralUrgency,
            sync_status: 'pending'
          }, db);

          await syncQueueRepository.enqueue('followup', followupId, 'create', {
            patient_id: patientId,
            screening_id: screeningId,
            reason: highRisk.reason,
            priority: highRisk.priority,
            due_date: dateStr,
            destination: referralDestination,
            urgency: referralUrgency
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

        {/* Module B: Common Visit Intake */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="clipboard-outline" size={16} color={Colors.primary} />
            <Text style={styles.sectionTitle}>
              {language === 'hi' ? 'सामान्य मुलाकात विवरण (Common Visit)' : 'Common Visit Intake'}
            </Text>
          </View>
          <View style={styles.fieldsGrid}>
            <View style={[styles.fieldItem, { minWidth: '48%' }]}>
              <Text style={styles.fieldLabel}>{language === 'hi' ? 'मुख्य समस्या' : 'Main Complaint'}</Text>
              <TextInput
                style={styles.fieldInput}
                value={mainComplaint}
                onChangeText={setMainComplaint}
                placeholder={language === 'hi' ? 'उदा. बुखार, सिरदर्द' : 'e.g. Fever, Cough'}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={[styles.fieldItem, { minWidth: '48%' }]}>
              <Text style={styles.fieldLabel}>{language === 'hi' ? 'अवधि / शुरुआत' : 'Onset / Duration'}</Text>
              <TextInput
                style={styles.fieldInput}
                value={complaintOnset}
                onChangeText={setComplaintOnset}
                placeholder={language === 'hi' ? 'उदा. 3 दिन से' : 'e.g. 3 days'}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            <Text style={styles.fieldLabel}>{language === 'hi' ? 'समस्या की स्थिति' : 'Complaint Course'}</Text>
            <View style={styles.chipRow}>
              {(['worsening', 'unchanged', 'improving', 'fluctuating'] as const).map((course) => (
                <TouchableOpacity
                  key={course}
                  style={[styles.choiceChip, complaintCourse === course && styles.choiceChipActive]}
                  onPress={() => setComplaintCourse(course)}
                >
                  <Text style={[styles.choiceChipText, complaintCourse === course && styles.choiceChipTextActive]}>
                    {course === 'worsening' ? (language === 'hi' ? 'बढ़ रही है' : 'Worsening') :
                     course === 'unchanged' ? (language === 'hi' ? 'वैसी ही है' : 'Same') :
                     course === 'improving' ? (language === 'hi' ? 'सुधार है' : 'Improving') :
                     (language === 'hi' ? 'उतार-चढ़ाव' : 'Fluctuating')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldItemSwitch}>
            <Text style={styles.fieldLabel}>
              {language === 'hi' ? 'दवाई छूट गई है? (Missed Medication)' : 'Missed Medication Doses?'}
            </Text>
            <Switch
              value={missedMeds}
              onValueChange={setMissedMeds}
              trackColor={{ false: Colors.border, true: Colors.warning }}
              thumbColor={missedMeds ? Colors.surface : Colors.outline}
            />
          </View>
        </View>

        {/* Structured Fields & Vitals */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="fitness-outline" size={16} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t.extractedVitalsTitle}</Text>
          </View>

          {screeningType === 'pregnancy' ? (
            <View style={styles.fieldsGrid}>
              <View style={[styles.fieldItem, { minWidth: '100%' }]}>
                <Text style={styles.fieldLabel}>{t.gestationalWeeksLabel}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={gestationalWeeks}
                  onChangeText={setGestationalWeeks}
                  keyboardType="numeric"
                  placeholder="24"
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
              <View style={styles.fieldItemSwitch}>
                <Text style={styles.fieldLabel}>
                  {language === 'hi' ? 'दौरे / ऐंठन (Convulsions/Fits)' : 'Convulsions / Fits'}
                </Text>
                <Switch
                  value={hasConvulsions}
                  onValueChange={setHasConvulsions}
                  trackColor={{ false: Colors.border, true: Colors.danger }}
                  thumbColor={hasConvulsions ? Colors.surface : Colors.outline}
                />
              </View>
              <View style={styles.fieldItemSwitch}>
                <Text style={styles.fieldLabel}>
                  {language === 'hi' ? 'पानी छूटना (Leaking Fluid / PROM)' : 'Leaking Fluid (Water Break)'}
                </Text>
                <Switch
                  value={hasLeakingFluid}
                  onValueChange={setHasLeakingFluid}
                  trackColor={{ false: Colors.border, true: Colors.danger }}
                  thumbColor={hasLeakingFluid ? Colors.surface : Colors.outline}
                />
              </View>
            </View>
          ) : (screeningType as string) === 'pnc' || (screeningType as any) === 'child_hbnc' ? (
            <View style={styles.fieldsGrid}>
              <View style={[styles.fieldItem, { minWidth: '100%' }]}>
                <Text style={styles.fieldLabel}>{language === 'hi' ? 'जन्म वजन (किलो)' : 'Birth Weight (kg)'}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={birthWeight}
                  onChangeText={setBirthWeight}
                  keyboardType="numeric"
                  placeholder="2.5"
                />
              </View>
              <View style={styles.fieldItemSwitch}>
                <Text style={styles.fieldLabel}>
                  {language === 'hi' ? 'दूध नहीं पी पा रहा / सुस्त' : 'Poor feeding / Sucking'}
                </Text>
                <Switch
                  value={poorFeeding}
                  onValueChange={setPoorFeeding}
                  trackColor={{ false: Colors.border, true: Colors.danger }}
                  thumbColor={poorFeeding ? Colors.surface : Colors.outline}
                />
              </View>
              <View style={styles.fieldItemSwitch}>
                <Text style={styles.fieldLabel}>
                  {language === 'hi' ? 'तेज़ सांस / पसली चलना' : 'Fast breathing / Chest indrawing'}
                </Text>
                <Switch
                  value={fastBreathing}
                  onValueChange={setFastBreathing}
                  trackColor={{ false: Colors.border, true: Colors.danger }}
                  thumbColor={fastBreathing ? Colors.surface : Colors.outline}
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
              <View style={[styles.fieldItem, { minWidth: '100%', marginTop: 6 }]}>
                <Text style={styles.fieldLabel}>
                  {language === 'hi' ? 'कमर का घेरा (Waist Circumference - cm)' : 'Waist Circumference (cm)'}
                </Text>
                <TextInput
                  style={styles.fieldInput}
                  value={waistCm}
                  onChangeText={setWaistCm}
                  keyboardType="numeric"
                  placeholder={language === 'hi' ? 'उदा. 86' : 'e.g. 86'}
                />
              </View>
            </View>
          )}
        </View>

        {/* Referral & Action Plan Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
            <Text style={styles.sectionTitle}>
              {language === 'hi' ? 'रेफरल एवं कार्य योजना (Referral & Action)' : 'Referral & Action Plan'}
            </Text>
          </View>
          <Text style={styles.fieldLabel}>
            {language === 'hi' ? 'रेफरल केंद्र (Destination)' : 'Referral Destination'}
          </Text>
          <View style={styles.chipRow}>
            {([
              { key: 'sub_center', labelHi: 'उप-केंद्र', labelEn: 'Sub-Center' },
              { key: 'phc', labelHi: 'PHC (प्राथमिक)', labelEn: 'PHC' },
              { key: 'chc', labelHi: 'CHC (सामुदायिक)', labelEn: 'CHC' },
              { key: 'district_hospital', labelHi: 'जिला अस्पताल', labelEn: 'District Hosp' }
            ] as const).map((dest) => (
              <TouchableOpacity
                key={dest.key}
                style={[styles.choiceChip, referralDestination === dest.key && styles.choiceChipActive]}
                onPress={() => setReferralDestination(dest.key)}
              >
                <Text style={[styles.choiceChipText, referralDestination === dest.key && styles.choiceChipTextActive]}>
                  {language === 'hi' ? dest.labelHi : dest.labelEn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
            {language === 'hi' ? 'प्राथमिकता (Urgency)' : 'Referral Urgency'}
          </Text>
          <View style={styles.chipRow}>
            {([
              { key: 'immediate', labelHi: 'तत्काल (108 / Urgent)', labelEn: 'Immediate (108)' },
              { key: 'urgent', labelHi: '24 घंटे में', labelEn: 'Within 24h' },
              { key: 'routine', labelHi: 'नियमित', labelEn: 'Routine' }
            ] as const).map((urg) => (
              <TouchableOpacity
                key={urg.key}
                style={[styles.choiceChip, referralUrgency === urg.key && styles.choiceChipActive]}
                onPress={() => setReferralUrgency(urg.key)}
              >
                <Text style={[styles.choiceChipText, referralUrgency === urg.key && styles.choiceChipTextActive]}>
                  {language === 'hi' ? urg.labelHi : urg.labelEn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  choiceChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceContainer,
  },
  choiceChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  choiceChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  choiceChipTextActive: {
    color: Colors.primary,
  },
});
