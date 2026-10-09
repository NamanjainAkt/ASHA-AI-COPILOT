import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '../context/LanguageContext';
import { Colors } from '../constants/theme';
import { getDatabase } from '../services/db/database';
import { modelManager } from '../services/ai/modelManager';

export default function RootLayout() {
  useEffect(() => {
    // Ensure SQLite database and seed data are ready on launch
    getDatabase().catch(err => {
      console.warn('Database initialization error:', err);
    });

    // Probe model storage directory and ready status
    modelManager.initialize().catch(err => {
      console.warn('ModelManager initialization error:', err);
    });
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: Colors.background }}>
      <LanguageProvider>
        <StatusBar style="dark" backgroundColor={Colors.surface} />
        <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="screening/voice-capture"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="screening/summary"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="screening/manual-entry"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="patients/index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="patients/new"
          options={{
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="patients/high-risk"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen name="patients/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="village/index"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
