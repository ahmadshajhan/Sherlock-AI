const API_BASE_URL = 'http://187.127.133.27.nip.io:8000';

export const API = {
  BASE_URL: API_BASE_URL,

  // Auth
  REGISTER: `${API_BASE_URL}/auth/register`,
  LOGIN: `${API_BASE_URL}/auth/login`,
  REFRESH: `${API_BASE_URL}/auth/refresh`,
  GOOGLE_AUTH: `${API_BASE_URL}/auth/google`,
  GOOGLE_AUTH_MOBILE: `${API_BASE_URL}/auth/google/mobile`,
  ME: `${API_BASE_URL}/auth/me`,

  // Chat
  CHAT: `${API_BASE_URL}/chat`,
  CHAT_NEW: `${API_BASE_URL}/chat/new`,
  CHAT_HISTORY: `${API_BASE_URL}/chat/history`,

  // Crime Detection
  DETECT: `${API_BASE_URL}/detect`,

  // Voice
  TTS: `${API_BASE_URL}/tts`,
  TTS_STREAM: `${API_BASE_URL}/tts/stream`,
  STT: `${API_BASE_URL}/voice`,
  LIVE_VOICE: `${API_BASE_URL}/voice/live`,
  VOICES: `${API_BASE_URL}/voices`,

  // Documents
  DOCUMENT_UPLOAD: `${API_BASE_URL}/document`,
  DOCUMENTS: `${API_BASE_URL}/documents`,

  // System
  HEALTH: `${API_BASE_URL}/health`,
};

// Google OAuth
export const GOOGLE_ANDROID_CLIENT_ID = '173709998730-fdnsjq0dgbrrv5k8rc33tsj8e54lgco3.apps.googleusercontent.com';

// Theme Colors
export const Colors = {
  light: {
    primary: '#D97757', // Claude accent orange
    primaryGradientStart: '#D97757',
    primaryGradientEnd: '#C56A4A',
    background: '#FFFFFF',
    surface: '#FDFCF9', // Claude creamy background
    surfaceSecondary: '#F3F2EE',
    text: '#222222',
    textSecondary: '#666666',
    textTertiary: '#999999',
    border: '#E8E6E1',
    borderLight: '#F3F2EE',
    userBubble: '#F3F2EE',
    userBubbleText: '#222222',
    aiBubble: 'transparent',
    aiBubbleText: '#222222',
    inputBg: '#FFFFFF',
    inputBorder: '#E8E6E1',
    sidebar: '#FDFCF9',
    sidebarActive: '#F3F2EE',
    accent: '#D97757',
    success: '#3A8A61',
    warning: '#D9A05B',
    error: '#D94D4A',
    shadow: 'rgba(0, 0, 0, 0.05)',
    overlay: 'rgba(0, 0, 0, 0.2)',
    card: '#FFFFFF',
    headerBg: '#FFFFFF',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E8E6E1',
    iconDefault: '#999999',
    iconActive: '#222222',
    skeleton: '#E8E6E1',
  },
  dark: {
    primary: '#D97757',
    primaryGradientStart: '#D97757',
    primaryGradientEnd: '#E68969',
    background: '#1A1A1A',
    surface: '#222222',
    surfaceSecondary: '#2D2D2D',
    text: '#EFEFEF',
    textSecondary: '#999999',
    textTertiary: '#666666',
    border: '#333333',
    borderLight: '#2D2D2D',
    userBubble: '#2D2D2D',
    userBubbleText: '#EFEFEF',
    aiBubble: 'transparent',
    aiBubbleText: '#EFEFEF',
    inputBg: '#222222',
    inputBorder: '#333333',
    sidebar: '#1A1A1A',
    sidebarActive: '#2D2D2D',
    accent: '#D97757',
    success: '#3A8A61',
    warning: '#D9A05B',
    error: '#D94D4A',
    shadow: 'rgba(0, 0, 0, 0.4)',
    overlay: 'rgba(0, 0, 0, 0.7)',
    card: '#222222',
    headerBg: '#1A1A1A',
    tabBar: '#1A1A1A',
    tabBarBorder: '#333333',
    iconDefault: '#666666',
    iconActive: '#EFEFEF',
    skeleton: '#333333',
  },
};

export type ThemeColors = typeof Colors.light;
