import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, Image,
  Animated, Dimensions, ActivityIndicator, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';

const { width } = Dimensions.get('window');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  isTyping?: boolean;
}

interface Chat {
  id: string;
  title: string;
  updated_at: string;
  last_message?: string;
}

export default function ChatScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<Chat[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const sidebarAnim = useRef(new Animated.Value(-300)).current;

  useEffect(() => {
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    setSidebarLoading(true);
    try {
      const data = await apiService.getChatHistory();
      setChatHistory(data.chats || []);
    } catch (e) {
      console.log('Failed to load history:', e);
    } finally {
      setSidebarLoading(false);
    }
  };

  const loadChat = async (chatId: string) => {
    try {
      const data = await apiService.getChatMessages(chatId);
      setMessages(
        (data.messages || []).map((m: any, i: number) => ({
          id: `${chatId}-${i}`,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
      );
      setCurrentChatId(chatId);
      toggleSidebar(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to load chat');
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    toggleSidebar(false);
  };

  const deleteChat = async (chatId: string) => {
    try {
      await apiService.deleteChat(chatId);
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
      if (currentChatId === chatId) {
        startNewChat();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to delete chat');
    }
  };

  const toggleSidebar = (show?: boolean) => {
    const shouldShow = show !== undefined ? show : !showSidebar;
    setShowSidebar(shouldShow);
    Animated.spring(sidebarAnim, {
      toValue: shouldShow ? 0 : -300,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();
    if (shouldShow) loadChatHistory();
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    const typingMsg: Message = {
      id: 'typing',
      role: 'assistant',
      content: '',
      isTyping: true,
    };

    setMessages(prev => [...prev, userMsg, typingMsg]);
    setInputText('');
    setIsLoading(true);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const aiId = (Date.now() + 1).toString();
      
      const aiMsg: Message = {
        id: aiId,
        role: 'assistant',
        content: '',
      };

      let fullContent = '';

      // Set initial empty message for streaming
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat(aiMsg));

      await apiService.streamMessage(
        text,
        currentChatId || undefined,
        (chunk) => {
          fullContent += chunk;
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: fullContent } : m));
        },
        (chatId) => {
          if (!currentChatId) {
            setCurrentChatId(chatId);
          }
        }
      );

    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== 'typing'));
      Alert.alert('Error', e.message || 'Failed to send message');
    } finally {
      setIsLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === 'user';

    if (item.isTyping) {
      return (
        <View style={[styles.messageRow, styles.aiMessageRow]}>
          <View style={[styles.aiAvatar, { backgroundColor: theme.primary }]}>
            <Ionicons name="search" size={16} color="#FFF" />
          </View>
          <View style={[styles.messageBubble, styles.aiBubble, { backgroundColor: theme.aiBubble }]}>
            <TypingIndicator color={theme.textSecondary} />
          </View>
        </View>
      );
    }

    if (isUser) {
      return (
        <View style={[styles.messageRow, styles.userMessageRow]}>
          <View style={[styles.messageBubble, styles.userBubble, { backgroundColor: theme.userBubble }]}>
            <Text style={[styles.messageText, { color: theme.userBubbleText }]}>{item.content}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, styles.aiMessageRow]}>
        <View style={[styles.aiAvatar, { backgroundColor: theme.primary }]}>
          <Ionicons name="sparkles" size={16} color="#FFF" />
        </View>
        <View style={styles.aiBubbleContainer}>
          <View style={[styles.messageBubble, styles.aiBubble, { backgroundColor: theme.aiBubble }]}>
            {item.content ? (
              <Markdown style={{ body: { color: theme.aiBubbleText, fontSize: 16, lineHeight: 24, paddingBottom: 10 } }}>
                {item.content}
              </Markdown>
            ) : (
              <TypingIndicator color={theme.textSecondary} />
            )}
            
            {!!item.content && (
              <TouchableOpacity 
                style={styles.copyBtn} 
                onPress={async () => {
                  await Clipboard.setStringAsync(item.content);
                  Alert.alert('Copied', 'Analysis copied to clipboard', [{text: 'OK'}], {cancelable: true});
                }}
              >
                <Ionicons name="copy-outline" size={14} color={theme.textTertiary} />
                <Text style={[styles.copyText, { color: theme.textTertiary }]}>Copy</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }, [theme]);

  const renderEmptyChat = () => (
    <View style={styles.emptyContainer}>
      <Image
        source={require('../assets/applogo.png')}
        style={styles.emptyLogo}
        resizeMode="contain"
      />
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Your AI-powered Kerala Crime Detective
      </Text>

      <View style={styles.suggestionsContainer}>
        {[
          '🔍 Analyze a chain snatching case in Kochi',
          '📋 Generate FIR investigation steps',
          '🕵️ Profile a cybercrime suspect',
          '📊 Assess a financial fraud case',
        ].map((suggestion, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.suggestionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => {
              setInputText(suggestion.slice(2).trim());
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.suggestionText, { color: theme.text }]}>{suggestion}</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.textTertiary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg, paddingTop: insets.top + 8, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => toggleSidebar()} style={styles.headerBtn}>
          <Ionicons name="menu" size={24} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Image source={require('../assets/applogo.png')} style={styles.headerLogo} resizeMode="contain" />
        </View>

        <TouchableOpacity onPress={startNewChat} style={styles.headerBtn}>
          <Ionicons name="create-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Chat Content */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        {messages.length === 0 ? (
          renderEmptyChat()
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <View style={[styles.inputWrapper, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Describe a crime to investigate..."
              placeholderTextColor={theme.textTertiary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={5000}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: inputText.trim() ? theme.primary : theme.surfaceSecondary }]}
              onPress={sendMessage}
              disabled={!inputText.trim() || isLoading}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={inputText.trim() ? '#FFF' : theme.textTertiary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Sidebar Overlay */}
      {showSidebar && (
        <TouchableOpacity
          style={[styles.overlay, { backgroundColor: theme.overlay }]}
          activeOpacity={1}
          onPress={() => toggleSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <Animated.View style={[
        styles.sidebar,
        { backgroundColor: theme.sidebar, transform: [{ translateX: sidebarAnim }], paddingTop: insets.top + 8 }
      ]}>
        <View style={styles.sidebarHeader}>
          <Text style={[styles.sidebarTitle, { color: theme.text }]}>Chat History</Text>
          <TouchableOpacity onPress={() => toggleSidebar(false)}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.newChatBtn, { backgroundColor: theme.primary }]}
          onPress={startNewChat}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.newChatText}>New Investigation</Text>
        </TouchableOpacity>

        {sidebarLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={theme.primary} />
        ) : (
          <FlatList
            data={chatHistory}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.historyItem,
                  { backgroundColor: currentChatId === item.id ? theme.sidebarActive : 'transparent' },
                ]}
                onPress={() => loadChat(item.id)}
                onLongPress={() => {
                  Alert.alert('Delete Chat', 'Delete this conversation?', [
                    { text: 'Cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteChat(item.id) },
                  ]);
                }}
              >
                <Ionicons name="chatbubble-outline" size={16} color={theme.textSecondary} />
                <Text
                  style={[styles.historyTitle, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.historyList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={[styles.emptyHistory, { color: theme.textTertiary }]}>
                No previous investigations
              </Text>
            }
          />
        )}

        {/* Theme Toggle in Sidebar */}
        <View style={[styles.sidebarFooter, { borderTopColor: theme.border }]}>
          <TouchableOpacity style={styles.themeToggleRow} onPress={toggleTheme}>
            <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={theme.text} />
            <Text style={[styles.themeToggleText, { color: theme.text }]}>
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

function TypingIndicator({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    };
    animate(dot1, 0);
    animate(dot2, 150);
    animate(dot3, 300);
  }, []);

  return (
    <View style={styles.typingContainer}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            { backgroundColor: color, opacity: dot, transform: [{ scale: Animated.add(0.5, Animated.multiply(dot, 0.5)) }] },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerBtn: { padding: 6 },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogo: { width: 120, height: 40 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  chatContainer: { flex: 1 },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageRow: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  aiMessageRow: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  messageBubble: {
    maxWidth: width * 0.75,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderBottomLeftRadius: 4,
  },
  aiBubbleContainer: {
    flexDirection: 'column',
    maxWidth: width * 0.75,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 4,
    paddingTop: 4,
  },
  copyText: {
    fontSize: 11,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  typingContainer: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inputBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 6,
    marginRight: 8,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyLogo: {
    width: 140,
    height: 140,
    marginBottom: 0,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    marginBottom: 32,
    textAlign: 'center',
  },
  suggestionsContainer: {
    width: '100%',
    gap: 10,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 300,
    zIndex: 20,
    paddingHorizontal: 16,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  newChatText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  historyList: {
    paddingBottom: 16,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 2,
  },
  historyTitle: {
    fontSize: 14,
    flex: 1,
  },
  emptyHistory: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
  sidebarFooter: {
    borderTopWidth: 0.5,
    paddingVertical: 16,
  },
  themeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  themeToggleText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
