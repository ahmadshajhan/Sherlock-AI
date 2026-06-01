const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const API = {
  BASE_URL: API_BASE_URL,
  REGISTER: `${API_BASE_URL}/auth/register`,
  LOGIN: `${API_BASE_URL}/auth/login`,
  REFRESH: `${API_BASE_URL}/auth/refresh`,
  GOOGLE_AUTH: `${API_BASE_URL}/auth/google`,
  ME: `${API_BASE_URL}/auth/me`,
  CHAT: `${API_BASE_URL}/chat`,
  CHAT_NEW: `${API_BASE_URL}/chat/new`,
  CHAT_HISTORY: `${API_BASE_URL}/chat/history`,
  DETECT: `${API_BASE_URL}/detect`,
  TTS: `${API_BASE_URL}/tts`,
  STT: `${API_BASE_URL}/voice`,
  LIVE_VOICE: `${API_BASE_URL}/voice/live`,
  DOCUMENT_UPLOAD: `${API_BASE_URL}/document`,
  DOCUMENTS: `${API_BASE_URL}/documents`,
  HEALTH: `${API_BASE_URL}/health`,
};

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private getHeaders(contentType: string = 'application/json') {
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async getChatHistory() {
    const res = await fetch(API.CHAT_HISTORY, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to get chat history');
    return res.json();
  }

  async getChatMessages(chatId: string) {
    const res = await fetch(`${API.CHAT}/${chatId}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to get chat messages');
    return res.json();
  }

  async deleteChat(chatId: string) {
    const res = await fetch(`${API.CHAT}/${chatId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete chat');
    return res.json();
  }

  async streamMessage(
    text: string,
    chatId: string | undefined,
    onChunk: (text: string) => void,
    onChatIdRecevied: (chatId: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API.BASE_URL}/chat/stream`);
      xhr.setRequestHeader('Content-Type', 'application/json');

      const token = this.getToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      let processedLength = 0;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
          const newData = xhr.responseText.substring(processedLength);
          if (newData) {
            processedLength = xhr.responseText.length;
            
            const lines = newData.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.substring(6).trim();
                if (dataStr === '[DONE]') continue;
                
                try {
                  const data = JSON.parse(dataStr);
                  if (data.chat_id) {
                    onChatIdRecevied(data.chat_id);
                  }
                  if (data.text) {
                    onChunk(data.text);
                  }
                  if (data.error) {
                    reject(new Error(data.error));
                  }
                } catch (e) {
                  // Incomplete chunks, ignore
                }
              }
            }
          }
        }

        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Stream failed: ${xhr.statusText}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during stream'));
      xhr.send(JSON.stringify({ message: text, chat_id: chatId }));
    });
  }

  async healthCheck() {
    const res = await fetch(API.HEALTH);
    return res.json();
  }
}

export const apiService = new ApiService();
