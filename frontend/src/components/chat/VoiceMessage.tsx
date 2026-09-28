import { useEffect, useRef } from 'react';
import { Square, Volume2 } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { useI18n } from '../../i18n';
import { canSpeak, speak, stopSpeaking, useSpeaking } from './voice';

/** Reads a Mitra reply aloud (browser speech synthesis, Indian English / Hindi / Marathi). */
export function ListenButton({ id, text }: { id: string; text: string }) {
  const { t } = useI18n();
  const speaking = useSpeaking() === id;
  if (!canSpeak()) return null;
  return (
    <button type="button" className={`ai-listen ${speaking ? 'is-speaking' : ''}`} onClick={() => (speaking ? stopSpeaking() : speak(id, text))}
      aria-pressed={speaking} aria-label={speaking ? t('Stop reading aloud') : t('Listen to this reply')}>
      {speaking ? <Square size={12} /> : <Volume2 size={14} />}
      <span>{speaking ? t('Stop') : t('Listen')}</span>
      {speaking && <span className="ai-listen-eq" aria-hidden="true"><b /><b /><b /></span>}
    </button>
  );
}

/** When the customer speaks, Mitra answers out loud: reads the finished reply to a dictated message once. */
export function useAutoSpeak(messages: ChatMessage[]) {
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.isStreaming || !last.text?.trim() || spoken.current.has(last.id)) return;
    const prevUser = [...messages].reverse().find(m => m.role === 'user');
    if (!prevUser?.spoken || prevUser.timestamp > last.timestamp) return;
    spoken.current.add(last.id);
    speak(last.id, last.text);
  }, [messages]);
  useEffect(() => () => stopSpeaking(), []);
}
