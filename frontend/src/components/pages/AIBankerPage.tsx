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

  const kyc = overview?.kyc || overview?.customer?.kyc || { status: 'UNKNOWN', risk_category: t('Unavailable') };
  const isRestricted = kyc.status === 'NOT_DONE';
  const isPendingReKyc = kyc.status === 'PENDING_RE_KYC';
  const isUnderReview = kyc.status === 'SUBMITTED_FOR_REVIEW';

  const totalBalance = overview?.total_available_minor;

  const getInitials = (name?: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="ai-workbench-grid">
      {/* Left AI Sidebar Panel */}
      <aside className="ai-sidebar-panel">
        <div className="ai-customer-card">
          <div className="ai-customer-top">
            <span className="avatar">{getInitials(customer.display_name)}</span>
            <div>
              <strong>{customer.display_name}</strong>
              <small>{t('{tier} banking', { tier: customer.tier || t('Standard') })}{customer.city ? ` • ${customer.city}` : ''}</small>
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <div className="info-row"><span>{t('Customer ID')}</span><strong>{customer.id}</strong></div>
            <div className="info-row"><span>{t('Total balance')}</span><strong>{totalBalance == null ? t('Unavailable') : formatMoney(totalBalance)}</strong></div>
            <div className="info-row"><span>{t('KYC status')}</span><Badge status={kyc.status}>{kyc.status}</Badge></div>
            <div className="info-row"><span>{t('Risk category')}</span><strong>{kyc.risk_category || t('Unavailable')}</strong></div>
            <div className="info-row"><span>{t('PAN number')}</span><strong>{kyc.pan_masked || t('Unavailable')}</strong></div>
            <div className="info-row"><span>{t('Aadhaar / ID')}</span><strong>{kyc.aadhaar_masked || '•••• •••• ••••'}</strong></div>

            {isRestricted ? (
              <>
                <div className="restriction-alert" style={{ marginTop: '10px', padding: '8px 10px', fontSize: '13px' }}>
                  <Icon name="alert" />
                  <div><strong>{t('Outward transfers restricted')}</strong><br />{t('Complete your initial KYC verification to send money.')}</div>
                </div>
                <button
                  type="button"
                  className="button primary wide"
                  style={{ marginTop: '8px' }}
                  onClick={() => startWorkflowById('kyc')}
                >
                  {t('Start initial KYC')}
                </button>
              </>
            ) : isPendingReKyc ? (
              <button
                type="button"
                className="button primary wide"
                style={{ marginTop: '8px' }}
                onClick={() => startWorkflowById('kyc')}
              >
                {t('Complete re-KYC')}
              </button>
            ) : isUnderReview ? (
              <div className="badge neutral" style={{ marginTop: '8px', display: 'inline-block' }}>
                {t('KYC under review')}
              </div>
            ) : kyc.status === 'VERIFIED' ? (
              <div className="badge success" style={{ marginTop: '8px', display: 'inline-flex' }}>
                <Icon name="check" style={{ width: 14, height: 14 }} />{t('KYC up to date')}
              </div>
            ) : null}
          </div>
        </div>

        <div className="ai-skills-section">
          <div className="ai-section-title">{t('What Mitra can do')}</div>
          <div className="ai-skills-list">
            {[
              { name: t('Open a savings account'), skillId: 'account_opening', desc: t('Automatic core banking entry with maker-checker review') },
              { name: t('KYC and re-KYC'), skillId: 'kyc', desc: t('Form filled from your documents') },
              { name: t('Update residential address'), skillId: 'address_update', desc: t('Form filled from your documents') },
              { name: t('Add or update a nominee'), skillId: 'nominee_update', desc: t('Guided banking form') },
              { name: t('Request a cheque book'), skillId: 'cheque_book', desc: t('Guided banking form') },
              { name: t('Stop a cheque'), skillId: 'stop_cheque', desc: t('Guided banking form') },
              { name: t('Download an account statement'), skillId: 'statement', desc: t('Guided banking form') },
            ].map((s) => (
              <button
                key={s.name}
                type="button"
                className="ai-skill-btn"
                onClick={() => startWorkflowById(s.skillId)}
              >
                <div>
                  <strong>{s.name}</strong>
                  <small className="muted" style={{ display: 'block' }}>{s.desc}</small>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="ai-sessions-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div className="ai-section-title" style={{ margin: 0 }}>{t('Recent conversations')}</div>
            <button
              type="button"
              className="text-button"
              onClick={clearSession}
              disabled={isStreaming}
              style={{ fontSize: '13px' }}
            >
              + {t('New chat')}
            </button>
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
          <strong><Icon name="shield" /> {t('Sentinel protection')}</strong>
          <span>{t('Sentinel checks every action Mitra prepares. Payments always need your separate approval in Kavach.')}</span>
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
