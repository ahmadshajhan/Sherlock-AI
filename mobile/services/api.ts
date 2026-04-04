import { API } from '../constants';

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(contentType: string = 'application/json') {
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  // ─── Chat ────────────────────────────────────────────────

  async sendMessage(message: string, chatId?: string) {
    const res = await fetch(API.CHAT, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message, chat_id: chatId }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  }

  async getChatHistory() {
    const res = await fetch(API.CHAT_HISTORY, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to get chat history');
    return res.json();
  }

  async getChatMessages(chatId: string) {
    const res = await fetch(`${API.CHAT}/${chatId}`, {
      headers: this.getHeaders(),
    });
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

  async createNewChat(title?: string) {
    const res = await fetch(API.CHAT_NEW, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to create chat');
    return res.json();
  }

  // ─── Detection ───────────────────────────────────────────

  async detectCrime(text: string, chatId?: string) {
    const res = await fetch(API.DETECT, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ text, chat_id: chatId }),
    });
    if (!res.ok) throw new Error('Detection failed');
    return res.json();
  }

  // ─── Voice ───────────────────────────────────────────────

  async textToSpeech(text: string): Promise<ArrayBuffer> {
    const res = await fetch(API.TTS, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('TTS failed');
    return res.arrayBuffer();
  }

  async speechToText(audioUri: string) {
    const formData = new FormData();
    formData.append('audio', {
      uri: audioUri,
      type: 'audio/wav',
      name: 'recording.wav',
    } as any);

    const res = await fetch(API.STT, {
      method: 'POST',
      headers: {
        ...this.getHeaders(''),
      },
      body: formData,
    });
    if (!res.ok) throw new Error('STT failed');
    return res.json();
  }

  async liveVoiceChat(audioUri: string, chatId?: string) {
    const formData = new FormData();
    formData.append('audio', {
      uri: audioUri,
      type: 'audio/wav',
      name: 'recording.wav',
    } as any);
    if (chatId) formData.append('chat_id', chatId);

    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(API.LIVE_VOICE, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error('Live voice chat failed');
    return res.json();
  }

  // Stream message utilizing native XMLHttpRequest
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

      if (this.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      }

      let processedLength = 0;

      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
          const newData = xhr.responseText.substring(processedLength);
          if (newData) {
            processedLength = xhr.responseText.length;
            
            // Parse SSE strings
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

  // ─── Documents ───────────────────────────────────────────

  async uploadDocument(fileUri: string, fileName: string, mimeType: string) {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: mimeType,
      name: fileName,
    } as any);

    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(API.DOCUMENT_UPLOAD, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error('Document upload failed');
    return res.json();
  }

  async getDocuments() {
    const res = await fetch(API.DOCUMENTS, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to get documents');
    return res.json();
  }

  // ─── Health ──────────────────────────────────────────────

  async healthCheck() {
    const res = await fetch(API.HEALTH);
    return res.json();
  }
}

export const apiService = new ApiService();
