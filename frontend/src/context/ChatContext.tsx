import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage, Attachment, SessionInfo, ExecutionStep } from '../types/chat';
import { chatSocket, listSessions, createSession, loadSessionHistory } from '../services/chatSocket';
import { useAuth } from './AuthContext';
import { useI18n, translate } from '../i18n';
import { formatMoney } from '../components/common/Formatters';

interface ChatContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  messages: ChatMessage[];
  sessions: SessionInfo[];
  currentSessionId: string | null;
  sessionInfo: SessionInfo | null;
  isConnected: boolean;
  isStreaming: boolean;
  attachments: Attachment[];
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  sendMessage: (text: string, workflowId?: string, spoken?: boolean) => Promise<boolean>;
  recordPaymentSuccess: (receipt: any) => void;
  reconnect: () => void;
  startNewSession: () => Promise<void>;
  clearSession: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// A visitor's chat (and Mitra's memory of it) survives a refresh for 24 hours on this device.
const VISITOR_CHAT_KEY = 'kosh.visitorChat';
const VISITOR_CHAT_TTL_MS = 24 * 60 * 60 * 1000;
const readVisitorChat = (): string | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(VISITOR_CHAT_KEY) || 'null');
    return saved && Date.now() - saved.savedAt < VISITOR_CHAT_TTL_MS ? saved.id : null;
  } catch { return null; }
};
const saveVisitorChat = (id: string) => { try { localStorage.setItem(VISITOR_CHAT_KEY, JSON.stringify({ id, savedAt: Date.now() })); } catch { /* private mode */ } };
const forgetVisitorChat = () => { try { localStorage.removeItem(VISITOR_CHAT_KEY); } catch { /* private mode */ } };
const fromStoredMessage = (m: any, index?: number): ChatMessage => {
  const presObj = m.presentation || (m.presentations && m.presentations.length > 0 ? m.presentations[m.presentations.length - 1] : undefined);
  return {
    id: Math.random().toString(), role: m.role, text: m.text || '', attachments: m.attachments,
    presentation: presObj, toolResult: m.toolResult || presObj, salesAction: m.salesAction,
    steps: m.steps, duration_ms: m.duration_ms, timestamp: (m.timestamp || 0) * 1000 || Date.now(),
    storedIndex: m.role === 'assistant' ? index : undefined,
  };
};

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <ChatStateProvider>{children}</ChatStateProvider>;
};

const ChatStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { auth, isLoading, requiresConsent } = useAuth();
  const { lang } = useI18n();
  const isCustomer = auth?.user?.role === 'CUSTOMER';
  const [sessionsLoaded, setSessionsLoaded] = useState(!isCustomer);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const sending = useRef(false);
  const historyRequest = useRef(0);
  const reconnect = () => setConnectionAttempt(value => value + 1);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const prevIsCustomerRef = useRef<boolean>(isCustomer);
  const prevUserIdRef = useRef<string | undefined>(auth?.user?.id);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  useEffect(() => () => chatSocket.disconnect(), []);

  // Handle user authentication transitions and session loading
  useEffect(() => {
    let cancelled = false;

    // Detect logout: customer -> visitor
    if (prevIsCustomerRef.current && !isCustomer) {
      prevIsCustomerRef.current = isCustomer;
      prevUserIdRef.current = undefined;
      chatSocket.disconnect();
      setMessages([]);
      setSessions([]);
      setCurrentSessionId(null);
      setIsOpen(false);
      setSessionsLoaded(true);
      return;
    }

    const wasVisitor = !prevIsCustomerRef.current;
    prevIsCustomerRef.current = isCustomer;
    prevUserIdRef.current = auth?.user?.id;

    if (isCustomer) {
      const currentMsgs = messagesRef.current;
      const hasVisitorConversation = wasVisitor && currentMsgs.some(m => m.role === 'user');

      if (hasVisitorConversation) {
        // Visitor chatted before logging in: migrate this conversation into customer session
        const firstUserMsg = currentMsgs.find(m => m.role === 'user');
        const title = firstUserMsg
          ? firstUserMsg.text.slice(0, 35) + (firstUserMsg.text.length > 35 ? '…' : '')
          : 'Active Conversation';

        const messagesToMigrate = currentMsgs.map(m => ({
          role: m.role,
          text: m.text,
          presentation: m.presentation,
          toolResult: m.toolResult,
          salesAction: m.salesAction,
          timestamp: m.timestamp / 1000,
        }));

        createSession(title, messagesToMigrate)
          .then(newSess => {
            if (cancelled) return;
            forgetVisitorChat();
            const firstName = auth?.user?.display_name?.split(' ')[0] || auth?.user?.username || 'there';
            const continuationMsg: ChatMessage = {
              id: Math.random().toString(),
              role: 'assistant',
              text: `Welcome back, ${firstName}! You are now securely signed in. Would you like me to proceed with your request, or assist with anything else?`,
              timestamp: Date.now(),
            };
            setMessages(prev => [...prev, continuationMsg]);
            setCurrentSessionId(newSess.id);
            setIsOpen(true);
            return listSessions().then(data => {
              if (cancelled) return;
              const allSessions = data.sessions || [];
              if (!allSessions.some(s => s.id === newSess.id)) {
                setSessions([newSess, ...allSessions]);
              } else {
                setSessions(allSessions);
              }
            });
          })
          .catch(err => {
            console.warn('Failed to migrate visitor session', err);
            listSessions().then(data => {
              if (cancelled) return;
              setSessions(data.sessions || []);
              if (data.sessions && data.sessions.length > 0) {
                setCurrentSessionId(data.sessions[0].id);
              }
            });
          })
          .finally(() => {
            if (!cancelled) setSessionsLoaded(true);
          });
      } else {
        // Standard session loading
        listSessions()
          .then(data => {
            if (cancelled) return;
            const userSessions = data.sessions || [];
            setSessions(userSessions);
            if (userSessions.length > 0) {
              const firstSessionId = userSessions[0].id;
              setCurrentSessionId(firstSessionId);
              return loadSessionHistory(firstSessionId).then(history => {
                if (!cancelled && history && history.messages) {
                  setMessages(
                    history.messages.map((m: any) => {
                      const presObj = m.presentation || (m.presentations && m.presentations.length > 0 ? m.presentations[m.presentations.length - 1] : undefined);
                      return {
                        id: Math.random().toString(),
                        role: m.role,
                        text: m.text || '',
                        attachments: m.attachments,
                        presentation: presObj,
                        toolResult: m.toolResult || presObj,
                        salesAction: m.salesAction,
                        steps: m.steps,
                        duration_ms: m.duration_ms,
                        timestamp: (m.timestamp || 0) * 1000 || Date.now(),
                      };
                    })
                  );
                }
              }).catch(console.warn);
            } else {
              setCurrentSessionId(null);
            }
          })
          .catch(console.warn)
          .finally(() => {
            if (!cancelled) setSessionsLoaded(true);
          });
      }
    } else {
      setCurrentSessionId(readVisitorChat());
      setSessionsLoaded(true);
    }

    return () => {
      cancelled = true;
    };
  }, [isCustomer, auth?.user?.id]);


  // Connect socket when session changes or when opened
  useEffect(() => {
    if (isLoading || requiresConsent || !sessionsLoaded) return;
    let active = true;
    setIsConnected(false);
    const isVisitor = !isCustomer;
    const effectiveSessionId = currentSessionId || undefined;

    chatSocket.connect(effectiveSessionId, isVisitor)
      .then(() => { if (active) setIsConnected(true); })
      .catch((err) => {
        if (active) {
          console.warn('WS connect error', err);
          setIsConnected(false);
        }
      });

    const unsubscribe = chatSocket.subscribe(event => {
      if (event.type === 'ready') {
        setIsConnected(true);
        if (!currentSessionId && event.rawEvent?.session_id) {
          setCurrentSessionId(event.rawEvent.session_id);
        }
        if (isVisitor && event.rawEvent?.session_id) {
          saveVisitorChat(event.rawEvent.session_id);
          const history = event.rawEvent.history || [];
          if (history.length && messagesRef.current.length === 0) setMessages(history.map((m: any, i: number) => fromStoredMessage(m, i)));
        }
      } else if (event.type === 'payment_verified') {
        const rcpt = (event as any).receipt || event.rawEvent?.receipt;
        if (rcpt) {
          recordPaymentSuccess(rcpt);
        }
      } else if (event.type === 'intent_bound') {
        const raw = event.rawEvent || {};
        const step: ExecutionStep = {
          id: `intent-${raw.turn_id || Math.random()}`,
          type: 'intent',
          label: raw.action_family ? `Intent: ${raw.action_family}` : 'Intent Resolved',
          detail: raw.fields && Object.keys(raw.fields).length > 0
            ? `Bound ${Object.keys(raw.fields).length} parameter(s)`
            : 'General banking query',
          status: 'completed',
          timestamp: raw.timestamp ? raw.timestamp * 1000 : Date.now(),
          args: raw.fields || {},
        };
        setMessages(prev => {
          const streamIdx = prev.findIndex(m => m.isStreaming);
          if (streamIdx >= 0) {
            const target = prev[streamIdx];
            const existingSteps = target.steps || [];
            if (existingSteps.some(s => s.id === step.id)) return prev;
            return [
              ...prev.slice(0, streamIdx),
              { ...target, steps: [...existingSteps, step] },
              ...prev.slice(streamIdx + 1),
            ];
          }
          const botMsg: ChatMessage = {
            id: event.turnId || Math.random().toString(),
            role: 'assistant',
            text: '',
            timestamp: Date.now(),
            isStreaming: true,
            steps: [step],
          };
          return [...prev, botMsg];
        });
      } else if (event.type === 'skill_loaded') {
        const raw = event.rawEvent || {};
        const step: ExecutionStep = {
          id: `skill-${raw.skill_id || Math.random()}`,
          type: 'skill',
          label: `Skill Loaded: ${raw.name || raw.skill_id}`,
          detail: raw.description || 'Specialized banking workflow loaded into context',
          status: 'completed',
          timestamp: raw.timestamp ? raw.timestamp * 1000 : Date.now(),
        };
        setMessages(prev => {
          const streamIdx = prev.findIndex(m => m.isStreaming);
          if (streamIdx >= 0) {
            const target = prev[streamIdx];
            const existingSteps = target.steps || [];
            if (existingSteps.some(s => s.id === step.id)) return prev;
            return [
              ...prev.slice(0, streamIdx),
              { ...target, steps: [...existingSteps, step] },
              ...prev.slice(streamIdx + 1),
            ];
          }
          const botMsg: ChatMessage = {
            id: event.turnId || Math.random().toString(),
            role: 'assistant',
            text: '',
            timestamp: Date.now(),
            isStreaming: true,
            steps: [step],
          };
          return [...prev, botMsg];
        });
      } else if (event.type === 'turn_start') {
        setIsStreaming(true);
        setMessages(prev => {
          const streamIdx = prev.findIndex(m => m.isStreaming);
          if (streamIdx >= 0) {
            return prev;
          }
          const botMsg: ChatMessage = {
            id: event.turnId || Math.random().toString(),
            role: 'assistant',
            text: '',
            timestamp: Date.now(),
            isStreaming: true,
            steps: [],
          };
          return [...prev, botMsg];
        });
      } else if (event.type === 'tool_call') {
        const raw = event.rawEvent || {};
        const stepId = `tool-${raw.name}-${Date.now()}`;
        const step: ExecutionStep = {
          id: stepId,
          type: 'tool_call',
          label: `Tool Call: ${raw.name}`,
          detail: `Invoking capability ${raw.name}`,
          status: 'running',
          timestamp: raw.timestamp ? raw.timestamp * 1000 : Date.now(),
          args: raw.args || {},
        };
        setMessages(prev => {
          const streamIdx = prev.findIndex(m => m.isStreaming);
          if (streamIdx >= 0) {
            const target = prev[streamIdx];
            const existingSteps = target.steps || [];
            return [
              ...prev.slice(0, streamIdx),
              { ...target, steps: [...existingSteps, step] },
              ...prev.slice(streamIdx + 1),
            ];
          }
          const botMsg: ChatMessage = {
            id: event.turnId || Math.random().toString(),
            role: 'assistant',
            text: '',
            timestamp: Date.now(),
            isStreaming: true,
            steps: [step],
          };
          return [...prev, botMsg];
        });
      } else if (event.type === 'text_replace') {
        // Server-side cleanup of the streamed reply (suggestion marker removed / unsafe text replaced).
        const text = event.textDelta || '';
        setMessages(prev => prev.map(m => (m.isStreaming ? { ...m, text } : m)));
      } else if (event.type === 'text_delta') {
        const delta = event.textDelta || '';
        setMessages(prev => {
          if (prev.length === 0) {
            return [
              {
                id: Math.random().toString(),
                role: 'assistant',
                text: delta,
                timestamp: Date.now(),
                isStreaming: true,
              },
            ];
          }
          const streamIdx = prev.findIndex(m => m.isStreaming);
          if (streamIdx >= 0) {
            const target = prev[streamIdx];
            return [
              ...prev.slice(0, streamIdx),
              { ...target, text: target.text + delta },
              ...prev.slice(streamIdx + 1),
            ];
          }
          const last = prev[prev.length - 1];
          if (last.role === 'assistant' && !last.presentation && !last.toolResult) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + delta },
            ];
          }
          return [
            ...prev,
            {
              id: Math.random().toString(),
              role: 'assistant',
              text: delta,
              timestamp: Date.now(),
              isStreaming: true,
            },
          ];
        });
      } else if (event.type === 'sales_action') {
        setMessages(prev => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, salesAction: event.salesAction },
          ];
        });
      } else if (event.type === 'tool_result' || event.type === 'presentation') {
        let resData = event.rawEvent?.result ?? event.rawEvent;
        if (typeof resData === 'string') {
          try {
            resData = JSON.parse(resData);
          } catch {}
        }
        const toolName = event.rawEvent?.name;
        const presentationObj = resData?.presentation || (resData?.type ? resData : undefined);
        const now = Date.now();

        setMessages(prev => {
          const streamIdx = prev.findIndex(m => m.isStreaming);
          if (streamIdx >= 0) {
            const target = prev[streamIdx];
            const existingSteps = target.steps || [];
            let updated = false;
            const newSteps = [...existingSteps].reverse().map(s => {
              if (!updated && s.type === 'tool_call' && s.status === 'running' && (!toolName || s.label.includes(toolName))) {
                updated = true;
                return {
                  ...s,
                  status: 'completed' as const,
                  result: resData,
                  duration_ms: Math.max(0, now - s.timestamp),
                };
              }
              return s;
            }).reverse();

            if (!updated && toolName) {
              newSteps.push({
                id: `result-${toolName}-${now}`,
                type: 'tool_result' as const,
                label: `Tool Result: ${toolName}`,
                detail: `Completed capability ${toolName}`,
                status: 'completed' as const,
                timestamp: now,
                result: resData,
              });
            }

            return [
              ...prev.slice(0, streamIdx),
              {
                ...target,
                steps: newSteps,
                presentation: presentationObj || target.presentation,
                toolResult: resData || target.toolResult,
              },
              ...prev.slice(streamIdx + 1),
            ];
          }

          if (presentationObj || resData) {
            return [
              ...prev,
              {
                id: Math.random().toString(),
                role: 'assistant',
                text: '',
                presentation: presentationObj,
                toolResult: resData,
                timestamp: Date.now(),
              },
            ];
          }
          return prev;
        });
      } else if (event.type === 'message_saved') {
        const index = event.rawEvent?.message_index;
        setMessages(prev => {
          const at = [...prev].reverse().findIndex(m => m.role === 'assistant');
          if (at < 0 || typeof index !== 'number') return prev;
          const i = prev.length - 1 - at;
          return prev.map((m, k) => (k === i ? { ...m, storedIndex: index } : m));
        });
      } else if (['turn_complete', 'cancelled', 'cleared'].includes(event.type)) {
        sending.current = false;
        setIsStreaming(false);
        const dur = event.rawEvent?.duration_ms;
        setMessages(prev => {
          if (prev.length === 0) return prev;
          return prev
            .map(m => {
              if (!m.isStreaming) return m;
              let txt = m.text;
              const isApproved = m.presentation?.completed || m.presentation?.status === 'EXECUTED';
              if (isApproved && txt && (txt.includes('requires your approval') || txt.includes('enter the verification code'))) {
                txt = 'A transfer of money was proposed and has been verified and approved in the secure Kosh dialog.';
              }
              const completedSteps = (m.steps || []).map(s =>
                s.status === 'running' ? { ...s, status: 'completed' as const } : s
              );
              return {
                ...m,
                text: txt,
                isStreaming: false,
                steps: completedSteps.length > 0 ? completedSteps : undefined,
                duration_ms: dur ?? m.duration_ms,
              };
            })
            .filter(
              m =>
                (m.text && m.text.trim().length > 0) ||
                !!m.presentation ||
                !!m.toolResult ||
                !!m.salesAction ||
                (m.steps && m.steps.length > 0) ||
                (m.attachments && m.attachments.length > 0)
            );
        });
      } else if (event.type === 'disconnected' || event.type === 'error') {
        const interrupted = sending.current;
        sending.current = false;
        if (event.type === 'disconnected') setIsConnected(false);
        setIsStreaming(false);
        setMessages(prev => prev.map(m => ({ ...m, isStreaming: false })));
        if (event.type === 'disconnected' && !interrupted) return;
        setMessages(prev => [
          ...prev,
          {
            id: Math.random().toString(),
            role: 'system',
            text: event.error || 'Connection lost. Reconnect and send your message again.',
            timestamp: Date.now(),
          },
        ]);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentSessionId, isCustomer, isLoading, requiresConsent, sessionsLoaded, connectionAttempt]);

  const addAttachment = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1] || '';
        setAttachments(prev => [
          ...prev,
          {
            name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            data_base64: base64Data,
          },
        ]);
        resolve();
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const clearAttachments = () => setAttachments([]);

  const sendMessage = async (text: string, workflowId?: string, spoken?: boolean) => {
    if ((!text.trim() && attachments.length === 0) || sending.current) return false;
    if (!isConnected) { reconnect(); return false; }
    try {
      chatSocket.sendPrompt(text.trim(), attachments, workflowId, lang);
    } catch {
      setIsConnected(false);
      reconnect();
      return false;
    }
    sending.current = true;
    setIsStreaming(true);

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      text: text.trim(),
      attachments: [...attachments],
      timestamp: Date.now(),
      spoken,
    };

    setMessages(prev => [...prev, userMsg]);
    clearAttachments();
    return true;
  };

  const startNewSession = async () => {
    if (sending.current) return;
    try {
      const newSess = isCustomer ? await createSession('New Conversation') : null;
      historyRequest.current += 1;
      setMessages([]);
      clearAttachments();
      setIsConnected(false);
      if (newSess) {
        setSessions(prev => [newSess, ...prev]);
        setCurrentSessionId(newSess.id);
      } else {
        forgetVisitorChat();
        chatSocket.disconnect();
        setCurrentSessionId(null);
        reconnect();
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: 'Could not start a new conversation. Please try again.', timestamp: Date.now() }]);
    }
  };

  const switchSession = async (sessionId: string) => {
    if (sending.current || sessionId === currentSessionId) return;
    const request = ++historyRequest.current;
    setIsConnected(false);
    clearAttachments();
    setMessages([]);
    try {
      const history = await loadSessionHistory(sessionId);
      if (request === historyRequest.current && history && history.messages) {
        setCurrentSessionId(sessionId);
        setMessages(
          history.messages.map((m: any) => {
            const presObj = m.presentation || (m.presentations && m.presentations.length > 0 ? m.presentations[m.presentations.length - 1] : undefined);
            return {
              id: Math.random().toString(),
              role: m.role,
              text: m.text || '',
              attachments: m.attachments,
              presentation: presObj,
              toolResult: m.toolResult || presObj,
              salesAction: m.salesAction,
              steps: m.steps || undefined,
              duration_ms: m.duration_ms || undefined,
              timestamp: (m.timestamp || 0) * 1000 || Date.now(),
            };
          })
        );
      }
    } catch (e) {
      console.warn('Could not load session history', e);
      reconnect();
    }
  };


  const recordPaymentSuccess = (receipt: any) => {
    if (!receipt) return;
    const amountStr = receipt.amount_minor != null ? formatMoney(receipt.amount_minor) : 'Payment';
    const payeeStr = receipt.payee_name || receipt.beneficiary_name || 'Recipient';
    const refStr = receipt.reference || receipt.payment_ref ? ` Reference: ${receipt.reference || receipt.payment_ref}.` : '';

    setMessages(prev => {
      const refVal = receipt.reference || receipt.payment_ref;
      const alreadyHasReceipt = prev.some(
        m => m.presentation?.type === 'PAYMENT_RECEIPT' &&
             (m.presentation?.receipt?.reference === refVal || m.presentation?.receipt?.payment_ref === refVal)
      );

      const updated = prev.map(m => {
        if (
          m.presentation?.type === 'PAYMENT_CHALLENGE' ||
          m.presentation?.type === 'PAYMENT_APPROVAL_REQUIRED' ||
          m.toolResult?.type === 'PAYMENT_CHALLENGE'
        ) {
          let cleanedText = m.text;
          if (cleanedText && (cleanedText.includes('requires your approval') || cleanedText.includes('enter the verification code'))) {
            cleanedText = 'A transfer of money was proposed and has been verified and approved in the secure Kosh dialog.';
          }
          return {
            ...m,
            text: cleanedText,
            presentation: m.presentation ? { ...m.presentation, completed: true, status: 'EXECUTED' } : undefined,
            toolResult: m.toolResult ? { ...m.toolResult, completed: true, status: 'EXECUTED' } : undefined,
          };
        }
        return m;
      });

      if (alreadyHasReceipt) {
        return updated;
      }

      const receiptMessage: ChatMessage = {
        id: Math.random().toString(),
        role: 'assistant',
        text: translate(lang, 'Payment of {amount} to {payee} was verified by Kavach and completed.', { amount: amountStr, payee: payeeStr }) + refStr,
        presentation: {
          type: 'PAYMENT_RECEIPT',
          title: 'Transfer complete',
          receipt,
        },
        toolResult: {
          type: 'PAYMENT_RECEIPT',
          title: 'Transfer complete',
          receipt,
        },
        timestamp: Date.now(),
      };

      return [...updated, receiptMessage];
    });
  };

  const sessionInfo: SessionInfo | null = currentSessionId ? {
    id: currentSessionId,
    session_id: currentSessionId,
    title: 'Current Session',
    created_at: new Date().toISOString(),
    message_count: messages.length,
  } : null;

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        setIsOpen,
        messages,
        sessions,
        currentSessionId,
        sessionInfo,
        isConnected,
        isStreaming,
        attachments,
        addAttachment,
        removeAttachment,
        clearAttachments,
        sendMessage,
        recordPaymentSuccess,
        reconnect,
        startNewSession,
        clearSession: startNewSession,
        switchSession,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
