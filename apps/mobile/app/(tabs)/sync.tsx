import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { syncService } from '../../services/sync/syncService';
import { syncQueueRepository } from '../../services/db/syncQueueRepo';
import { SyncQueueItem } from '@asha/shared';

export default function PendingSyncScreen() {
  const { language, t } = useLanguage();
  const [pendingItems, setPendingItems] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendUrl, setBackendUrl] = useState(syncService.getBackendUrl());
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const loadQueue = async () => {
    try {
      const items = await syncQueueRepository.getPending();
      setPendingItems(items);
      const status = await syncService.getStatus();
      setLastSyncTime(status.lastSyncTime);
    } catch (e) {
      console.warn('Error loading sync queue', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadQueue();
    }, [])
  );

  const handleSyncNow = async () => {
    syncService.setBackendUrl(backendUrl);
    setIsSyncing(true);

    const result = await syncService.triggerSync();
    setIsSyncing(false);

    if (result.success) {
      Alert.alert(
        t.success,
        result.processedCount > 0
          ? (language === 'hi'
              ? `${result.processedCount} रिकॉर्ड्स सफलतापूर्वक सर्वर से सिंक हो गए हैं।`
              : `${result.processedCount} records successfully synchronized with server.`)
          : t.syncAllReady
      );
    } else {
      Alert.alert(
        language === 'hi' ? 'सिंक स्थिति' : 'Sync Status',
        result.error || (language === 'hi'
          ? 'सर्वर से संपर्क नहीं हो पाया। रिकॉर्ड्स सुरक्षित ऑफलाइन कतार में हैं।'
          : 'Could not connect to server. Records remain safe in offline queue.')
      );
    }

    loadQueue();
  };

  const patientCount = pendingItems.filter(i => i.entity_type === 'patient').length;
  const screeningCount = pendingItems.filter(i => i.entity_type === 'screening').length;
  const followupCount = pendingItems.filter(i => i.entity_type === 'followup').length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.syncHeader}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{t.syncHeaderSub}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: pendingItems.length > 0 ? Colors.accentLight : Colors.successLight }]}>
          <Text style={[styles.statusPillText, { color: pendingItems.length > 0 ? Colors.accent : Colors.success }]}>
            {pendingItems.length} {t.recordsPending}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Sync Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.iconCircle}>
              <Ionicons
                name={pendingItems.length > 0 ? 'cloud-upload' : 'cloud-done'}
                size={24}
                color={Colors.primary}
              />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryHeading} numberOfLines={1}>
                {pendingItems.length > 0
                  ? (language === 'hi' ? 'डेटा अपलोड के लिए तैयार है' : 'Data Ready for Upload')
                  : t.syncAllReady}
              </Text>
              <Text style={styles.summarySub}>
                {lastSyncTime
                  ? `${language === 'hi' ? 'अंतिम सिंक:' : 'Last sync:'} ${new Date(lastSyncTime).toLocaleTimeString(language === 'hi' ? 'hi-IN' : 'en-IN')}`
                  : (language === 'hi' ? 'कभी सिंक नहीं हुआ' : 'Never synced')}
              </Text>
            </View>
          </View>

          {/* Breakdown Pills */}
          <View style={styles.pillsRow}>
            <View style={styles.countBadge}>
              <Text style={styles.countNumber}>{patientCount}</Text>
              <Text style={styles.countLabel}>{t.searchPatients}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countNumber}>{screeningCount}</Text>
              <Text style={styles.countLabel}>{t.screeningsMetric}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countNumber}>{followupCount}</Text>
              <Text style={styles.countLabel}>{t.followupsDue}</Text>
            </View>
          </View>
        </View>

        {/* Sync Action Trigger */}
        <TouchableOpacity
          style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
          onPress={handleSyncNow}
          disabled={isSyncing}
          activeOpacity={0.85}
        >
          {isSyncing ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <>
              <Ionicons name="sync" size={18} color={Colors.surface} />
              <Text style={styles.syncBtnText}>{t.syncNowBtn}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Queue Items List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {language === 'hi' ? 'कतार में लंबित रिकॉर्ड्स' : 'Pending Queue Items'}
          </Text>
        </View>

        {pendingItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-circle-outline" size={40} color={Colors.success} />
            <Text style={styles.emptyText}>{t.syncAllReady}</Text>
          </View>
        ) : (
          pendingItems.map((item) => (
            <View key={item.id} style={styles.queueItemCard}>
              <View style={styles.queueItemLeft}>
                <Ionicons
                  name={item.entity_type === 'patient' ? 'person' : item.entity_type === 'screening' ? 'medical' : 'time'}
                  size={16}
                  color={Colors.primary}
                />
                <View style={styles.queueItemInfo}>
                  <Text style={styles.queueItemTitle} numberOfLines={1}>
                    {item.entity_type === 'patient' ? t.searchPatients : item.entity_type === 'screening' ? t.screeningsMetric : t.followupsDue}
                  </Text>
                  <Text style={styles.queueItemSub} numberOfLines={1}>ID: #{item.entity_id}</Text>
                </View>
              </View>
              <View style={styles.queueItemRight}>
                <Text style={styles.actionTag}>{item.operation.toUpperCase()}</Text>
              </View>
            </View>
          ))
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
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm + 4,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
    flexShrink: 1,
  },
  summaryHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  summarySub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countBadge: {
    flex: 1,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
  },
  countLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 1,
    textAlign: 'center',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  syncBtnDisabled: {
    opacity: 0.6,
  },
  syncBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.surface,
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  queueItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  queueItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexShrink: 1,
  },
  queueItemInfo: {
    flex: 1,
    flexShrink: 1,
  },
  queueItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  queueItemSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  queueItemRight: {
    marginLeft: 6,
  },
  actionTag: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.surfaceContainer,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
