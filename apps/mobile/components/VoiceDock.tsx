import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/theme';

export type VoiceState = 'idle' | 'listening' | 'processing';

interface VoiceDockProps {
  state?: VoiceState;
  onPressMic: () => void;
  language?: 'hi' | 'en';
  scenarioTitle?: string;
  onSwitchScenario?: () => void;
}

export const VoiceDock: React.FC<VoiceDockProps> = ({
  state = 'idle',
  onPressMic,
  language = 'hi',
  scenarioTitle,
  onSwitchScenario,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state, pulseAnim]);

  return (
    <View style={styles.dockContainer}>
      {/* Active Demo Scenario Indicator */}
      {scenarioTitle && (
        <TouchableOpacity
          style={styles.scenarioBar}
          onPress={onSwitchScenario}
          activeOpacity={0.8}
        >
          <Ionicons name="sparkles" size={14} color={Colors.primary} />
          <Text style={styles.scenarioText} numberOfLines={1}>
            {scenarioTitle}
          </Text>
          <Ionicons name="swap-horizontal" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Main Mic Dock Row */}
      <View style={styles.dockCard}>
        {/* Status Prompt */}
        <View style={styles.textContainer}>
          <Text style={styles.primaryPrompt}>
            {state === 'idle' && (language === 'hi' ? 'बोलने के लिए माइक दबाएं' : 'Tap mic to speak naturally')}
            {state === 'listening' && (language === 'hi' ? 'सुनीता दीदी, मैं सुन रहा हूँ...' : 'Listening in Hindi / Hinglish...')}
            {state === 'processing' && (language === 'hi' ? 'AI विश्लेषण जारी है...' : 'Needle 2 extracting data...')}
          </Text>
          <Text style={styles.subPrompt}>
            {state === 'idle' && (language === 'hi' ? '100% ऑफलाइन लोकल AI' : '100% On-Device Offline AI')}
            {state === 'listening' && (language === 'hi' ? 'रोकने के लिए दोबारा दबाएं' : 'Tap again to finalize record')}
            {state === 'processing' && (language === 'hi' ? 'प्रोटोकॉल नियमों का मिलान...' : 'Validating screening protocol...')}
          </Text>
        </View>

        {/* Central 64dp Tactile Button */}
        <View style={styles.micButtonWrapper}>
          {state === 'listening' && (
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: pulseAnim }] }
              ]}
            />
          )}

          <TouchableOpacity
            style={[
              styles.micButton,
              state === 'idle' && styles.micIdle,
              state === 'listening' && styles.micListening,
              state === 'processing' && styles.micProcessing,
            ]}
            onPress={onPressMic}
            disabled={state === 'processing'}
            activeOpacity={0.85}
            accessibilityLabel="Voice Recording Action"
          >
            {state === 'processing' ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Ionicons
                name={state === 'listening' ? 'stop' : 'mic'}
                size={30}
                color={Colors.surface}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dockContainer: {
    paddingHorizontal: Spacing.sm + 4,
    paddingBottom: Spacing.sm,
    backgroundColor: 'transparent',
  },
  scenarioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceContainer,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 6,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scenarioText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primaryDark,
    flexShrink: 1,
  },
  dockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  textContainer: {
    flex: 1,
    flexShrink: 1,
    paddingRight: 8,
  },
  primaryPrompt: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subPrompt: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  micButtonWrapper: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
  },
  micButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  micIdle: {
    backgroundColor: Colors.primaryBright,
  },
  micListening: {
    backgroundColor: Colors.danger,
  },
  micProcessing: {
    backgroundColor: Colors.primaryLight,
  },
});
