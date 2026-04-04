import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image, Animated, Dimensions,
  ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const { width, height } = Dimensions.get('window');

export default function AuthScreen() {
  const { theme, isDark } = useTheme();
  const { login, register, googleSignIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!isLogin && !fullName) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await googleSignIn();
    } catch (e: any) {
      Alert.alert('Google Sign-In', e.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo & Branding */}
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
          <Image
            source={require('../assets/applogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.brandingContainer, { opacity: fadeAnim }]}>
          <Text style={[styles.appName, { color: theme.text }]}>Sherlock AI</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>
            Kerala Crime Detective AI Assistant
          </Text>
        </Animated.View>

        {/* Form */}
        <Animated.View style={[
          styles.formContainer,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Tab Switcher */}
            <View style={[styles.tabSwitcher, { backgroundColor: theme.surfaceSecondary }]}>
              <TouchableOpacity
                style={[styles.switchTab, isLogin && { backgroundColor: theme.primary }]}
                onPress={() => setIsLogin(true)}
              >
                <Text style={[styles.switchTabText, { color: isLogin ? '#FFF' : theme.textSecondary }]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.switchTab, !isLogin && { backgroundColor: theme.primary }]}
                onPress={() => setIsLogin(false)}
              >
                <Text style={[styles.switchTabText, { color: !isLogin ? '#FFF' : theme.textSecondary }]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Full Name (Register only) */}
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Full Name</Text>
                <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                  <Ionicons name="person-outline" size={18} color={theme.textTertiary} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Enter your full name"
                    placeholderTextColor={theme.textTertiary}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Email</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                <Ionicons name="mail-outline" size={18} color={theme.textTertiary} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Enter your email"
                  placeholderTextColor={theme.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Password</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Enter your password"
                  placeholderTextColor={theme.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={theme.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.primary }, loading && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.submitText}>
                  {isLogin ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textTertiary }]}>or</Text>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>

            {/* Google Sign In */}
            <TouchableOpacity
              style={[
                styles.googleButton,
                { borderColor: theme.border },
                googleLoading && styles.submitDisabled
              ]}
              activeOpacity={0.7}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#DB4437" />
                  <Text style={[styles.googleText, { color: theme.text }]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Footer */}
        <Text style={[styles.footer, { color: theme.textTertiary }]}>
          By continuing, you agree to our Terms of Service
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: { marginBottom: 12 },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 30,
  },
  brandingContainer: { alignItems: 'center', marginBottom: 32 },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: 14,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  formContainer: { width: '100%', maxWidth: 400 },
  formCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  tabSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 24,
  },
  switchTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  switchTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  submitButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: { flex: 1, height: 1 },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    fontWeight: '500',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 10,
  },
  googleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    marginTop: 24,
    fontSize: 12,
    textAlign: 'center',
  },
});
