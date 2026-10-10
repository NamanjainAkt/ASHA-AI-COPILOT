import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { Header } from '../../components/Header';
import { PatientCard } from '../../components/PatientCard';
import { patientRepository } from '../../services/db/patientRepo';
import { screeningRepository } from '../../services/db/screeningRepo';
import { followupRepository } from '../../services/db/followupRepo';
import { DEMO_SCENARIOS } from '../../services/ai/simulatorDriver';
import { screeningOrchestrator } from '../../services/ai/orchestrator';
import { Patient, Screening, FollowUp } from '@asha/shared';
import * as Network from 'expo-network';

export default function HomeDashboardScreen() {
  const router = useRouter();
  const { language, toggleLanguage, t } = useLanguage();

  const [workerProfile, setWorkerProfile] = useState({
    name: 'सुनीता देवी',
    id: 'ASHA-UP-402',
    village: 'रामपुर',
  });

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientCount, setPatientCount] = useState<number>(0);
  const [metrics, setMetrics] = useState({ total: 0, highRisk: 0, ncd: 0, pregnancy: 0, today: 0 });
  const [pendingFollowupCount, setPendingFollowupCount] = useState<number>(0);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [highRiskPatientIds, setHighRiskPatientIds] = useState<Set<string>>(new Set());
  const [mediumRiskPatientIds, setMediumRiskPatientIds] = useState<Set<string>>(new Set());

  const activeScenario = DEMO_SCENARIOS[scenarioIndex % DEMO_SCENARIOS.length];
  const dailyGoalTarget = 10;

  const loadData = async () => {
    try {
      // 1. Worker Profile
      const rawProfile = await SecureStore.getItemAsync('worker_profile');
      if (rawProfile) {
        try {
          const parsed = JSON.parse(rawProfile);
          setWorkerProfile({
            name: parsed.name || (language === 'hi' ? 'सुनीता देवी' : 'Sunita Devi'),
            id: parsed.id || 'ASHA-UP-402',
            village: parsed.village || (language === 'hi' ? 'रामपुर' : 'Rampur'),
          });
        } catch (_) {}
      }

      // 2. Network State (ISS-114)
      try {
        const netState = await Network.getNetworkStateAsync();
        setIsOnline(Boolean(netState.isConnected && netState.isInternetReachable));
      } catch (_) {
        setIsOnline(false);
      }

      // 3. Database Aggregations
      const [allPatients, totalP, scrMetrics, folCounts, allScreenings] = await Promise.all([
        patientRepository.getAll(),
        patientRepository.getCount(),
        screeningRepository.getMetrics(),
        followupRepository.getCounts(),
        screeningRepository.list(),
      ]);

      const hrSet = new Set<string>();
      const mrSet = new Set<string>();
      for (const s of allScreenings) {
        if (s.rule_results) {
          if (s.rule_results.some(r => r.priority === 'high')) {
            hrSet.add(s.patient_id);
          } else if (s.rule_results.some(r => r.priority === 'medium')) {
            mrSet.add(s.patient_id);
          }
        }
      }
      setHighRiskPatientIds(hrSet);
      setMediumRiskPatientIds(mrSet);

      setPatients(allPatients);
      setPatientCount(totalP);
      setMetrics(scrMetrics);
      setPendingFollowupCount(folCounts.pending);
    } catch (err) {
      console.warn('Error loading dashboard data:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [language])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const switchScenario = () => {
    const nextIdx = (scenarioIndex + 1) % DEMO_SCENARIOS.length;
    setScenarioIndex(nextIdx);
    screeningOrchestrator.getSimulator().setActiveScenario(DEMO_SCENARIOS[nextIdx].id);
  };

  const handleVoicePress = () => {
    router.push({
      pathname: '/screening/voice-capture',
      params: { scenarioId: activeScenario.id }
    });
  };

  // Formatted today string
  const todayDateStr = language === 'hi'
    ? `आज: ${new Date().toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })} · ${workerProfile.village}`
    : `Today: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${workerProfile.village}`;

  const visitsToday = metrics.today || 0;
  const goalPercentage = Math.min(100, Math.round((visitsToday / dailyGoalTarget) * 100));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Header
        language={language}
        onToggleLanguage={toggleLanguage}
        isOnline={isOnline}
        syncedCount={patientCount + metrics.total}
        villageName={workerProfile.village}
      />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* Worker Greeting Profile Banner */}
        <View style={styles.greetingBanner}>
          <View style={styles.greetingTop}>
            <View style={styles.avatarWrapper}>
              <Image
                source={require('../../assets/worker_avatar.png')}
                style={styles.avatarImg}
              />
              <View style={styles.activeDot} />
            </View>

            <View style={styles.greetingTextCol}>
              <View style={styles.nameRow}>
                <Text style={styles.greetingName} numberOfLines={1}>
                  {t.greetingPrefix} {workerProfile.name}
                </Text>
                <View style={styles.activeTag}>
                  <Text style={styles.activeTagText}>{t.activeWorker}</Text>
                </View>
              </View>
              <Text style={styles.workerMeta}>ID: #{workerProfile.id}</Text>
              <View style={styles.todayRow}>
                <Ionicons name="calendar-outline" size={13} color={Colors.primary} />
                <Text style={styles.todayText} numberOfLines={1}>{todayDateStr}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.speakerBtn}
              onPress={() => Alert.alert(
                t.audioBriefingTitle,
                language === 'hi'
                  ? `नमस्ते ${workerProfile.name}, आज आपके क्षेत्र ${workerProfile.village} में ${pendingFollowupCount} फॉलो-अप और ${metrics.highRisk} उच्च जोखिम केस प्राथमिकता पर हैं।`
                  : `Hello ${workerProfile.name}, today in ${workerProfile.village}, ${pendingFollowupCount} follow-ups and ${metrics.highRisk} high-risk cases are scheduled.`
              )}
              accessibilityLabel={t.audioBriefingTitle}
            >
              <Ionicons name="volume-high" size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Motivational Goal Strip */}
          <View style={styles.goalStrip}>
            <View style={styles.goalLeft}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
              <Text style={styles.goalText}>
                {t.dailyTargetTitle}: {visitsToday}/{dailyGoalTarget} {t.dailyTargetUnit}
              </Text>
            </View>
            <Text style={styles.goalPct}>{goalPercentage}% {t.completePctSuffix}</Text>
          </View>
        </View>

        {/* Tactile CTA: Start Field Visit */}
        <TouchableOpacity
          style={styles.startVisitCard}
          onPress={handleVoicePress}
          activeOpacity={0.9}
        >
          <View style={styles.startVisitLeft}>
            <View style={styles.startVisitIconBg}>
              <Ionicons name="mic" size={24} color={Colors.surface} />
            </View>
            <View style={styles.startVisitTextCol}>
              <Text style={styles.startVisitTitle} numberOfLines={1}>{t.startVisit}</Text>
              <Text style={styles.startVisitSub} numberOfLines={1}>{t.startVisitSub}</Text>
            </View>
          </View>
          <View style={styles.arrowCircle}>
            <Ionicons name="arrow-forward" size={20} color={Colors.surface} />
          </View>
        </TouchableOpacity>

        {/* Quick Action Matrix (4 Compact Tiles) */}
        <View style={styles.actionGrid}>
          {/* Tile 1: Beneficiary Directory */}
          <TouchableOpacity
            style={styles.gridTile}
            onPress={() => router.push('/patients')}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIconBg, { backgroundColor: Colors.surfaceContainer }]}>
              <Ionicons name="people" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.tileTitle} numberOfLines={1}>{t.searchPatients}</Text>
            <Text style={styles.tileSub} numberOfLines={1}>{patientCount} {t.patientsCountSuffix}</Text>
          </TouchableOpacity>

          {/* Tile 2: High Risk Triage */}
          <TouchableOpacity
            style={[styles.gridTile, { borderColor: Colors.dangerLight, borderWidth: 1.5 }]}
            onPress={() => router.push('/patients/high-risk')}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIconBg, { backgroundColor: Colors.dangerLight }]}>
              <Ionicons name="alert-circle" size={20} color={Colors.danger} />
            </View>
            <Text style={[styles.tileTitle, { color: Colors.danger }]} numberOfLines={1}>
              {t.highRiskCases}
            </Text>
            <Text style={styles.tileSub} numberOfLines={1}>{metrics.highRisk} {t.highRiskSub}</Text>
          </TouchableOpacity>

          {/* Tile 3: Pending Follow-ups */}
          <TouchableOpacity
            style={styles.gridTile}
            onPress={() => router.push('/(tabs)/followups')}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIconBg, { backgroundColor: Colors.accentLight }]}>
              <Ionicons name="time" size={20} color={Colors.accent} />
            </View>
            <Text style={styles.tileTitle} numberOfLines={1}>{t.followupsDue}</Text>
            <Text style={styles.tileSub} numberOfLines={1}>{pendingFollowupCount} {t.followupsSub}</Text>
          </TouchableOpacity>

          {/* Tile 4: Village Overview */}
          <TouchableOpacity
            style={styles.gridTile}
            onPress={() => router.push('/village')}
            activeOpacity={0.8}
          >
            <View style={[styles.tileIconBg, { backgroundColor: Colors.surfaceContainerHigh }]}>
              <Ionicons name="business" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.tileTitle} numberOfLines={1}>{t.villageOverview}</Text>
            <Text style={styles.tileSub} numberOfLines={1}>{workerProfile.village}</Text>
          </TouchableOpacity>
        </View>

        {/* Section Header: Recent Field Screenings */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleCol}>
            <Text style={styles.sectionHeading}>{t.historySection}</Text>
            <Text style={styles.sectionSubHeading}>
              {language === 'hi' ? 'सुरक्षित ऑफ़लाइन स्वास्थ्य रिकॉर्ड' : 'Offline Verified Health Records'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/patients')}>
            <Text style={styles.viewAllText}>{t.viewAll}</Text>
          </TouchableOpacity>
        </View>

        {/* Screenings / Patient Cards */}
        {patients.slice(0, 4).map((patient) => {
          const isHighRisk = highRiskPatientIds.has(patient.id);
          const isMedium = mediumRiskPatientIds.has(patient.id);
          const riskStatus = isHighRisk ? 'high' : isMedium ? 'medium' : 'normal';
          return (
            <PatientCard
              key={patient.id}
              patient={patient}
              riskStatus={riskStatus}
              onPress={() => router.push({
                pathname: '/screening/summary',
                params: {
                  patientId: patient.id,
                  ...(isHighRisk ? { screeningId: 's-001' } : {})
                }
              })}
            />
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.sm + 4,
    paddingTop: Spacing.sm + 2,
    paddingBottom: 24,
  },
  greetingBanner: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.sm + 4,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm + 4,
  },
  greetingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    position: 'relative',
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  greetingTextCol: {
    flex: 1,
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  greetingName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  activeTag: {
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  workerMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  todayText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    flexShrink: 1,
  },
  speakerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  goalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  goalText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    flexShrink: 1,
  },
  goalPct: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  startVisitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: Spacing.sm + 4,
    marginBottom: Spacing.sm + 4,
    minHeight: 64,
  },
  startVisitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    flexShrink: 1,
  },
  startVisitIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startVisitTextCol: {
    flex: 1,
    flexShrink: 1,
  },
  startVisitTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.surface,
  },
  startVisitSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  gridTile: {
    width: '48.5%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 82,
    justifyContent: 'center',
  },
  tileIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  tileSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  sectionTitleCol: {
    flex: 1,
    flexShrink: 1,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sectionSubHeading: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 1,
  },
});
