import React from 'react';
import { useBanking } from '../../context/BankingContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { formatMoney } from '../common/Formatters';
import { Badge } from '../common/Badge';
import { ChatHeader } from '../chat/ChatHeader';
import { ChatMessageList } from '../chat/ChatMessageList';
import { ChatComposer } from '../chat/ChatComposer';
import { Icon } from '../common/Icon';
import { useI18n } from '../../i18n';

export const AIBankerPage: React.FC = () => {
  const { t } = useI18n();
  const { overview, openWorkflow, startWorkflowById } = useBanking();
  const { user } = useAuth();
  const { messages, sendMessage, clearSession, isStreaming, sessions, currentSessionId, switchSession } = useChat();

  const customer = overview?.customer || {
    display_name: user?.display_name || t('Customer'),
    first_name: user?.display_name?.split(' ')[0] || 'there',
    id: user?.customer_id || t('Unavailable'),
    tier: 'Standard',
    city: '',
  };

  const kyc = overview?.kyc || overview?.customer?.kyc || { status: 'UNKNOWN' };
  const needsKyc = kyc.status === 'NOT_DONE' || kyc.status === 'PENDING_RE_KYC';
  const totalBalance = overview?.total_available_minor;

  const getInitials = (name?: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  };

  const skills = [
    { name: t('Open a savings account'), skillId: 'account_opening', icon: 'accounts' },
    { name: t('KYC and re-KYC'), skillId: 'kyc', icon: 'idcard' },
    { name: t('Update residential address'), skillId: 'address_update', icon: 'pin' },
    { name: t('Add or update a nominee'), skillId: 'nominee_update', icon: 'users' },
    { name: t('Request a cheque book'), skillId: 'cheque_book', icon: 'book' },
    { name: t('Stop a cheque'), skillId: 'stop_cheque', icon: 'close' },
    { name: t('Download a statement'), skillId: 'statement', icon: 'download' },
  ];

  return (
    <div className="ai-workbench-grid">
      <aside className="ai-sidebar-panel">
        <div className="ai-customer-card">
          <div className="ai-customer-top">
            <span className="k-avatar" aria-hidden="true">{getInitials(customer.display_name)}</span>
            <div>
              <strong>{customer.display_name}</strong>
              <small>{t('{tier} banking', { tier: customer.tier || t('Standard') })}{customer.city ? ` · ${customer.city}` : ''}</small>
            </div>
          </div>
          <div className="info-row"><span>{t('Total balance')}</span><strong>{totalBalance == null ? '—' : formatMoney(totalBalance)}</strong></div>
          <div className="info-row"><span>{t('KYC')}</span><Badge status={kyc.status} /></div>
          {kyc.status === 'NOT_DONE' && (
            <p className="c-ai-warn"><Icon name="alert" />{t('Complete your initial KYC verification to send money.')}</p>
          )}
          {needsKyc && (
            <button type="button" className="k-btn primary wide sm c-mt" onClick={() => startWorkflowById('kyc')}>
              {kyc.status === 'NOT_DONE' ? t('Start initial KYC') : t('Complete re-KYC')}
            </button>
          )}
        </div>

        <div className="ai-skills-section">
          <div className="ai-section-title" title={t('Mitra fills these forms with you. You check everything before it is sent.')}>{t('What Mitra can do')}</div>
          <div className="ai-skills-list">
            {skills.map(s => (
              <button key={s.skillId} type="button" className="ai-skill-btn" onClick={() => startWorkflowById(s.skillId)}>
                <Icon name={s.icon} />
                <span>{s.name}</span>
                <Icon name="chevron-right" className="icon c-skill-go" />
              </button>
            ))}
          </div>
        </div>

        <div className="ai-sessions-section">
          <div className="c-ai-sessions-head">
            <div className="ai-section-title">{t('Recent conversations')}</div>
            <button type="button" className="k-link" onClick={clearSession} disabled={isStreaming}>{t('New chat')}</button>
          </div>
          <div id="aiPageSessions" className="ai-sessions-list">
            {sessions.length > 0 ? sessions.slice(0, 5).map(session => (
              <button key={session.id} type="button" className={`ai-session-item ${session.id === currentSessionId ? 'active' : ''}`} onClick={() => switchSession(session.id)} disabled={isStreaming} aria-current={session.id === currentSessionId ? 'true' : undefined}>
                <span>{session.title || t('Banking conversation')}</span>
              </button>
            )) : <span className="muted">{t('Your conversations will appear here.')}</span>}
          </div>
        </div>

        <div className="ai-security-shield">
          <Icon name="shield" />
          <span><strong>{t('Sentinel protection')}</strong>{t('Sentinel checks every action Mitra prepares. Payments always need your separate approval in Kavach.')}</span>
        </div>
      </aside>

      {/* Right AI Main Workspace */}
      <section className="ai-main-workspace">
        <ChatHeader />
        <ChatMessageList id="aiPageMessages" messages={messages} onSuggestedQuery={sendMessage} onOpenWorkflow={openWorkflow} onStartWorkflow={startWorkflowById} />
        <ChatComposer idPrefix="aiPage" />
      </section>
    </div>
  );
};
