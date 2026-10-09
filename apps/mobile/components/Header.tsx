import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/theme';
import { Translations } from '../constants/translations';

interface HeaderProps {
  language?: 'hi' | 'en';
  onToggleLanguage?: () => void;
  isOnline?: boolean;
  syncedCount?: number;
  villageName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  language = 'hi',
  onToggleLanguage,
  isOnline = true,
  syncedCount = 0,
  villageName = 'रामपुर',
}) => {
  const t = Translations[language] || Translations.hi;

  return (
    <View style={styles.container}>
      {/* Top Sync & Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.success : Colors.warning }]} />
          <Ionicons
            name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
            size={14}
            color={isOnline ? Colors.primary : Colors.textSecondary}
          />
          <Text style={styles.statusText} numberOfLines={1}>
            {isOnline ? t.onlineStatus : t.offlineStatus}
          </Text>
        </View>
        <Text style={styles.statusCount}>
          {syncedCount} {t.syncedCountSuffix}
        </Text>
      </View>

      {/* Main Bar */}
      <View style={styles.mainBar}>
        <View style={styles.brandRow}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.brandTitle} numberOfLines={1}>{t.appName}</Text>
            <Text style={styles.brandSubtitle} numberOfLines={1}>
              {t.subtitle} · {villageName}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {/* Language Toggle */}
          <TouchableOpacity
            style={styles.langButton}
            onPress={onToggleLanguage}
            accessibilityLabel="Language Switcher"
          >
            <Text style={[styles.langText, language === 'hi' && styles.langActive]}>हिंदी</Text>
            <Text style={styles.langDivider}>/</Text>
            <Text style={[styles.langText, language === 'en' && styles.langActive]}>EN</Text>
          </TouchableOpacity>

          {/* Profile Avatar */}
          <View style={styles.avatarContainer}>
            <Image
              source={require('../assets/worker_avatar.png')}
              style={styles.avatar}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    marginBottom: Spacing.xs,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  statusCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  mainBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  brandRow: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  brandSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: Spacing.touchMin,
    justifyContent: 'center',
  },
  langText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  langActive: {
    fontWeight: '700',
    color: Colors.primary,
  },
  langDivider: {
    marginHorizontal: 3,
    color: Colors.outlineVariant,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primaryLight,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
});
