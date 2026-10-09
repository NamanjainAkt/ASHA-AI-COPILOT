import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

export default function VoiceTabScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/screening/voice-capture');
  }, [router]);

  return <View style={{ flex: 1 }} />;
}
