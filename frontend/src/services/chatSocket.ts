import type { ChatMessage, Attachment, SessionInfo } from '../types/chat';
import { get, post } from './api';

export type ChatEventHandler = (event: {
  type: string;
  textDelta?: string;
  turnId?: string;
  message?: ChatMessage;
  salesAction?: any;
  error?: string;
  rawEvent?: any;
}) => void;

export class ChatSocketManager {
  private socket: WebSocket | null = null;
  private sessionId: string | null = null;
  private isVisitor: boolean = false;
  private serverReady = false;
  private listeners: Set<ChatEventHandler> = new Set();

  constructor() {}

  public subscribe(handler: ChatEventHandler) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private notify(event: any) {
    this.listeners.forEach(fn => fn(event));
  }

  public async connect(sessionId?: string, isVisitor: boolean = false): Promise<void> {
    const validSessionId = sessionId || null;
    if (this.serverReady && this.socket?.readyState === WebSocket.OPEN && this.sessionId === validSessionId && this.isVisitor === isVisitor) return;
    this.disconnect();
    this.sessionId = validSessionId;
    this.isVisitor = isVisitor;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const browserParams = new URLSearchParams(window.location.search);
    const pendingTicket = browserParams.get('ws_ticket');
    const ticketSession = browserParams.get('chat_session_id');
    const params = new URLSearchParams();
    if (validSessionId) params.set('session_id', validSessionId);
    if (isVisitor) params.set('visitor', 'true');
    if (pendingTicket && ticketSession === validSessionId) params.set('ws_ticket', pendingTicket);
    const qs = params.size ? `?${params.toString()}` : '';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat${qs}`);
      if (pendingTicket && ticketSession === validSessionId) {
        browserParams.delete('ws_ticket');
        browserParams.delete('chat_session_id');
        const clean = `${window.location.pathname}${browserParams.size ? `?${browserParams.toString()}` : ''}${window.location.hash}`;
        window.history.replaceState({}, document.title, clean);
      }
      this.socket = ws;
      const timeout = window.setTimeout(() => {
        reject(new Error('Chat connection timed out.'));
        ws.close();
      }, 15000);
      ws.onmessage = event => {
        if (this.socket !== ws) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connection_ready') {
            window.clearTimeout(timeout);
            resolve();
          }
          this.handleMessage(data);
        } catch {
          this.notify({ type: 'error', error: 'The chat response could not be read. Please reconnect.' });
        }
      };
      ws.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Chat connection failed.'));
      };
      ws.onclose = () => {
        window.clearTimeout(timeout);
        reject(new Error('Chat connection closed.'));
        // A replaced socket must never clear or publish events into the new connection.
        if (this.socket !== ws) return;
        this.socket = null;
        this.serverReady = false;
        this.notify({ type: 'disconnected' });
      };
    });
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'connection_ready':
        this.serverReady = true;
        this.sessionId = data.session_id;
        this.notify({ type: 'ready', rawEvent: data });
        break;

      case 'turn_start':
        this.notify({ type: 'turn_start', turnId: data.turn_id, rawEvent: data });
        break;

      case 'text_delta':
        this.notify({ type: 'text_delta', textDelta: data.text, rawEvent: data });
        break;

      case 'text_replace':
        this.notify({ type: 'text_replace', textDelta: data.text, rawEvent: data });
        break;

      case 'sales_action':
        this.notify({ type: 'sales_action', salesAction: data, rawEvent: data });
        break;

      case 'intent_bound':
      case 'skill_loaded':
      case 'tool_call':
      case 'tool_result':
      case 'presentation':
      case 'turn_complete':
      case 'message_saved':
      case 'cancelled':
      case 'cleared':
        this.notify({ type: data.type, turnId: data.turn_id, rawEvent: data });
        break;

      case 'error':
        this.notify({ type: 'error', error: data.message || 'An error occurred', rawEvent: data });
        break;
    }
  }

  public sendPrompt(prompt: string, attachments: Attachment[] = [], workflowId?: string, language = 'en') {
    if (!this.serverReady || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Chat connection is not open.');
    }

    const payload: any = {
      type: 'prompt',
      prompt,
      language,
    };

    if (attachments.length > 0) {
      payload.attachments = attachments;
    }

    if (workflowId) {
      payload.workflow_id = workflowId;
    }

    this.socket.send(JSON.stringify(payload));
  }

  public disconnect() {
    this.serverReady = false;
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close();
    }
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }
}

export const chatSocket = new ChatSocketManager();

export async function listSessions(): Promise<{ sessions: SessionInfo[] }> {
  const res = await get<any>('/api/sessions');
  if (Array.isArray(res)) return { sessions: res };
  return { sessions: res?.sessions || [] };
}

export async function createSession(title: string = 'New Conversation', messages?: any[]): Promise<SessionInfo> {
  return post('/api/sessions', { title, messages });
}

export async function loadSessionHistory(sessionId: string): Promise<any> {
  return get(`/api/sessions/${encodeURIComponent(sessionId)}`);
}
