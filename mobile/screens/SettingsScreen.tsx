import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, Alert, Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export default function SettingsScreen() {
  const { theme, isDark, themeMode, setThemeMode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const themeOptions: { label: string; value: 'light' | 'dark' | 'system'; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'Light', value: 'light', icon: 'sunny' },
    { label: 'Dark', value: 'dark', icon: 'moon' },
    { label: 'System', value: 'system', icon: 'phone-portrait' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Settings</Text>
        </View>

        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.avatarContainer, { backgroundColor: theme.primary }]}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarText}>
                {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.text }]}>{user?.full_name}</Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>{user?.email}</Text>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: theme.primary + '15' }]}>
            <Text style={[styles.roleText, { color: theme.primary }]}>
              {user?.role?.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>APPEARANCE</Text>
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.themeRow}>
              {themeOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.themeOption,
                    { backgroundColor: themeMode === option.value ? theme.primary : theme.surfaceSecondary },
                  ]}
                  onPress={() => setThemeMode(option.value)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={themeMode === option.value ? '#FFF' : theme.textSecondary}
                  />
                  <Text style={[
                    styles.themeOptionText,
                    { color: themeMode === option.value ? '#FFF' : theme.textSecondary },
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ABOUT</Text>
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SettingRow
              icon="information-circle"
              label="Version"
              value="1.0.0"
              theme={theme}
            />
            <SettingRow
              icon="code-slash"
              label="Backend"
              value="FastAPI + MongoDB"
              theme={theme}
            />
            <SettingRow
              icon="hardware-chip"
              label="AI Model"
              value="Kerala Crime Detective"
              theme={theme}
            />
            <SettingRow
              icon="volume-high"
              label="Voice"
              value="ElevenLabs TTS"
              theme={theme}
              last
            />
          </View>
        </View>

        {/* API Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>SERVER</Text>
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SettingRow
              icon="server"
              label="API Server"
              value="187.127.133.27"
              theme={theme}
            />
            <SettingRow
              icon="wifi"
              label="Status"
              value="Connected"
              valueColor={theme.success}
              theme={theme}
              last
            />
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: theme.error }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>Logout</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Image
            source={require('../assets/applogo.png')}
            style={styles.footerLogo}
            resizeMode="contain"
          />
          <Text style={[styles.footerText, { color: theme.textTertiary }]}>
            Sherlock AI v1.0.0
          </Text>
          <Text style={[styles.footerDisclaimer, { color: theme.textTertiary }]}>
            AI-generated content is for investigative support only.
            Always follow proper legal procedures.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingRow({ icon, label, value, valueColor, theme, last }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  theme: any;
  last?: boolean;
}) {
  return (
    <View style={[styles.settingRow, !last && { borderBottomWidth: 0.5, borderBottomColor: theme.border }]}>
      <Ionicons name={icon} size={18} color={theme.textSecondary} />
      <Text style={[styles.settingLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.settingValue, { color: valueColor || theme.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  headerSection: { marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: '800' },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    gap: 14,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700' },
  profileEmail: { fontSize: 13, marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: { fontSize: 11, fontWeight: '700' },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  themeRow: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 15,
  },
  settingValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
    marginBottom: 32,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: 6,
  },
  footerLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginBottom: 4,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerDisclaimer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
});
