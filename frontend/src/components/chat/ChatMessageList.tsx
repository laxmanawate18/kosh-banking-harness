import { LotusMark } from '../common/KoshLogo';
import React, { useEffect, useRef } from 'react';
import { post } from '../../services/api';
import type { ChatMessage } from '../../types/chat';
import { SalesActionCard } from './SalesActionCard';
import { ChatPresentationCard } from './ChatPresentationCard';
import { ChatProcessTrace } from './ChatProcessTrace';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { useBanking } from '../../context/BankingContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';

import { ListenButton, useAutoSpeak } from './VoiceMessage';

/** Mitra ends replies with a machine-readable `SUGGESTIONS: [...]` line for chips; never render it (also mid-stream). */
const stripSuggestions = (text: string) => text.replace(/\s*SUGGESTIONS:[\s\S]*$/i, '').trim();

interface ChatMessageListProps {
  messages: ChatMessage[];
  onSuggestedQuery: (q: string) => void;
  onOpenWorkflow?: (workflowId: string) => void;
  onStartWorkflow?: (skillId: string) => void;
  onApplyProduct?: (productId: string) => void;
  id?: string;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, onSuggestedQuery: sendMessage, onOpenWorkflow: openWorkflow, onStartWorkflow: startWorkflowById, onApplyProduct, id }) => {
  const { t } = useI18n();
  const { setActiveChallenge } = useBanking();
  const { user } = useAuth();
  const { isConnected, isStreaming } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutoSpeak(messages);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current && scrollRef.current) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [messages]);
  const visitor = user?.role !== 'CUSTOMER';
  const prompts = visitor ? [
    [t('Explore savings accounts'), t('Help me compare your savings accounts.')],
    [t('Understand deposit options'), t('Explain your fixed deposit options and terms.')],
    [t('Find a credit card'), t('Help me choose a credit card based on my needs.')],
  ] : [
    [t('Complete KYC'), t('I would like to complete my pending KYC verification.')],
    [t('Balances and spending'), t('Show my accounts and recent spending.')],
    [t('Card security'), t('Show my security alerts.')],
  ];
  const firstName = user?.display_name?.split(' ')[0];
  return <div id={id} className="ai-messages-scroll" ref={scrollRef} aria-live="polite" aria-relevant="additions text" onScroll={() => {
    const el = scrollRef.current;
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }}>
    {messages.length === 0 ? <div className="ai-welcome-hero">
      <LotusMark size={36} className="ai-avatar-lotus" />
      <h3>{visitor ? t('How can we help you get started?') : firstName ? t('Hello, {name}.', { name: firstName }) : t('Hello.')}</h3>
      <p>{visitor ? t('Explore accounts, cards and deposits with Mitra. Sign in for help with your own accounts.') : t('Check your balances, manage banking requests and get help with KYC.')}</p>
      <div className="ai-quick-cards">{prompts.map(([label, prompt]) => <button type="button" className="ai-quick-card" key={label} disabled={!isConnected || isStreaming} onClick={() => sendMessage(prompt)}><strong>{label}</strong><small>{prompt}</small></button>)}</div>
    </div> : (
            messages.map(msg => {
              const isUser = msg.role === 'user';
              const hasSteps = !!(msg.steps && msg.steps.length > 0);
              const hasTextOrAttachments = (msg.text && msg.text.trim().length > 0) || (msg.attachments && msg.attachments.length > 0) || msg.isStreaming;
              const hasPresentation = !!(msg.presentation || msg.toolResult);

              if (!hasTextOrAttachments && !hasSteps && hasPresentation) {
                return (
                  <div key={msg.id} style={{ alignSelf: 'flex-start', width: '100%', maxWidth: '680px' }}>
                    <ChatPresentationCard
                      presentation={msg.presentation}
                      toolResult={msg.toolResult}
                      onPromptClick={q => sendMessage(q)}
                      onOpenWorkflow={openWorkflow}
                      onStartWorkflow={startWorkflowById}
                      onPaymentChallenge={challenge => setActiveChallenge(challenge)}
                    />
                  </div>
                );
              }

              if (!hasTextOrAttachments && !msg.salesAction && !hasSteps) {
                return null;
              }

              return (
                <div key={msg.id} className={`message ${isUser ? 'user' : msg.role === 'system' ? 'error' : 'assistant'}`} role={msg.role === 'system' ? 'alert' : undefined}>
                  <small>{isUser ? t('You') : msg.role === 'system' ? t('Connection notice') : t('Mitra')}</small>

                  {!isUser && (hasSteps || msg.isStreaming) && (
                    <ChatProcessTrace
                      steps={msg.steps}
                      isStreaming={msg.isStreaming}
                      durationMs={msg.duration_ms}
                    />
                  )}

                  {hasTextOrAttachments && (
                    <div>
                      {msg.text && (
                        isUser ? (
                          <div>{msg.text}</div>
                        ) : (
                          <MarkdownRenderer content={stripSuggestions(msg.text)} />
                        )
                      )}

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="chat-attachment-grid">
                          {msg.attachments.map((att, idx) => {
                            const isImg = att.mime_type.startsWith('image/');
                            return (
                              <div key={idx}>
                                {isImg && att.data_base64 && (
                                  <img
                                    src={att.data_base64.startsWith('data:') ? att.data_base64 : `data:${att.mime_type};base64,${att.data_base64}`}
                                    alt={att.name}
                                    className="chat-attached-image"
                                  />
                                )}
                                {!isImg && (
                                  <div className="chat-attached-doc">
                                    <Icon name="file" />
                                    <span>{att.name}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {msg.isStreaming && (
                        <span className="ai-streaming-cursor" aria-label={t('Responding')} />
                      )}
                      {!isUser && msg.role === 'assistant' && !msg.isStreaming && msg.text?.trim() && <ListenButton id={msg.id} text={msg.text} />}
                      {!isUser && msg.role === 'assistant' && !msg.isStreaming && typeof msg.storedIndex === 'number' && <FeedbackButtons index={msg.storedIndex} />}
                    </div>
                  )}

                  {/* Presentation UI Component */}
                  {hasPresentation && (
                    <ChatPresentationCard
                      presentation={msg.presentation}
                      toolResult={msg.toolResult}
                      onPromptClick={q => sendMessage(q)}
                      onOpenWorkflow={openWorkflow}
                      onStartWorkflow={startWorkflowById}
                      onPaymentChallenge={challenge => setActiveChallenge(challenge)}
                    />
                  )}

                  {msg.salesAction && msg.presentation?.type !== 'AUTH_CHALLENGE' && (
                    <SalesActionCard
                      salesAction={msg.salesAction}
                      onQueryClick={q => sendMessage(q)}
                      onApplyProduct={onApplyProduct}
                    />
                  )}
                </div>
              );
            })
    )}
  </div>;
};

/** Thumbs up / down on one Mitra reply; a thumbs-down asks what went wrong (optional). */
const FeedbackButtons: React.FC<{ index: number }> = ({ index }) => {
  const { t } = useI18n();
  const { currentSessionId } = useChat();
  const [sent, setSent] = React.useState<0 | 1 | -1>(0);
  if (!currentSessionId) return null;
  const rate = async (rating: 1 | -1) => {
    const comment = rating < 0 ? window.prompt(t('What went wrong? (optional)')) || undefined : undefined;
    try { await post('/api/chat/feedback', { session_id: currentSessionId, message_index: index, rating, comment }); setSent(rating); } catch { /* feedback is best-effort */ }
  };
  if (sent) return <span className="ai-feedback-done" role="status">{t('Thanks for the feedback')}</span>;
  return (
    <span className="ai-feedback" role="group" aria-label={t('Was this helpful?')}>
      <button type="button" onClick={() => rate(1)} aria-label={t('Helpful')} title={t('Helpful')}>👍</button>
      <button type="button" onClick={() => rate(-1)} aria-label={t('Not helpful')} title={t('Not helpful')}>👎</button>
    </span>
  );
};
