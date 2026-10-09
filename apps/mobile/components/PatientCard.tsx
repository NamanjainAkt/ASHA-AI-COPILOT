import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../constants/theme';
import { useLanguage } from '../context/LanguageContext';
import { Patient } from '@asha/shared';

interface PatientCardProps {
  patient: Patient;
  riskStatus?: 'high' | 'medium' | 'normal';
  onPress: () => void;
  onPressAction?: () => void;
}

export const PatientCard: React.FC<PatientCardProps> = ({
  patient,
  riskStatus = 'normal',
  onPress,
  onPressAction,
}) => {
  const { language, t } = useLanguage();

  const getAccentColor = () => {
    if (riskStatus === 'high') return Colors.danger;
    if (riskStatus === 'medium') return Colors.accent;
    return Colors.success;
  };

  const getRiskLabel = () => {
    if (riskStatus === 'high') return t.riskStatus.high;
    if (riskStatus === 'medium') return t.riskStatus.medium;
    return t.riskStatus.normal;
  };

  const sexText = patient.sex === 'female' ? t.gender.female : t.gender.male;
  const ageText = language === 'hi' ? `${patient.age} वर्ष` : `${patient.age} yrs`;

  const getBadgeBgColor = () => {
    switch (riskStatus) {
      case 'high':
        return Colors.dangerLight;
      case 'medium':
        return Colors.warningLight;
      default:
        return Colors.successLight;
    }
  };

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={onPressAction || onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${patient.name}, ${getRiskLabel()}, ${patient.village}`}
    >
      {/* Left Accent Cue */}
      <View style={[styles.leftBorder, { backgroundColor: getAccentColor() }]} />

      <View style={styles.cardContent}>
        <View style={styles.headerRow}>
          <Text style={styles.patientName} numberOfLines={1}>
            {patient.name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getBadgeBgColor() }]}>
            <Text style={[styles.statusText, { color: getAccentColor() }]}>
              {getRiskLabel()}
            </Text>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <Text style={styles.detailText}>
            {ageText} · {sexText}
          </Text>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.detailText} numberOfLines={1}>{patient.village}</Text>
          {patient.household_id && (
            <>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.detailText} numberOfLines={1}>{patient.household_id}</Text>
            </>
          )}
        </View>

        {patient.phone && (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.phoneText}>{patient.phone}</Text>
          </View>
        )}
      </View>

      {/* Right Quick Action Chevron Indicator */}
      <View style={styles.actionButton}>
        <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    minHeight: 76,
  },
  leftBorder: {
    width: 5,
    height: '100%',
  },
  cardContent: {
    flex: 1,
    paddingVertical: Spacing.md2,
    paddingHorizontal: Spacing.md2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patientName: {
    fontSize: Typography.bodyLg,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  detailText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  bullet: {
    marginHorizontal: 4,
    color: Colors.outlineVariant,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  phoneText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  actionButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
});
