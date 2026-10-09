import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Linking,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useLanguage } from '../../context/LanguageContext';
import { screeningRepository } from '../../services/db/screeningRepo';
import { patientRepository } from '../../services/db/patientRepo';
import { PatientCard } from '../../components/PatientCard';
import { Patient, Screening } from '@asha/shared';

export default function HighRiskPatientsScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [highRiskPatients, setHighRiskPatients] = useState<{ patient: Patient; screening?: Screening }[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadHighRiskCases();
    }, [])
  );

  const loadHighRiskCases = async () => {
    setLoading(true);
    try {
      const [allPatients, allScreenings] = await Promise.all([
        patientRepository.getAll(),
        screeningRepository.list(),
      ]);

      const items: { patient: Patient; screening?: Screening }[] = [];
      const seenPatientIds = new Set<string>();

      for (const sc of allScreenings) {
        const hasHighRisk = sc.rule_results && sc.rule_results.some(r => r.priority === 'high');
        if (hasHighRisk && !seenPatientIds.has(sc.patient_id)) {
          const p = allPatients.find(patient => patient.id === sc.patient_id);
          if (p) {
            seenPatientIds.add(p.id);
            items.push({ patient: p, screening: sc });
          }
        }
      }

      setHighRiskPatients(items);
    } catch (e) {
      console.warn('Error loading high-risk cases', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAmbulanceCall = () => {
    Alert.alert(
      t.ambulanceHelp,
      t.dial108Prompt,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: `${t.call} 108`,
          onPress: async () => {
            const url = 'tel:108';
            try {
              if (await Linking.canOpenURL(url)) {
                await Linking.openURL(url);
              } else {
                Alert.alert(t.error, language === 'hi' ? 'डिवाइस कॉलिंग का समर्थन नहीं करता है' : 'Device cannot make phone calls');
              }
            } catch (err: any) {
              Alert.alert(t.error, err.message || 'Could not dial 108');
            }
          }
        }
      ]
    );
  };

  const handleBack = () => {
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
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t.highRiskHeader}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{t.highRiskHeaderSub}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Emergency Transit Action Strip */}
      <View style={styles.alertStrip}>
        <View style={styles.alertLeft}>
          <Ionicons name="medical" size={22} color={Colors.danger} />
          <View style={styles.alertTextCol}>
            <Text style={styles.alertTitle} numberOfLines={1}>{t.ambulanceHelp}</Text>
            <Text style={styles.alertSub} numberOfLines={1}>{t.ambulanceHelpSub}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.ambulanceBtn}
          onPress={handleAmbulanceCall}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={14} color={Colors.surface} />
          <Text style={styles.ambulanceBtnText}>{t.dial108}</Text>
        </TouchableOpacity>
      </View>

      {/* Patient List */}
      <FlatList
        data={highRiskPatients}
        keyExtractor={item => item.patient.id}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={10}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const highRule = item.screening?.rule_results?.find(r => r.priority === 'high');
          const ruleReason = language === 'hi'
            ? (highRule?.reason_hi || highRule?.reason || 'प्रोटोकॉल स्क्रीनिंग नियम के अनुसार उच्च जोखिम स्थिति।')
            : (highRule?.reason || 'Clinical alert requires urgent medical attention.');

          return (
            <View style={styles.itemWrapper}>
              <PatientCard
                patient={item.patient}
                riskStatus="high"
                onPress={() => {
                  router.push(`/patients/${item.patient.id}`);
                }}
              />
              <View style={styles.riskReasonBox}>
                <Ionicons name="warning" size={14} color={Colors.danger} />
                <Text style={styles.riskReasonText}>{ruleReason}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="shield-checkmark" size={40} color={Colors.success} />
            <Text style={styles.emptyTitle}>{t.emptyHighRisk}</Text>
            <Text style={styles.emptySub}>{t.allNormal}</Text>
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
  alertStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(220, 38, 38, 0.2)',
  },
  alertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexShrink: 1,
  },
  alertTextCol: {
    flex: 1,
    flexShrink: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.danger,
  },
  alertSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  ambulanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  ambulanceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.surface,
  },
  listContent: {
    padding: Spacing.sm + 4,
    paddingBottom: 24,
  },
  itemWrapper: {
    marginBottom: 8,
  },
  riskReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  riskReasonText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textPrimary,
    lineHeight: 15,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
