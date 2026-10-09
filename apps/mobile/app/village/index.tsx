import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { patientRepository } from '../../services/db/patientRepo';
import { screeningRepository } from '../../services/db/screeningRepo';

export default function VillageOverviewScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();

  const [villageName, setVillageName] = useState(language === 'hi' ? 'रामपुर' : 'Rampur');
  const [subCenter, setSubCenter] = useState<string | null>(null);
  const [totalPatients, setTotalPatients] = useState(0);
  const [totalHouseholds, setTotalHouseholds] = useState(0);
  const [pregnantCount, setPregnantCount] = useState(0);
  const [breakdown, setBreakdown] = useState<{ village: string; patientCount: number; householdCount: number }[]>([]);
  const [screeningMetrics, setScreeningMetrics] = useState({ total: 0, highRisk: 0, ncd: 0, pregnancy: 0, today: 0 });

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadVillageData = async () => {
        try {
          const raw = await SecureStore.getItemAsync('worker_profile');
          if (raw && isMounted) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.village) setVillageName(parsed.village);
              if (parsed.sub_center || parsed.subCenter) {
                setSubCenter(parsed.sub_center || parsed.subCenter);
              }
            } catch (_) {}
          }

          const [pCount, bDown, sMetrics] = await Promise.all([
            patientRepository.getCount(),
            patientRepository.getVillageBreakdown(),
            screeningRepository.getMetrics(),
          ]);

          if (isMounted) {
            setTotalPatients(pCount);
            setBreakdown(bDown);
            const actualHh = bDown.reduce((acc, curr) => acc + (curr.householdCount || 0), 0);
            setTotalHouseholds(actualHh);
            setScreeningMetrics(sMetrics);
            setPregnantCount(sMetrics.pregnancy);
          }
        } catch (e) {
          console.warn('Error loading village data', e);
        }
      };

      loadVillageData();
      return () => {
        isMounted = false;
      };
    }, [language])
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const ncdPct = totalPatients > 0 ? Math.min(100, Math.round((screeningMetrics.ncd / totalPatients) * 100)) : 0;
  const pregPct = totalPatients > 0 ? Math.min(100, Math.round((screeningMetrics.pregnancy / totalPatients) * 100)) : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.villageHeader}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{villageName} · {t.villageHeaderSub}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Village Summary Card */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerTop}>
            <View style={styles.bannerTitleCol}>
              <Text style={styles.villageName} numberOfLines={1}>{t.gpName} {villageName}</Text>
              {subCenter ? (
                <Text style={styles.blockName}>
                  {language === 'hi' ? `उप-केंद्र: ${subCenter}` : `Sub Center: ${subCenter}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>{t.activeArea}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{totalPatients}</Text>
              <Text style={styles.statLbl}>{t.totalPopulation}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{totalHouseholds}</Text>
              <Text style={styles.statLbl}>{t.totalHouseholds}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{pregnantCount}</Text>
              <Text style={styles.statLbl}>{t.pregnantCount}</Text>
            </View>
          </View>
        </View>

        {/* Coverage Progress Bars */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {language === 'hi' ? 'स्वास्थ्य कार्यक्रम कवरेज' : 'Program Coverage'}
          </Text>

          <View style={styles.progressItem}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressName}>{t.ncdType}</Text>
              <Text style={styles.progressValue}>{screeningMetrics.ncd} {language === 'hi' ? 'जांच' : 'screened'} ({ncdPct}%)</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${ncdPct}%`, backgroundColor: Colors.primary }]} />
            </View>
          </View>

          <View style={styles.progressItem}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressName}>{t.pregnancyType}</Text>
              <Text style={styles.progressValue}>{screeningMetrics.pregnancy} {language === 'hi' ? 'पंजीकृत' : 'registered'} ({pregPct}%)</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${pregPct}%`, backgroundColor: Colors.success }]} />
            </View>
          </View>
        </View>

        {/* Village / Hamlet Breakdown from DB */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t.wardBreakdown}</Text>

          {breakdown.map((item, idx) => (
            <View key={idx} style={styles.wardRow}>
              <View style={styles.wardLeft}>
                <Ionicons name="home-outline" size={16} color={Colors.primary} />
                <Text style={styles.wardName} numberOfLines={1}>{item.village}</Text>
              </View>
              <View style={styles.wardRight}>
                <Text style={styles.wardHh}>{item.patientCount} {t.patientsCountSuffix}</Text>
              </View>
            </View>
          ))}
        </View>
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
  bannerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm + 4,
  },
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bannerTitleCol: {
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  villageName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  blockName: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activePill: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
  },
  statLbl: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm + 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  progressItem: {
    marginBottom: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  progressBarBg: {
    height: 7,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  wardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainer,
  },
  wardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexShrink: 1,
  },
  wardName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  wardRight: {
    alignItems: 'flex-end',
    marginLeft: 6,
  },
  wardHh: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
});
