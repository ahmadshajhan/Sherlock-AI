import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions, Keyboard, Platform } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Screens
import AuthScreen from '../screens/AuthScreen';
import ChatScreen from '../screens/ChatScreen';
import VoiceScreen from '../screens/VoiceScreen';
import DocumentScreen from '../screens/DocumentScreen';
import SettingsScreen from '../screens/SettingsScreen';

const { width } = Dimensions.get('window');

type TabKey = 'chat' | 'voice' | 'documents' | 'settings';

const tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'chat', label: 'Chat', icon: 'chatbubble-outline', activeIcon: 'chatbubble' },
  { key: 'voice', label: 'Voice', icon: 'mic-outline', activeIcon: 'mic' },
  { key: 'documents', label: 'Files', icon: 'document-outline', activeIcon: 'document' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export function NavigationContainer() {
  const { isAuthenticated, isLoading } = useAuth();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState<TabKey>('chat');
  const [isKeyboardVisible, setKeyboardVisible] = React.useState(false);

  React.useEffect(() => {
    const showEvent = Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow';
    const hideEvent = Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide';

    const keyboardDidShowListener = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const keyboardDidHideListener = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <Image
          source={require('../assets/applogo.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />
        <Text style={[styles.loadingText, { color: theme.primary }]}>Sherlock AI</Text>
        <View style={styles.loadingDots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { backgroundColor: theme.primary, opacity: 0.3 + i * 0.3 }]} />
          ))}
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'chat': return <ChatScreen />;
      case 'voice': return <VoiceScreen />;
      case 'documents': return <DocumentScreen />;
      case 'settings': return <SettingsScreen />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>

      {/* Tab Bar */}
      <View 
        style={[styles.tabBar, { 
          backgroundColor: theme.tabBar, 
          borderTopColor: theme.tabBarBorder, 
          paddingBottom: Math.max(insets.bottom, 10),
        }]}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconContainer, isActive && { backgroundColor: theme.primary + '15' }]}>
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={22}
                  color={isActive ? theme.iconActive : theme.iconDefault}
                />
              </View>
              <Text style={[
                styles.tabLabel,
                { color: isActive ? theme.iconActive : theme.iconDefault },
                isActive && styles.tabLabelActive,
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenContainer: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    width: 140,
    height: 140,
    borderRadius: 35,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 20,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  tabLabelActive: {
    fontWeight: '600',
  },
});
