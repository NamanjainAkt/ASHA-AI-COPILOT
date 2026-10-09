import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/theme';
import { useLanguage } from '../context/LanguageContext';
import { RuleResult } from '@asha/shared';

interface RiskCardProps {
  rule: RuleResult;
}

export const RiskCard: React.FC<RiskCardProps> = ({ rule }) => {
  const { language, t } = useLanguage();
  const isHigh = rule.priority === 'high';
  const isMedium = rule.priority === 'medium';

  const accentColor = isHigh ? Colors.danger : isMedium ? Colors.warning : Colors.accent;
  const bgColor = isHigh ? Colors.dangerLight : isMedium ? Colors.warningLight : Colors.accentLight;

  const priorityLabel = isHigh ? t.riskStatus.high : isMedium ? t.riskStatus.medium : t.riskStatus.normal;
  const reasonText = language === 'hi' ? (rule.reason_hi || rule.reason) : rule.reason;

  const workflowTranslations: Record<string, string> = {
    'Urgent referral to PHC/CHC medical officer on the same day.': 'आज ही प्राथमिक स्वास्थ्य केंद्र (PHC/CHC) चिकित्सा अधिकारी को तत्काल रेफर करें।',
    'Schedule follow-up re-check within 7 days and refer to ANM/MO for clinical evaluation.': '7 दिनों के भीतर फॉलो-अप जांच निर्धारित करें और एएनएम/चिकित्सक को रेफर करें।',
    'Refer to PHC for confirmatory fasting plasma glucose and dietary counseling.': 'फास्टिंग प्लाज्मा ग्लूकोज जांच और आहार परामर्श हेतु पीएचसी रेफर करें।',
    'Counsel patient on treatment adherence; schedule home visit within 3 days.': 'दवा नियमित लेने की सलाह दें; 3 दिनों के भीतर गृह भेंट करें।',
    'Immediate ambulance transfer (108) to nearest FRU/District Hospital. Notify MO.': 'निकटतम एफआरयू/जिला अस्पताल में तत्काल एम्बुलेंस (108) से भेजें। चिकित्सक को सूचित करें।',
    'Urgent transfer to FRU for pre-eclampsia evaluation and magnesium sulfate prophylaxis.': 'प्री-एक्लेमप्सिया जांच हेतु तुरंत एफआरयू रेफर करें।',
    'Urgent referral to obstetric care facility.': 'प्रसूति देखभाल केंद्र में तत्काल रेफर करें।',
    'Refer to District Hospital for immediate fetal ultrasound and monitoring.': 'शिशु की सोनोग्राफी व निगरानी हेतु जिला अस्पताल रेफर करें।',
    'Immediate hospital referral for maternal sepsis / infection workup.': 'संक्रमण की जांच व इलाज हेतु तुरंत अस्पताल रेफर करें।',
    'Check blood pressure immediately.': 'तुरंत रक्तचाप की जांच करें।',
    'Routine maternal follow-up.': 'नियमित मातृत्व फॉलो-अप जारी रखें।',
    'Verify sphygmomanometer cuff and re-measure BP.': 'बीपी कफ की जांच कर पुनः रक्तचाप मापें।',
    'Repeat glucometer test with fresh test strip.': 'नई टेस्ट स्ट्रिप से पुनः ग्लूकोज जांचें।',
    'Perform remaining tests or mark reason for deferral in field record.': 'शेष जांच पूरी करें अथवा फील्ड रिकॉर्ड में कारण दर्ज करें।',
    'Verify gestational age using MCP card / LMP date.': 'एमसीपी कार्ड / एलएमपी तिथि से गर्भकालीन अवधि सत्यापित करें।'
  };
  const actionText = language === 'hi' ? (workflowTranslations[rule.nextWorkflow] || rule.nextWorkflow) : rule.nextWorkflow;

  return (
    <View style={[styles.card, { borderColor: accentColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons
            name={isHigh ? 'alert-circle' : 'warning-outline'}
            size={18}
            color={accentColor}
          />
          <Text style={styles.ruleName} numberOfLines={2}>
            {rule.ruleName}
          </Text>
        </View>
        <View style={[styles.priorityPill, { backgroundColor: bgColor }]}>
          <Text style={[styles.priorityText, { color: accentColor }]}>
            {priorityLabel}
          </Text>
        </View>
      </View>

      {/* Why Flagged Explanation */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.whyFlaggedLabel}</Text>
        <Text style={styles.reasonText}>{reasonText}</Text>
      </View>

      {/* Protocol Source */}
      <View style={styles.protocolRow}>
        <Ionicons name="shield-checkmark-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.protocolText}>{t.protocolLabel} {rule.protocolSource}</Text>
      </View>

      {/* Recommended Action */}
      <View style={[styles.actionBox, { backgroundColor: bgColor + '30' }]}>
        <Text style={[styles.actionLabel, { color: accentColor }]}>{t.nextActionLabel}</Text>
        <Text style={styles.actionText}>{actionText}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 6,
  },
  ruleName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '800',
  },
  section: {
    marginVertical: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginBottom: 2,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginBottom: 8,
  },
  protocolText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  actionBox: {
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
});
