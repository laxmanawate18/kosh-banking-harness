import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Mic, Square } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { canDictate, DICTATION_LANGS, stopSpeaking, useDictation, type DictationLang } from './voice';

const SITE_TO_DICTATION: Record<string, DictationLang> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

export function ChatComposer({ idPrefix = 'drawer' }: { idPrefix?: string }) {
  const { t, lang } = useI18n();
  const { sendMessage, isStreaming, isConnected } = useChat();
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceLang, setVoiceLang] = useState<DictationLang>(SITE_TO_DICTATION[lang] || 'en-IN');
  const spoken = useRef(false); // the current text came (partly) from the mic → Mitra answers aloud
  const box = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(
    text => { spoken.current = true; setPrompt(text.slice(0, 4000)); },
    message => setVoiceError(t(message)),
  );
  const ready = isConnected && !isStreaming;

  const submit = async () => {
    if (!prompt.trim() || !ready) return;
    dictation.stop();
    if (await sendMessage(prompt, undefined, spoken.current)) { setPrompt(''); spoken.current = false; }
  };
  const handleSubmit = (e: FormEvent) => { e.preventDefault(); void submit(); };
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const listen = (language = voiceLang) => {
    setVoiceError('');
    stopSpeaking();
    void dictation.start(prompt, language);
    box.current?.focus();
  };
  const toggleMic = () => (dictation.listening ? dictation.stop() : listen());
  const switchLang = (l: DictationLang) => {
    setVoiceLang(l);
    if (dictation.listening) { dictation.stop(); setTimeout(() => listen(l), 150); }
  };

  const busy = dictation.listening || dictation.transcribing;
  const placeholder = dictation.listening ? t('Listening… speak now')
    : dictation.transcribing ? t('Writing down what you said…')
    : user?.role === 'CUSTOMER' ? t('Ask about your accounts or banking requests…') : t('Ask about accounts, cards or deposits…');

  return <div className="ai-composer-wrapper">
    <form id={`${idPrefix}Form`} className={`ai-input-box ${dictation.listening ? 'is-listening' : ''}`} onSubmit={handleSubmit}>
      <div className="ai-input-row">
        <textarea ref={box} id={`${idPrefix}PromptInput`} aria-label={t('Message Mitra')} value={prompt}
          onChange={e => { setPrompt(e.target.value); if (!e.target.value) spoken.current = false; }}
          onKeyDown={handleKeyDown} placeholder={placeholder} rows={2} maxLength={4000} />
        {canDictate() && (
          <button id={`${idPrefix}MicBtn`} type="button" className={`ai-mic-btn ${dictation.listening ? 'is-on' : ''}`} onClick={toggleMic}
            disabled={!isConnected || dictation.transcribing} aria-pressed={dictation.listening}
            aria-label={dictation.listening ? t('Stop voice input') : t('Speak your message')} title={dictation.listening ? t('Stop voice input') : t('Speak your message')}>
            {dictation.listening ? <Square size={14} /> : <Mic size={18} />}
          </button>
        )}
        <button id={`${idPrefix}SendBtn`} type="submit" className="ai-send-btn" disabled={!prompt.trim() || !ready || dictation.transcribing} aria-label={t('Send message')}><ArrowUp size={18} /></button>
      </div>
    </form>
    {voiceError ? <p className="ai-composer-note ai-voice-error" role="alert">{voiceError}</p>
      : busy ? (
        <p className="ai-composer-note ai-voice-status" role="status">
          <i className="ai-voice-dot" />{dictation.transcribing ? t('Writing down what you said…') : t('Listening in')}
          {!dictation.transcribing && (
            <span className="ai-voice-langs" role="group" aria-label={t('Voice language')}>
              {DICTATION_LANGS.map(([code, label]) => (
                <button key={code} type="button" aria-pressed={voiceLang === code} onClick={() => switchLang(code)}>{label}</button>
              ))}
            </span>
          )}
        </p>
      ) : <p className="ai-composer-note">{user?.role === 'CUSTOMER' ? t('Upload documents through the KYC or address workflow.') : t('Type, or tap the mic and speak in English, हिन्दी or मराठी.')}</p>}
    <p className="ai-composer-note ai-disclosure">{t('Mitra is Kosh’s AI assistant and can make mistakes; check important details in official terms. Chats are kept for 90 days. Never share your OTP or PIN.')}</p>
  </div>;
}
