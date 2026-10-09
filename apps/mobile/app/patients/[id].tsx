import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { getDatabase } from '../../services/db/database';
import { patientRepository } from '../../services/db/patientRepo';
import { screeningRepository } from '../../services/db/screeningRepo';
import { followupRepository } from '../../services/db/followupRepo';
import { syncQueueRepository } from '../../services/db/syncQueueRepo';
import { Patient, Screening, FollowUp } from '@asha/shared';

export default function PatientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language, t } = useLanguage();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPatientData = async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const p = await patientRepository.getById(id);
      if (p) {
        setPatient(p);
        const s = await screeningRepository.list(id);
        const allF = await followupRepository.list();
        const patientF = allF.filter(f => f.patient_id === id);
        setScreenings(s);
        setFollowups(patientF);
      }
    } catch (err) {
      console.warn('Error loading patient details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/patients');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPatientData();
    }, [id])
  );

  const handleMarkFollowupComplete = async (followupId: string) => {
    try {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await followupRepository.updateStatus(followupId, 'completed', db);
        await syncQueueRepository.enqueue('followup', followupId, 'update', { status: 'completed' }, db);
      });
      Alert.alert(t.success, language === 'hi' ? 'फॉलो-अप कार्य पूरा चिह्नित कर दिया गया है।' : 'Follow-up marked as completed.');
      loadPatientData();
    } catch (err: any) {
      Alert.alert(t.error, err.message || 'Error updating status');
    }
  };

  if (loading && !patient) {
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
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.patientNotFound}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={44} color={Colors.danger} />
          <Text style={styles.emptyTitle}>{t.patientNotFound}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const highRiskScreening = screenings.find(s =>
    s.rule_results && s.rule_results.some(r => r.priority === 'high')
  );

  const genderLabel = (patient.sex && (t.gender as any)[patient.sex]) || patient.sex;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{patient.name}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>ID: #{patient.id} · {patient.village}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <View style={styles.avatarCircle}>
              <Ionicons
                name={patient.sex === 'female' ? 'woman' : 'man'}
                size={26}
                color={Colors.primaryDark}
              />
            </View>
            <View style={styles.patientInfoCol}>
              <Text style={styles.patientName} numberOfLines={1}>{patient.name}</Text>
              <Text style={styles.patientMeta}>
                {genderLabel} · {patient.age} {t.ageYears}
              </Text>
              {patient.household_id && (
                <Text style={styles.householdText}>
                  {t.householdPrefix} {patient.household_id}
                </Text>
              )}
            </View>
            {highRiskScreening ? (
              <View style={[styles.badge, { backgroundColor: Colors.dangerLight }]}>
                <Ionicons name="alert-circle" size={13} color={Colors.danger} />
                <Text style={[styles.badgeText, { color: Colors.danger }]}>{t.riskStatus.high}</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: Colors.successLight }]}>
                <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                <Text style={[styles.badgeText, { color: Colors.success }]}>{t.riskStatus.normal}</Text>
              </View>
            )}
          </View>

          {patient.phone ? (
            <TouchableOpacity
              style={styles.phoneRow}
              accessibilityRole="link"
              accessibilityLabel={`${t.call} ${patient.phone}`}
              onPress={async () => {
                const cleanPhone = (patient.phone || '').trim();
                if (!/^[0-9+ ]{6,15}$/.test(cleanPhone) || cleanPhone.includes(';') || cleanPhone.includes('#')) {
                  Alert.alert(
                    language === 'hi' ? 'अमान्य नंबर' : 'Invalid Phone',
                    language === 'hi' ? 'फ़ोन नंबर अमान्य है' : 'The phone number format is invalid'
                  );
                  return;
                }
                const url = `tel:${cleanPhone.replace(/\s+/g, '')}`;
                try {
                  if (await Linking.canOpenURL(url)) {
                    await Linking.openURL(url);
                  } else {
                    Alert.alert(t.error, language === 'hi' ? 'डिवाइस कॉलिंग का समर्थन नहीं करता है' : 'Device cannot make phone calls');
                  }
                } catch (err: any) {
                  Alert.alert(t.error, err.message || 'Could not place call');
                }
              }}
            >
              <Ionicons name="call-outline" size={14} color={Colors.primary} />
              <Text style={[styles.phoneText, { color: Colors.primary, textDecorationLine: 'underline' }]}>{patient.phone}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Screening Action Banner (Two Compact Tactile CTAs) */}
        <View style={styles.actionCard}>
          <Text style={styles.actionSectionTitle}>{t.startScreeningSection}</Text>
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.voiceActionBtn}
              onPress={() => {
                router.push({
                  pathname: '/screening/voice-capture',
                  params: {
                    patientId: patient.id,
                    screeningType: patient.sex === 'female' && patient.age < 50 ? 'pregnancy' : 'ncd'
                  }
                });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="mic" size={20} color={Colors.surface} />
              <View style={styles.actionBtnTextCol}>
                <Text style={styles.voiceActionText} numberOfLines={1}>{t.voiceScreeningBtn}</Text>
                <Text style={styles.voiceActionSub} numberOfLines={1}>{t.voiceScreeningBtnSub}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manualActionBtn}
              onPress={() => {
                router.push({
                  pathname: '/screening/manual-entry',
                  params: {
                    patientId: patient.id
                  }
                });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
              <View style={styles.actionBtnTextCol}>
                <Text style={styles.manualActionText} numberOfLines={1}>{t.manualEntryBtn}</Text>
                <Text style={styles.manualActionSub} numberOfLines={1}>{t.manualEntryBtnSub}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Pending Follow-ups */}
        <View style={styles.sectionHeader}>
          <Ionicons name="calendar-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.sectionTitle}>
            {t.followupsSection} ({followups.filter(f => f.status === 'pending').length})
          </Text>
        </View>

        {followups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>
              {language === 'hi' ? 'कोई लंबित फॉलो-अप नहीं है।' : 'No pending follow-ups.'}
            </Text>
          </View>
        ) : (
          followups.map(f => (
            <View key={f.id} style={styles.followupCard}>
              <View style={styles.followupTop}>
                <View style={[
                  styles.priorityBadge,
                  f.priority === 'high' ? styles.badgeHigh : f.priority === 'medium' ? styles.badgeMed : styles.badgeLow
                ]}>
                  <Text style={styles.priorityText}>
                    {f.priority === 'high' ? t.riskStatus.high : f.priority === 'medium' ? t.riskStatus.medium : t.riskStatus.normal}
                  </Text>
                </View>
                <Text style={styles.dueDateText}>{t.scheduledDate} {f.due_date}</Text>
              </View>

              <Text style={styles.followupReason}>{f.reason}</Text>

              {f.status === 'pending' ? (
                <TouchableOpacity
                  style={styles.completeBtn}
                  onPress={() => handleMarkFollowupComplete(f.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-done" size={15} color={Colors.surface} />
                  <Text style={styles.completeBtnText}>{t.markDoneBtn}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.doneBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <Text style={styles.doneBadgeText}>{t.doneBadge}</Text>
                </View>
              )}
            </View>
          ))
        )}

        {/* Screening History */}
        <View style={styles.sectionHeader}>
          <Ionicons name="medical-outline" size={16} color={Colors.primaryDark} />
          <Text style={styles.sectionTitle}>{t.historySection}</Text>
        </View>

        {screenings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>{t.noHistory}</Text>
          </View>
        ) : (
          screenings.map(s => {
            const isHigh = s.rule_results && s.rule_results.some(r => r.priority === 'high');
            return (
              <TouchableOpacity
                key={s.id}
                style={styles.historyCard}
                onPress={() => router.push({
                  pathname: '/screening/summary',
                  params: {
                    screeningId: s.id,
                    patientId: patient.id
                  }
                })}
                activeOpacity={0.8}
              >
                <View style={styles.historyTop}>
                  <Text style={styles.historyType}>
                    {s.screening_type === 'pregnancy' ? t.pregnancyType : t.ncdType}
                  </Text>
                  <View style={[styles.historyBadge, { backgroundColor: isHigh ? Colors.dangerLight : Colors.successLight }]}>
                    <Text style={[styles.historyBadgeText, { color: isHigh ? Colors.danger : Colors.success }]}>
                      {isHigh ? t.riskStatus.high : t.riskStatus.normal}
                    </Text>
                  </View>
                </View>

                {s.summary ? (
                  <Text style={styles.historySummary} numberOfLines={2}>{s.summary}</Text>
                ) : null}

                <View style={styles.historyBottom}>
                  <Text style={styles.historyDate}>
                    {new Date(s.created_at || Date.now()).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN')}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
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
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm + 4,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfoCol: {
    flex: 1,
    flexShrink: 1,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  patientMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  householdText: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceContainer,
  },
  phoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  actionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm + 4,
  },
  actionSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  voiceActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 10,
  },
  manualActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnTextCol: {
    flex: 1,
    flexShrink: 1,
  },
  voiceActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.surface,
  },
  voiceActionSub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
  },
  manualActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  manualActionSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  followupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  followupTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeHigh: {
    backgroundColor: Colors.dangerLight,
  },
  badgeMed: {
    backgroundColor: Colors.accentLight,
  },
  badgeLow: {
    backgroundColor: Colors.surfaceContainer,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dueDateText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  followupReason: {
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 16,
    marginVertical: 4,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  completeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.surface,
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  doneBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.success,
  },
  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyType: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  historyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  historySummary: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
    marginBottom: 4,
  },
  historyBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  historyDate: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
});
