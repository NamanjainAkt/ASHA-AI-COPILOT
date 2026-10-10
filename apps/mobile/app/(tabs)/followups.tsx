import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { followupRepository } from '../../services/db/followupRepo';
import { syncQueueRepository } from '../../services/db/syncQueueRepo';
import { getDatabase } from '../../services/db/database';
import { FollowUpStatus } from '@asha/shared';

export default function FollowupsScreen() {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<FollowUpStatus>('pending');
  const [followups, setFollowups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFollowups = async () => {
    setLoading(true);
    try {
      const data = await followupRepository.list(activeTab);
      setFollowups(data);
    } catch (e) {
      console.warn('Error loading follow-ups', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadFollowups();
    }, [activeTab])
  );

  const handleMarkComplete = async (id: string, name: string) => {
    try {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await followupRepository.updateStatus(id, 'completed', db);
        await syncQueueRepository.enqueue('followup', id, 'update', { status: 'completed' }, db);
      });
      Alert.alert(
        t.success,
        language === 'hi'
          ? `${name} का फॉलो-अप कार्य पूर्ण चिह्नित किया गया।`
          : `Follow-up for ${name} marked as complete.`
      );
      loadFollowups();
    } catch (e: any) {
      Alert.alert(t.error, e.message || 'Error updating status');
    }
  };

  const handleCall = async (phone?: string) => {
    if (!phone) {
      Alert.alert(
        language === 'hi' ? 'सूचना' : 'Notice',
        language === 'hi' ? 'लाभार्थी का फोन नंबर उपलब्ध नहीं है' : 'Beneficiary phone number not available'
      );
      return;
    }
    const cleanPhone = phone.trim();
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
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.followupsHeader}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{t.followupsHeaderSub}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{followups.length}</Text>
        </View>
      </View>

      {/* Tabs Row */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
          onPress={() => setActiveTab('pending')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={activeTab === 'pending' ? Colors.surface : Colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            {t.pendingTab}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'completed' && styles.tabBtnActive]}
          onPress={() => setActiveTab('completed')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="checkmark-done-outline"
            size={16}
            color={activeTab === 'completed' ? Colors.surface : Colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
            {t.completedTab}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Follow-up List */}
      <FlatList
        data={followups}
        keyExtractor={item => item.id}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={10}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isHigh = item.priority === 'high';
          const isMed = item.priority === 'medium';
          const accent = isHigh ? Colors.danger : isMed ? Colors.warning : Colors.accent;
          const bgPill = isHigh ? Colors.dangerLight : isMed ? Colors.warningLight : Colors.accentLight;
          const label = isHigh ? t.riskStatus.high : isMed ? t.riskStatus.medium : t.riskStatus.normal;

          return (
            <View style={[styles.card, { borderLeftColor: accent }]}>
              <View style={styles.cardTop}>
                <View style={styles.patientCol}>
                  <Text style={styles.patientName} numberOfLines={1}>
                    {item.patient_name || (language === 'hi' ? 'लाभार्थी' : 'Beneficiary')}
                  </Text>
                  <Text style={styles.patientVillage} numberOfLines={1}>
                    {item.patient_village || (language === 'hi' ? 'रामपुर' : 'Rampur')}
                  </Text>
                </View>
                <View style={[styles.priorityPill, { backgroundColor: bgPill }]}>
                  <Text style={[styles.priorityText, { color: accent }]}>
                    {label}
                  </Text>
                </View>
              </View>

              <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>

              <View style={styles.cardBottom}>
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.dateText}>
                    {t.scheduledDate} {item.due_date || t.today}
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  {item.patient_phone && (
                    <TouchableOpacity
                      style={styles.actionCircle}
                      onPress={() => handleCall(item.patient_phone)}
                      accessibilityLabel={t.callPatient}
                    >
                      <Ionicons name="call" size={15} color={Colors.primary} />
                    </TouchableOpacity>
                  )}

                  {activeTab === 'pending' && (
                    <TouchableOpacity
                      style={styles.completeBtn}
                      onPress={() => handleMarkComplete(item.id, item.patient_name || 'लाभार्थी')}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark" size={14} color={Colors.surface} />
                      <Text style={styles.completeBtnText}>{t.markDoneBtn}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-circle-outline" size={44} color={Colors.outline} />
            <Text style={styles.emptyText}>
              {activeTab === 'pending'
                ? (language === 'hi' ? 'कोई लंबित फॉलो-अप नहीं है' : 'No pending follow-ups')
                : (language === 'hi' ? 'कोई पूर्ण फॉलो-अप नहीं है' : 'No completed follow-ups')}
            </Text>
          </View>
        }
      />
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
  badge: {
    backgroundColor: Colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: Colors.surface,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.surface,
  },
  listContent: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  patientCol: {
    flex: 1,
    flexShrink: 1,
    marginRight: 6,
  },
  patientName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  patientVillage: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  priorityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  reasonText: {
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 16,
    marginBottom: 8,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceContainer,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  dateText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  completeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.surface,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
  },
});
