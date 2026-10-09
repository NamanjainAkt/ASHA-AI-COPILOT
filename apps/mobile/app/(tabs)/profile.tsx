import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  NativeModules
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { screeningRepository } from '../../services/db/screeningRepo';
import { followupRepository } from '../../services/db/followupRepo';
import { patientRepository } from '../../services/db/patientRepo';
import { screeningOrchestrator } from '../../services/ai/orchestrator';
import { clearAllData } from '../../services/db/database';
import { modelManager, ModelMetadata, ModelId, SummaryModelId } from '../../services/ai/modelManager';
import { BUILD_TAG } from '../../constants/build';

export default function WorkerPerformanceScreen() {
  const router = useRouter();
  const { language, toggleLanguage, t } = useLanguage();

  const [profile, setProfile] = useState({
    name: 'सुनीता देवी',
    id: 'ASHA-UP-402',
    village: 'रामपुर',
  });

  const [metrics, setMetrics] = useState({
    totalVisits: 0,
    ncdScreenings: 0,
    ancCare: 0,
    highRiskCases: 0,
  });

  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [preferredSummary, setPreferredSummary] = useState<SummaryModelId>('qwen3-0.6b');
  const [downloadingId, setDownloadingId] = useState<ModelId | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const loadProfileAndMetrics = async () => {
    try {
      const raw = await SecureStore.getItemAsync('worker_profile');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setProfile({
            name: parsed.name || (language === 'hi' ? 'सुनीता देवी' : 'Sunita Devi'),
            id: parsed.id || 'ASHA-UP-402',
            village: parsed.village || (language === 'hi' ? 'रामपुर' : 'Rampur'),
          });
        } catch (_) {}
      }

      const [scrMetrics, folCounts, patCount] = await Promise.all([
        screeningRepository.getMetrics(),
        followupRepository.getCounts(),
        patientRepository.getCount(),
      ]);

      // Fresh disk probe so badges never show stale Ready states.
      try {
        await modelManager.refreshStatuses();
      } catch (_) {}

      setMetrics({
        totalVisits: scrMetrics.total + folCounts.completed,
        ncdScreenings: scrMetrics.ncd,
        ancCare: scrMetrics.pregnancy,
        highRiskCases: scrMetrics.highRisk,
      });

      setModels(modelManager.getAllModels());
      setPreferredSummary(modelManager.getPreferredSummaryModel());
    } catch (e) {
      console.warn('Error loading profile data', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfileAndMetrics();
    }, [language])
  );

  const handleLogout = () => {
    Alert.alert(
      t.logoutBtn,
      t.logoutConfirm,
      [
        { text: t.cancelBtn, style: 'cancel' },
        {
          text: t.logoutBtn,
          style: 'destructive',
          onPress: async () => {
            try {
              await SecureStore.deleteItemAsync('session_active');
              await SecureStore.deleteItemAsync('worker_auth_pin');
              await SecureStore.deleteItemAsync('worker_profile');
              await SecureStore.deleteItemAsync('worker_role');
              await SecureStore.deleteItemAsync('auth_lockout_until');
              screeningOrchestrator.setLastResult(null);
            } catch (err) {
              console.warn('Logout cleanup warning:', err);
            }
            router.replace('/login');
          }
        }
      ]
    );
  };

  const handleClearDemoData = async () => {
    Alert.alert(
      t.clearDemoDataConfirmTitle || 'Clear Demo Data?',
      t.clearDemoDataConfirmMsg || 'Are you sure you want to clear all demo beneficiaries and screening records to start fresh?',
      [
        { text: t.cancelBtn, style: 'cancel' },
        {
          text: t.clearDemoDataBtn || 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              screeningOrchestrator.setLastResult(null);
              setMetrics({
                totalVisits: 0,
                ncdScreenings: 0,
                ancCare: 0,
                highRiskCases: 0,
              });
              Alert.alert(
                t.success || 'Success',
                t.clearDemoDataSuccess || 'Demo data cleared. Database is now empty and fresh.'
              );
            } catch (err: any) {
              Alert.alert(t.error, err?.message || 'Failed to clear data');
            }
          }
        }
      ]
    );
  };

  const handleSelectSummaryModel = (modelId: SummaryModelId) => {
    modelManager.setPreferredSummaryModel(modelId);
    setPreferredSummary(modelId);
  };

  const handleDownloadModel = async (id: ModelId) => {
    setDownloadingId(id);
    setDownloadProgress(0);
    try {
      const ok = await modelManager.downloadModel(id, (percent) => {
        setDownloadProgress(percent);
      });
      if (ok) {
        setDownloadProgress(100);
        await new Promise((r) => setTimeout(r, 400));
        Alert.alert(
          language === 'hi' ? 'सफल' : 'Success',
          language === 'hi' ? 'मॉडल सफलतापूर्वक डाउनलोड हो गया है।' : 'Model downloaded successfully.'
        );
      } else {
        const errorDetail = modelManager.getModel(id)?.error;
        Alert.alert(
          language === 'hi' ? 'डाउनलोड विफल' : 'Download Failed',
          errorDetail
            ? (language === 'hi' ? `मॉडल डाउनलोड नहीं हो सका: ${errorDetail}` : `Could not download model: ${errorDetail}`)
            : (language === 'hi' ? 'मॉडल डाउनलोड नहीं हो सका। कृपया सर्वर और नेटवर्क जांचें।' : 'Could not download model. Check server and network.')
        );
      }
    } catch (err: any) {
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', err?.message || 'Download error');
    } finally {
      setDownloadingId(null);
      setModels(modelManager.getAllModels());
    }
  };

  const handleDeleteModel = (id: ModelId) => {
    Alert.alert(
      language === 'hi' ? 'हटाएं?' : 'Remove?',
      language === 'hi' ? 'क्या आप इसे फोन से हटाना चाहते हैं?' : 'Are you sure you want to remove this from your device?',
      [
        { text: t.cancelBtn, style: 'cancel' },
        {
          text: language === 'hi' ? 'हटाएं' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            await modelManager.deleteModel(id);
            setModels(modelManager.getAllModels());
          }
        }
      ]
    );
  };



  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.profileHeader}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{t.profileHeaderSub}</Text>
        </View>
        <TouchableOpacity
          style={styles.langToggleBtn}
          onPress={toggleLanguage}
          accessibilityLabel="Toggle Language"
        >
          <Ionicons name="language" size={16} color={Colors.primary} />
          <Text style={styles.langToggleText}>
            {language === 'hi' ? 'English' : 'हिंदी'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Image
            source={require('../../assets/worker_avatar.png')}
            style={styles.avatarImg}
          />
          <View style={styles.profileDetails}>
            <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>
            <Text style={styles.role} numberOfLines={1}>{t.workerRole}</Text>
            <View style={styles.metaBadgeRow}>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>ID #{profile.id}</Text>
              </View>
              <View style={[styles.metaBadge, { backgroundColor: Colors.successLight }]}>
                <Text style={[styles.metaBadgeText, { color: Colors.success }]}>{t.activeWorker}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Dynamic Performance Metrics */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t.monthlyMetricsTitle}</Text>

          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Ionicons name="home" size={18} color={Colors.primary} />
              <Text style={styles.metricValue}>{metrics.totalVisits}</Text>
              <Text style={styles.metricLabel}>{t.visitsMetric}</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons name="medical" size={18} color={Colors.primaryBright} />
              <Text style={styles.metricValue}>{metrics.ncdScreenings}</Text>
              <Text style={styles.metricLabel}>{t.screeningsMetric}</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons name="female" size={18} color={Colors.accent} />
              <Text style={styles.metricValue}>{metrics.ancCare}</Text>
              <Text style={styles.metricLabel}>{t.ancMetric}</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.metricValue}>{metrics.highRiskCases}</Text>
              <Text style={styles.metricLabel}>{t.highRiskMetric}</Text>
            </View>
          </View>
        </View>

        {/* System Integrity Badges */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {language === 'hi' ? 'सुरक्षा एवं गोपनीयता' : 'Security & Privacy'}
          </Text>

          <View style={styles.badgeRow}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.primary} />
            <View style={styles.badgeInfo}>
              <Text style={styles.badgeHeading}>
                {language === 'hi' ? 'गोपनीय डेटा सुरक्षा' : 'Data Privacy'}
              </Text>
              <Text style={styles.badgeSub}>
                {language === 'hi' ? 'मरीजों का डेटा डिवाइस में सुरक्षित रहता है' : 'Patient records stay private on your device'}
              </Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <Ionicons name="checkmark-done-circle" size={22} color={Colors.success} />
            <View style={styles.badgeInfo}>
              <Text style={styles.badgeHeading}>
                {language === 'hi' ? 'कार्यकर्ता पुष्टि' : 'Worker Verification'}
              </Text>
              <Text style={styles.badgeSub}>
                {language === 'hi' ? 'सभी जांच आपके व्यक्तिगत अनुमोदन के बाद ही दर्ज होती हैं' : 'All health records require your personal review'}
              </Text>
            </View>
          </View>
        </View>

        {/* On-Device AI Models Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {language === 'hi' ? 'जांच रिपोर्ट सारांश गति' : 'Summary Detail & Speed'}
            </Text>
          </View>

          <Text style={styles.modelHelpText}>
            {language === 'hi'
              ? 'जांच रिपोर्ट सारांश के लिए अपनी पसंद चुनें।'
              : 'Select summary detail level for screening reports.'}
          </Text>

          {/* Model Selection Radio Pills */}
          <View style={styles.pillSelectorRow}>
            <TouchableOpacity
              style={[
                styles.preferencePill,
                preferredSummary === 'qwen3-0.6b' && styles.preferencePillActive
              ]}
              onPress={() => handleSelectSummaryModel('qwen3-0.6b')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={preferredSummary === 'qwen3-0.6b' ? "radio-button-on" : "radio-button-off"}
                size={16}
                color={preferredSummary === 'qwen3-0.6b' ? Colors.primary : Colors.textSecondary}
              />
              <View style={styles.pillTextCol}>
                <Text style={[
                  styles.preferencePillTitle,
                  preferredSummary === 'qwen3-0.6b' && styles.preferencePillTitleActive
                ]}>
                  {language === 'hi' ? 'तेज़ एवं हल्का (अनुशंसित)' : 'Fast Summary (Recommended)'}
                </Text>
                <Text style={styles.preferencePillSub}>
                  {language === 'hi' ? 'तुरंत सारांश, कम स्टोरेज' : 'Quick summary, less storage'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.preferencePill,
                preferredSummary === 'qwen3-1.7b' && styles.preferencePillActive
              ]}
              onPress={() => handleSelectSummaryModel('qwen3-1.7b')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={preferredSummary === 'qwen3-1.7b' ? "radio-button-on" : "radio-button-off"}
                size={16}
                color={preferredSummary === 'qwen3-1.7b' ? Colors.primary : Colors.textSecondary}
              />
              <View style={styles.pillTextCol}>
                <Text style={[
                  styles.preferencePillTitle,
                  preferredSummary === 'qwen3-1.7b' && styles.preferencePillTitleActive
                ]}>
                  {language === 'hi' ? 'विस्तृत सारांश' : 'Detailed Summary'}
                </Text>
                <Text style={styles.preferencePillSub}>
                  {language === 'hi' ? 'अधिक विस्तृत रिपोर्ट' : 'Comprehensive reports'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Model Catalog Items */}
          <View style={styles.modelList}>
            {models.map((m) => {
              const isDownloading = downloadingId === m.id;
              const isReady = m.status === 'ready';

              const cleanNameHi = m.id === 'needle3' ? 'आवाज़ से आंकड़े निष्कर्षण' : m.id === 'qwen3-0.6b' ? 'त्वरित जांच सारांश' : 'विस्तृत जांच सारांश';
              const cleanNameEn = m.id === 'needle3' ? 'Voice Data Extraction' : m.id === 'qwen3-0.6b' ? 'Fast Screening Summary' : 'Detailed Screening Summary';

              return (
                <View key={m.id} style={styles.modelItemCard}>
                  <View style={styles.modelItemTop}>
                    <View style={styles.modelItemInfo}>
                      <Text style={styles.modelItemName}>
                        {language === 'hi' ? cleanNameHi : cleanNameEn}
                      </Text>
                      <Text style={styles.modelItemMeta}>
                        {m.sizeFormatted} • {isReady ? (language === 'hi' ? 'सक्रिय' : 'Active') : (language === 'hi' ? 'उपलब्ध' : 'Available')}
                        {m.status === 'ready' && m.sizeOnDisk
                          ? ` • ${(m.sizeOnDisk / 1048576).toFixed(0)}MB`
                          : ''}
                      </Text>
                      {m.status === 'error' && m.error ? (
                        <Text style={styles.modelErrorText}>{m.error}</Text>
                      ) : null}
                    </View>
                    <View style={[
                      styles.modelStatusBadge,
                      isReady ? styles.statusBadgeReady : styles.statusBadgeAvailable
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        isReady ? styles.statusBadgeTextReady : styles.statusBadgeTextAvailable
                      ]}>
                        {isReady
                          ? (language === 'hi' ? 'तैयार' : 'Ready')
                          : (language === 'hi' ? 'उपलब्ध' : 'Available')}
                      </Text>
                    </View>
                  </View>

                  {isDownloading ? (
                    <View style={styles.downloadProgressContainer}>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${downloadProgress}%` }]} />
                      </View>
                      <Text style={styles.progressPercentText}>{downloadProgress}%</Text>
                    </View>
                  ) : (
                    <View style={styles.modelActionRow}>
                      {!isReady ? (
                        <TouchableOpacity
                          style={styles.modelActionBtn}
                          onPress={() => handleDownloadModel(m.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="cloud-download-outline" size={15} color={Colors.primary} />
                          <Text style={styles.modelActionBtnText}>
                            {language === 'hi' ? 'डाउनलोड करें' : 'Download'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.modelActionBtn, styles.modelDeleteBtn]}
                          onPress={() => handleDeleteModel(m.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                          <Text style={[styles.modelActionBtnText, { color: Colors.danger }]}>
                            {language === 'hi' ? 'हटाएं' : 'Remove'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Android Native Speech Recognition Info Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {language === 'hi' ? 'ऑफ़लाइन आवाज़ सहायता' : 'Offline Voice Help'}
          </Text>
          <Text style={styles.modelHelpText}>
            {language === 'hi'
              ? 'बिना इंटरनेट बोलकर जांच दर्ज करने के लिए फोन की सेटिंग में हिंदी वॉइस पैक डाउनलोड रखें।'
              : 'To record speech without internet, ensure Hindi offline voice pack is enabled on your phone.'}
          </Text>
        </View>

        {/* Clear Demo Data / Start Fresh Action */}
        <TouchableOpacity
          style={styles.clearDataBtn}
          onPress={handleClearDemoData}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.warning} />
          <Text style={styles.clearDataBtnText}>{t.clearDemoDataBtn}</Text>
        </TouchableOpacity>

        {/* Logout CTA */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.logoutBtnText}>{t.logoutBtn}</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTextCol: {
    flex: 1,
    flexShrink: 1,
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
  langToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.border,
    marginLeft: 8,
  },
  langToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  content: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm + 4,
    gap: 12,
  },
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  profileDetails: {
    flex: 1,
    flexShrink: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  role: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  metaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  metaBadge: {
    backgroundColor: Colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricItem: {
    width: '48.5%',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginVertical: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  badgeInfo: {
    flex: 1,
    flexShrink: 1,
  },
  badgeHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  badgeSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  clearDataBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginTop: 10,
    marginBottom: 4,
  },
  clearDataBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dangerLight,
    backgroundColor: Colors.surface,
    marginTop: 4,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.danger,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  badgePill: {
    backgroundColor: Colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  buildTag: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  modelHelpText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
    lineHeight: 16,
  },
  modelErrorText: {
    fontSize: 11,
    color: Colors.danger,
    marginTop: 4,
    lineHeight: 15,
  },
  pillSelectorRow: {
    gap: 8,
    marginBottom: 12,
  },
  preferencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceContainer,
  },
  preferencePillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  pillTextCol: {
    flex: 1,
  },
  preferencePillTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  preferencePillTitleActive: {
    color: Colors.primary,
  },
  preferencePillSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  modelList: {
    gap: 8,
  },
  modelItemCard: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modelItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  modelItemInfo: {
    flex: 1,
  },
  modelItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modelItemMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modelStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeReady: {
    backgroundColor: Colors.successLight,
  },
  statusBadgeAvailable: {
    backgroundColor: Colors.surface,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadgeTextReady: {
    color: Colors.success,
  },
  statusBadgeTextAvailable: {
    color: Colors.textSecondary,
  },
  modelActionRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modelActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modelDeleteBtn: {
    borderColor: Colors.dangerLight,
  },
  modelActionBtnDisabled: {
    opacity: 0.4,
  },
  abcResults: {
    marginTop: 10,
    gap: 8,
  },
  abcRow: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 8,
  },
  abcLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  abcText: {
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 17,
  },
  modelActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  downloadProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  progressPercentText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 32,
    textAlign: 'right',
  },
});
