import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { API, GOOGLE_ANDROID_CLIENT_ID } from '../constants';

// Required for expo-auth-session
WebBrowser.maybeCompleteAuthSession();

interface User {
  id: string;
  email: string;
  full_name: string;
  username?: string;
  avatar_url?: string;
  role: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  googleSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = '@sherlock_ai_token';
const REFRESH_TOKEN_KEY = '@sherlock_ai_refresh_token';
const USER_KEY = '@sherlock_ai_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Google OAuth configuration removed for direct linking
  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [storedToken, storedRefresh, storedUser] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(REFRESH_TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setRefreshToken(storedRefresh);
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.log('Failed to load auth:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAuth = async (accessToken: string, refresh: string, userData: User) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, accessToken),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, refresh),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(userData)),
    ]);
    setToken(accessToken);
    setRefreshToken(refresh);
    setUser(userData);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch(API.LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Login failed');
    }

    const data = await res.json();
    await saveAuth(data.access_token, data.refresh_token, data.user);
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await fetch(API.REGISTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Registration failed');
    }

    const data = await res.json();
    await saveAuth(data.access_token, data.refresh_token, data.user);
  };

  const googleSignIn = async () => {
    try {
      setIsLoading(true);
      const redirectUrl = Linking.createURL('/auth');
      const authUrl = `${API.GOOGLE_AUTH}?redirect_scheme=${encodeURIComponent(redirectUrl)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      if (result.type === 'success' && result.url) {
        // Extract query params from redirect url
        const queryString = result.url.split('?')[1] || '';
        const params = new URLSearchParams(queryString);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          // Fetch user details with the token
          const res = await fetch(API.ME, {
            headers: { 'Authorization': `Bearer ${access_token}` }
          });
          if (!res.ok) throw new Error('Failed to fetch user data');
          const user = await res.json();
          await saveAuth(access_token, refresh_token, user);
        }
      }
    } catch (e: any) {
      console.error('Google sign-in error:', e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  const refreshAuth = async () => {
    if (!refreshToken) return;

    try {
      const res = await fetch(API.REFRESH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (res.ok) {
        const data = await res.json();
        await saveAuth(data.access_token, data.refresh_token, data.user);
      } else {
        await logout();
      }
    } catch (e) {
      console.log('Refresh failed:', e);
    }
  };

  const isAuthenticated = !!token && !!user;

  const value = useMemo(
    () => ({ user, token, refreshToken, isLoading, isAuthenticated, login, register, googleSignIn, logout, refreshAuth }),
    [user, token, refreshToken, isLoading, isAuthenticated]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
