import { LotusMark } from '../common/KoshLogo';
import { RotateCcw, X } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useI18n } from '../../i18n';

export function ChatHeader({ onClose }: { onClose?: () => void }) {
  const { t } = useI18n();
  const { isConnected, isStreaming, clearSession, reconnect } = useChat();
  return <header className="ai-chat-header">
    <div className="ai-chat-header-info">
      <LotusMark size={36} className="ai-avatar-lotus" />
      <div><h2>{t('Mitra')}</h2><p>{t('Kosh AI banker')}</p></div>
    </div>
    <div className="ai-header-actions">
      <span className={`ai-live-pill ${isConnected ? '' : 'offline'}`} role="status"><i className="ai-live-dot" />{isConnected ? (isStreaming ? t('Responding') : t('Connected')) : t('Disconnected')}</span>
      {!isConnected && <button className="text-button" onClick={reconnect}>{t('Reconnect')}</button>}
      <button type="button" className="icon-button" onClick={clearSession} disabled={isStreaming} aria-label={t('New conversation')} title={t('New conversation')}><RotateCcw size={16} /></button>
      {onClose && <button type="button" className="icon-button" onClick={onClose} aria-label={t('Close assistant')}><X size={18} /></button>}
    </div>
  </header>;
}
