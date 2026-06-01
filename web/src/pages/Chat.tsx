import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import ReactMarkdown from 'react-markdown';
import { Menu, Plus, Moon, Sun, ArrowUp, Copy, Search, Sparkles, MessageSquare, Trash2, X, LogOut } from 'lucide-react';
import './Chat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  isTyping?: boolean;
}

interface ChatHistoryItem {
  id: string;
  title: string;
  updated_at: string;
}

export default function Chat() {
  const { isDark, toggleTheme } = useTheme();
  const { logout } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadChatHistory();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChatHistory = async () => {
    setSidebarLoading(true);
    try {
      const data = await apiService.getChatHistory();
      setChatHistory(data.chats || []);
    } catch (e) {
      console.error('Failed to load history:', e);
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
      setShowSidebar(false);
    } catch (e) {
      alert('Failed to load chat');
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setShowSidebar(false);
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await apiService.deleteChat(chatId);
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
      if (currentChatId === chatId) {
        startNewChat();
      }
    } catch (e) {
      alert('Failed to delete chat');
    }
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
    
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }

    try {
      const aiId = (Date.now() + 1).toString();
      
      const aiMsg: Message = {
        id: aiId,
        role: 'assistant',
        content: '',
      };

      let fullContent = '';

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
            loadChatHistory();
          }
        }
      );

    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== 'typing'));
      alert(e.message || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard');
  };

  return (
    <div className="chat-container">
      {/* Sidebar Overlay */}
      {showSidebar && (
        <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Chat History</h2>
          <button className="icon-btn" onClick={() => setShowSidebar(false)}>
            <X size={20} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={startNewChat}>
          <Plus size={18} />
          <span>New Investigation</span>
        </button>

        <div className="history-list">
          {sidebarLoading ? (
            <div className="loading-spinner">Loading...</div>
          ) : chatHistory.length === 0 ? (
            <div className="empty-history">No previous investigations</div>
          ) : (
            chatHistory.map(item => (
              <div 
                key={item.id} 
                className={`history-item ${currentChatId === item.id ? 'active' : ''}`}
                onClick={() => loadChat(item.id)}
              >
                <MessageSquare size={16} className="history-icon" />
                <span className="history-title">{item.title}</span>
                <button 
                  className="delete-chat-btn" 
                  onClick={(e) => deleteChat(item.id, e)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button className="theme-toggle" onClick={logout} style={{ marginTop: '8px', color: '#ff4444' }}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="header">
          <button className="icon-btn" onClick={() => setShowSidebar(true)}>
            <Menu size={24} />
          </button>
          <img src="/logo.png" alt="Sherlock AI" className="header-logo" />
          <button className="icon-btn" onClick={startNewChat}>
            <Plus size={22} />
          </button>
        </header>

        <div className="messages-area">
          {messages.length === 0 ? (
            <div className="empty-state">
              <img src="/logo.png" alt="Logo" className="empty-logo" />
              <p className="empty-subtitle">Your AI-powered Kerala Crime Detective</p>
              
              <div className="suggestions-grid">
                {[
                  '🔍 Analyze a chain snatching case in Kochi',
                  '📋 Generate FIR investigation steps',
                  '🕵️ Profile a cybercrime suspect',
                  '📊 Assess a financial fraud case',
                ].map((suggestion, i) => (
                  <button 
                    key={i} 
                    className="suggestion-card"
                    onClick={() => setInputText(suggestion.slice(2).trim())}
                  >
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((m) => (
                <div key={m.id} className={`message-row ${m.role}`}>
                  {m.role === 'assistant' && (
                    <div className="avatar ai-avatar">
                      {m.isTyping ? <Search size={16} /> : <Sparkles size={16} />}
                    </div>
                  )}
                  <div className={`message-bubble ${m.role}-bubble`}>
                    {m.isTyping ? (
                      <div className="typing-indicator">
                        <span></span><span></span><span></span>
                      </div>
                    ) : m.role === 'assistant' ? (
                      <div className="markdown-body">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="message-text">{m.content}</div>
                    )}
                    
                    {m.role === 'assistant' && !m.isTyping && m.content && (
                      <button className="copy-btn" onClick={() => copyToClipboard(m.content)}>
                        <Copy size={12} /> Copy
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="input-area">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = '44px';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Describe a crime to investigate..."
              rows={1}
              disabled={isLoading}
            />
            <button 
              className="send-btn" 
              disabled={!inputText.trim() || isLoading}
              onClick={sendMessage}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
