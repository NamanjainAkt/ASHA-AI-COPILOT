import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing } from '../constants/theme';

import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '../services/db/database';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Prime local SQLite database
        await getDatabase();

        // 2. Check if worker has completed onboarding
        const hasOnboarded = await SecureStore.getItemAsync('has_onboarded');
        const sessionActive = await SecureStore.getItemAsync('session_active');

        setTimeout(() => {
          if (!hasOnboarded) {
            router.replace('/onboarding');
          } else if (sessionActive === 'true') {
            router.replace('/(tabs)');
          } else {
            router.replace('/login');
          }
        }, 1200);
      } catch (e) {
        console.error('Splash init error:', e);
        setTimeout(() => {
          router.replace('/login');
        }, 1200);
      }
    };

    initApp();
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo Container */}
        <View style={styles.logoWrapper}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Title & Tagline */}
        <Text style={styles.title}>आशा AI Copilot</Text>
        <Text style={styles.subtitle}>ग्रामीण स्वास्थ्य सहायिका</Text>

        {/* Offline Badge */}
        <View style={styles.badge}>
          <View style={styles.dot} />
          <Text style={styles.badgeText}>100% ऑन-डिवाइस सुरक्षित AI</Text>
        </View>
      </View>

      {/* Bottom Loader */}
      <View style={styles.footer}>
        <ActivityIndicator color={Colors.primaryMuted} size="small" />
        <Text style={styles.footerText}>डेटाबेस लोड हो रहा है...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: Spacing.lg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.surface,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primaryLight,
    marginTop: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(204, 251, 241, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 28,
    borderWidth: 1,
    borderColor: 'rgba(204, 251, 241, 0.3)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primaryBright,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryLight,
  },
  footer: {
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: Colors.primaryLight,
  },
});
