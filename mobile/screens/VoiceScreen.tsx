import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme } from '../contexts/ThemeContext';
import { apiService } from '../services/api';

const { width } = Dimensions.get('window');

type VoiceState = 'idle' | 'recording' | 'processing' | 'playing';

export default function VoiceScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnims = useRef([...Array(5)].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
      if (recording) recording.stopAndUnloadAsync();
    };
  }, []);

  useEffect(() => {
    if (state === 'recording') {
      startPulse();
      startWaveAnimation();
    } else if (state === 'processing') {
      startPulse();
    } else {
      pulseAnim.setValue(1);
      waveAnims.forEach(a => a.setValue(0.3));
    }
  }, [state]);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  };

  const startWaveAnimation = () => {
    waveAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 100),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    });
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission', 'Microphone permission is required');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setState('recording');
    } catch (e) {
      console.error('Recording error:', e);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setState('processing');
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) throw new Error('No audio URI');

      // Send to live voice chat
      const data = await apiService.liveVoiceChat(uri);

      setTranscript(data.text_input || '');
      setAiResponse(data.ai_response || '');

      // Play TTS audio if available
      if (data.audio_base64) {
        setState('playing');
        await playAudioBase64(data.audio_base64);
      }

      setState('idle');
    } catch (e: any) {
      console.error('Voice processing error:', e);
      setState('idle');
      Alert.alert('Error', e.message || 'Voice processing failed');
    }
  };

  const playAudioBase64 = async (base64: string) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${base64}` },
        { shouldPlay: true }
      );
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setState('idle');
          newSound.unloadAsync();
        }
      });
    } catch (e) {
      console.log('Audio playback error:', e);
      setState('idle');
    }
  };

  const handleMicPress = () => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'idle') {
      startRecording();
    }
  };

  const getStateMessage = () => {
    switch (state) {
      case 'idle': return 'Tap to speak';
      case 'recording': return 'Listening...';
      case 'processing': return 'Analyzing...';
      case 'playing': return 'Sherlock is speaking...';
    }
  };

  const getStateColor = () => {
    switch (state) {
      case 'idle': return theme.primary;
      case 'recording': return theme.error;
      case 'processing': return theme.warning;
      case 'playing': return theme.success;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Voice Chat</Text>
        <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
          Speech-to-Speech Investigation
        </Text>
      </View>

      {/* Visualization */}
      <View style={styles.vizContainer}>
        {/* Wave Animation */}
        <View style={styles.waveContainer}>
          {waveAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.wavebar,
                {
                  backgroundColor: getStateColor(),
                  transform: [{ scaleY: anim }],
                  opacity: anim,
                },
              ]}
            />
          ))}
        </View>

        {/* Mic Button */}
        <Animated.View style={[styles.micOuter, { transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.micRing, { borderColor: getStateColor() + '30' }]}>
            <TouchableOpacity
              style={[styles.micButton, { backgroundColor: getStateColor() }]}
              onPress={handleMicPress}
              disabled={state === 'processing' || state === 'playing'}
              activeOpacity={0.8}
            >
              <Ionicons
                name={state === 'recording' ? 'stop' : state === 'playing' ? 'volume-high' : 'mic'}
                size={36}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Text style={[styles.stateText, { color: getStateColor() }]}>
          {getStateMessage()}
        </Text>
      </View>

      {/* Results */}
      {(transcript || aiResponse) && (
        <View style={styles.resultsContainer}>
          {transcript ? (
            <View style={[styles.resultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.resultHeader}>
                <Ionicons name="person" size={16} color={theme.primary} />
                <Text style={[styles.resultLabel, { color: theme.primary }]}>You said</Text>
              </View>
              <Text style={[styles.resultText, { color: theme.text }]}>{transcript}</Text>
            </View>
          ) : null}

          {aiResponse ? (
            <View style={[styles.resultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.resultHeader}>
                <Ionicons name="search" size={16} color={theme.success} />
                <Text style={[styles.resultLabel, { color: theme.success }]}>Sherlock AI</Text>
              </View>
              <Text style={[styles.resultText, { color: theme.text }]} numberOfLines={8}>
                {aiResponse}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 2 },
  vizContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 60,
    marginBottom: 40,
  },
  wavebar: {
    width: 6,
    height: 60,
    borderRadius: 3,
  },
  micOuter: {
    marginBottom: 20,
  },
  micRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  stateText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  resultsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  resultText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
