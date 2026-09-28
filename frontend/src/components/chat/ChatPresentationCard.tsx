import React from 'react';
import { formatMoney } from '../common/Formatters';
import type { ChatPresentation } from '../../types/chat';
import { useAuth } from '../../context/AuthContext';

interface ChatPresentationCardProps {
  presentation?: ChatPresentation;
  toolResult?: any;
  onPromptClick?: (prompt: string) => void;
  onOpenWorkflow?: (workflowId: string) => void;
  onStartWorkflow?: (skillId: string) => void;
  onPaymentChallenge?: (challenge: any) => void;
}

export const ChatPresentationCard: React.FC<ChatPresentationCardProps> = ({
  presentation,
  toolResult,
  onPromptClick,
  onOpenWorkflow,
  onStartWorkflow,
  onPaymentChallenge,
}) => {
  const { isAuthenticated, user } = useAuth();
  const result = toolResult || {};
  const pres = presentation || result.presentation || {};
  const type = pres.type || result.type || '';
  const title = pres.title || (type ? type.replace(/_/g, ' ') : 'Activity & Details');

  // 1. Transaction List (e.g. "Recent activity")
  if (type === 'TRANSACTION_LIST' || (result.transactions && Array.isArray(result.transactions))) {
    const transactions = result.transactions || pres.transactions || [];
    return (
      <article className="chat-result">
        <h3>{title || 'Recent activity'}</h3>
        {transactions.length === 0 ? (
          <p className="muted" style={{ fontSize: '11px', margin: '4px 0' }}>No recent activity found.</p>
        ) : (
          transactions.slice(0, 8).map((t: any, idx: number) => {
            const amountPaise = t.amount_minor ?? t.amount_paise ?? 0;
            const formatted = formatMoney(amountPaise);
            return (
              <div key={idx} className="info-row">
                <span>{t.description || t.narration || t.note || 'Transaction'}</span>
                <strong>{formatted}</strong>
              </div>
            );
          })
        )}
      </article>
    );
  }

  // 2. Account Summary (e.g. "Your money at a glance")
  if (type === 'ACCOUNT_SUMMARY' || (result.accounts && Array.isArray(result.accounts))) {
    const accounts = result.accounts || pres.accounts || [];
    return (
      <article className="chat-result">
        <h3>{title || 'Your money at a glance'}</h3>
        {accounts.map((a: any, idx: number) => (
          <div key={idx} className="info-row">
            <span>{a.name || 'Account'} {a.account_number_masked ? `(${a.account_number_masked})` : ''}</span>
            <strong>{formatMoney(a.available_balance_minor ?? a.balance_paise ?? 0)}</strong>
          </div>
        ))}
      </article>
    );
  }

  // 3. Bill List (e.g. "Bills due")
  if (type === 'BILL_LIST' || (result.bills && Array.isArray(result.bills))) {
    const bills = result.bills || pres.bills || [];
    return (
      <article className="chat-result">
        <h3>{title || 'Bills due'}</h3>
        {bills.length === 0 ? (
          <p className="muted" style={{ fontSize: '11px', margin: '4px 0' }}>No bills currently due.</p>
        ) : (
          bills.map((b: any, idx: number) => (
            <div key={idx} className="info-row">
              <span>{b.biller_name || b.name || 'Biller'}</span>
              <strong>{formatMoney(b.amount_minor ?? b.amount_paise ?? 0)}</strong>
            </div>
          ))
        )}
      </article>
    );
  }

  // 4. Security Alerts
  if (type === 'SECURITY_ALERT' || (result.alerts && Array.isArray(result.alerts))) {
    const alerts = result.alerts || pres.alerts || [];
    return (
      <article className="chat-result">
        <h3>{title || 'Security alerts'}</h3>
        {alerts.map((a: any, idx: number) => (
          <div key={idx} className="info-row">
            <span>{a.title || a.message || 'Alert'}</span>
            <strong>{a.status || 'Active'}</strong>
          </div>
        ))}
      </article>
    );
  }

  // 5. Choice Selection (Interactive Options)
  if (type === 'CHOICE_SELECTION' || (result.options && Array.isArray(result.options))) {
    const options = result.options || pres.options || [];
    return (
      <article className="chat-result">
        <h3>{title || 'Choose an Option'}</h3>
        {pres.description && (
          <p className="muted" style={{ fontSize: '11px', margin: '4px 0 10px' }}>
            {pres.description}
          </p>
        )}
        <div className="action-chips">
          {options.map((o: any, idx: number) => (
            <button
              key={idx}
              type="button"
              className="action-chip"
              onClick={() => onPromptClick?.(o.prompt || o.value || o.label)}
            >
              {o.label || o.value}
            </button>
          ))}
        </div>
      </article>
    );
  }

  // 6. KYC Status & Profile
  if (['KYC_STATUS', 'KYC_FORM', 'INITIAL_KYC_FORM', 'KYC_IN_REVIEW'].includes(type) || result.kyc_status) {
    const kycStatus = result.kyc_status || pres.kyc_status;
    const pan = result.registered_pan_masked || result.pan_masked || pres.registered_pan_masked;
    const reqId = result.pending_request_id || pres.pending_request_id;
    return (
      <article className="chat-result">
        <h3>{title || 'KYC profile'}</h3>
        {kycStatus && (
          <div className="info-row">
            <span>Status</span>
            <strong>{String(kycStatus).replace(/_/g, ' ')}</strong>
          </div>
        )}
        {pan && (
          <div className="info-row">
            <span>PAN</span>
            <strong>{pan}</strong>
          </div>
        )}
        {reqId ? (
          <div className="info-row">
            <span>Request</span>
            <strong>{reqId}</strong>
          </div>
        ) : (
          <div style={{ marginTop: '8px' }}>
            <p className="muted" style={{ fontSize: '11px', margin: '4px 0 10px' }}>
              Scan documents, review prefilled details and complete declarations in your saved form.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                const existingWfId = result.workflow_id || pres.workflow_id || result.id;
                if (existingWfId && onOpenWorkflow) {
                  onOpenWorkflow(existingWfId);
                } else if (onStartWorkflow) {
                  onStartWorkflow('kyc');
                } else {
                  onPromptClick?.('I would like to complete my pending KYC verification.');
                }
              }}
            >
              Open KYC form ↗
            </button>
          </div>
        )}
      </article>
    );
  }

  // Clarification / Missing parameters
  if (type === 'CLARIFICATION') {
    return (
      <article className="chat-result" style={{ borderLeft: '3px solid #ffab00' }}>
        <h3>{title || 'Clarification needed'}</h3>
        {pres.message && (
          <p className="muted" style={{ fontSize: '11px', margin: '4px 0 10px' }}>
            {pres.message}
          </p>
        )}
      </article>
    );
  }


  // 7. Payment Challenge / Approval Required
  if (type === 'PAYMENT_CHALLENGE' || type === 'PAYMENT_APPROVAL_REQUIRED' || result.challenge) {
    const challenge = result.challenge || pres.challenge || result;
    const isCompleted =
      Boolean(pres?.completed) ||
      pres?.status === 'EXECUTED' ||
      Boolean(result?.completed) ||
      result?.status === 'EXECUTED' ||
      challenge?.status === 'APPROVED' ||
      challenge?.status === 'EXECUTED' ||
      Boolean(challenge?.completed);

    return (
      <article className="chat-result">
        <h3>{isCompleted ? 'Approval verified' : (title || 'Approval required')}</h3>
        {(challenge?.payee_name || challenge?.beneficiary_name) && (
          <div className="info-row">
            <span>Payee</span>
            <strong>{challenge.payee_name || challenge.beneficiary_name}</strong>
          </div>
        )}
        {challenge?.amount_minor != null && (
          <div className="info-row">
            <span>Amount</span>
            <strong>{formatMoney(challenge.amount_minor)}</strong>
          </div>
        )}
        {isCompleted ? (
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', color: '#006b5e', fontWeight: 600, fontSize: '0.85rem' }}>
            <span>✓</span>
            <span>Approved &amp; verified</span>
          </div>
        ) : (
          <button
            type="button"
            className="button primary"
            style={{ marginTop: '10px' }}
            onClick={() => onPaymentChallenge?.(challenge)}
          >
            Review & verify
          </button>
        )}
      </article>
    );
  }

  // 8. Payment Receipt
  if (type === 'PAYMENT_RECEIPT' || result.receipt) {
    const receipt = result.receipt || pres.receipt || result;
    const payee = receipt?.payee_name || receipt?.beneficiary_name;
    const sourceAcc = receipt?.source_account_name || receipt?.account_name;
    const ref = receipt?.reference || receipt?.payment_ref;

    return (
      <article className="chat-result">
        <h3>{title || 'Transfer complete'}</h3>
        {payee && (
          <div className="info-row">
            <span>Paid to</span>
            <strong>{payee}</strong>
          </div>
        )}
        {sourceAcc && (
          <div className="info-row">
            <span>From</span>
            <strong>{sourceAcc}</strong>
          </div>
        )}
        {receipt?.amount_minor != null && (
          <div className="info-row">
            <span>Amount</span>
            <strong>{formatMoney(receipt.amount_minor)}</strong>
          </div>
        )}
        {ref && (
          <div className="info-row">
            <span>Reference</span>
            <strong>{ref}</strong>
          </div>
        )}
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', color: '#006b5e', fontWeight: 600, fontSize: '0.85rem' }}>
          <span>✓</span>
          <span>Payment executed successfully</span>
        </div>
      </article>
    );
  }

  // 9. Sentinel Policy Denial
  if (type === 'SENTINEL_DENIAL' || result.sentinel?.reason_codes) {
    const reasons = result.sentinel?.reason_codes || pres.sentinel?.reason_codes || [result.reason || 'Policy restriction'];
    return (
      <article className="chat-result">
        <h3>{title || 'Payment could not be completed'}</h3>
        {reasons.map((r: string, idx: number) => (
          <div key={idx} className="info-row">
            <span>Policy reason</span>
            <strong>{String(r).replace(/_/g, ' ')}</strong>
          </div>
        ))}
      </article>
    );
  }

  // 10. Card Frozen
  if (type === 'CARD_FROZEN' || result.card) {
    const card = result.card || pres.card;
    return (
      <article className="chat-result">
        <h3>{title || 'Card frozen'}</h3>
        <div className="info-row">
          <span>Card</span>
          <strong>{card?.card_number_masked || '•••• 9821'}</strong>
        </div>
        <div className="info-row">
          <span>Status</span>
          <strong>Frozen</strong>
        </div>
      </article>
    );
  }

  // 11. Banking Workflow Draft
  if (type === 'BANKING_WORKFLOW' || pres.workflow_id) {
    const wfId = result.id || pres.workflow_id || result.workflow_id;
    const wfName = result.name || pres.name || title || 'Banking workflow';
    return (
      <article className="chat-result">
        <h3>{wfName}</h3>
        <p className="muted" style={{ fontSize: '11px', margin: '4px 0 10px' }}>
          Your saved form is ready. Review details and use the form to continue.
        </p>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            if (onOpenWorkflow && wfId) {
              onOpenWorkflow(wfId);
            } else if (onStartWorkflow) {
              onStartWorkflow(pres.skill_id || 'account_opening');
            } else {
              onPromptClick?.(`Open workflow ${wfId || ''}`);
            }
          }}
        >
          Open form ↗
        </button>
      </article>
    );
  }

  // 12. RPA Account Opening Status & Confirmation
  if (type === 'RPA_ACCOUNT_OPENING_STATUS' || type === 'RPA_ACCOUNT_OPENED') {
    const job = pres.job || result.job || {};
    const status = pres.status || job.status || result.status || 'IN_REVIEW';
    const isCompleted = status === 'COMPLETED' || type === 'RPA_ACCOUNT_OPENED';
    const cif = pres.cif_number || job.cif_number || result.cif_number || 'CIF-5021';
    const acct = pres.account_number || job.account_number || result.account_number || '1092004821';
    const ref = pres.application_reference || job.request_id || result.application_reference || 'APP-2026-9812';

    return (
      <article className="chat-result" style={{ borderLeft: isCompleted ? '3px solid #00875a' : '3px solid #0052cc' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>{isCompleted ? '🎉 Account Created in CBS' : '🤖 RPA Account Opening In-Progress'}</h3>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '12px',
            background: isCompleted ? '#e3fcef' : '#deebff',
            color: isCompleted ? '#006644' : '#0747a6'
          }}>
            {isCompleted ? 'CBS COMPLETED' : 'MAKER ENTRY'}
          </span>
        </div>

        <div className="info-row">
          <span>Application Ref</span>
          <strong>{ref}</strong>
        </div>

        {isCompleted ? (
          <>
            <div className="info-row">
              <span>Core Banking CIF</span>
              <strong style={{ color: '#00875a' }}>{cif}</strong>
            </div>
            <div className="info-row">
              <span>New Account Number</span>
              <strong style={{ letterSpacing: '1px' }}>{acct}</strong>
            </div>
            <div className="info-row">
              <span>Maker-Checker Governance</span>
              <span style={{ fontSize: '11px', color: '#6b778c' }}>Maker: RPA-AO-01 | Checker: Officer Sharma</span>
            </div>
            <div style={{ marginTop: '10px' }}>
              <button
                type="button"
                className="button primary"
                onClick={() => onPromptClick?.('Show my accounts and balance.')}
              >
                View Accounts & Balance ↗
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="info-row">
              <span>Verification Status</span>
              <strong>✓ Verified by Officer</strong>
            </div>
            <div className="info-row">
              <span>CBS Automation</span>
              <span>Headless Playwright Runner (Maker)</span>
            </div>
            <p className="muted" style={{ fontSize: '11px', margin: '8px 0 0' }}>
              RPA agent enters verified data into Finacle CBS with pre-submit DOM read-back validation.
            </p>
          </>
        )}
      </article>
    );
  }

  // 13. Secure Authentication Challenge (Out-of-band sign-in prompt)
  if (type === 'AUTH_CHALLENGE') {
    const cardTitle = pres.title || title || 'Sign In to Access Your Accounts';
    const message = pres.message || 'To view your personal account balance, transactions, cards, or make transfers, please sign in securely.';
    const buttonText = pres.button_text || 'Sign In to Kosh';

    if (isAuthenticated) {
      const displayName = user?.display_name || user?.username || 'Authenticated Customer';
      return (
        <article className="chat-result" style={{ borderLeft: '3px solid #166534', background: 'rgba(22, 101, 52, 0.05)', borderRadius: '8px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px', color: '#166534' }} role="img" aria-label="Verified">✅</span>
            <h3 style={{ margin: 0, color: '#166534', fontSize: '14px', fontWeight: 700 }}>Signed In & Verified</h3>
          </div>
          <p style={{ fontSize: '12px', color: '#374151', margin: '4px 0 0', lineHeight: 1.5 }}>
            You are securely authenticated as <strong>{displayName}</strong>. Your account services and banking tools are unlocked.
          </p>
        </article>
      );
    }
    return (
      <article className="chat-result" style={{ borderLeft: '3px solid #19382e', background: 'rgba(25, 56, 46, 0.04)', borderRadius: '8px', padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }} role="img" aria-label="Security">🔐</span>
          <h3 style={{ margin: 0, color: '#19382e', fontSize: '14px', fontWeight: 700 }}>{cardTitle}</h3>
        </div>
        <p style={{ fontSize: '12px', color: '#42526e', margin: '4px 0 12px', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              background: '#19382e',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onClick={() => {
              if (pres.action_url) {
                window.location.assign(pres.action_url);
              } else {
                window.dispatchEvent(new CustomEvent('open-login-modal', { detail: { tab: 'phone' } }));
              }
            }}
          >
            <span>🔐</span>
            <span>{buttonText}</span>
          </button>
          <button
            type="button"
            className="button secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500,
              padding: '8px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              background: '#ffffff',
              color: '#19382e',
              border: '1px solid #c1c7d0'
            }}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-login-modal', { detail: { tab: 'password' } }));
            }}
          >
            <span>Sign in with Password</span>
          </button>
        </div>
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#6b778c' }}>
          <span>🔒 Kosh never asks for passwords, PINs, or OTPs in chat. Sign in via the official secure prompt.</span>
        </div>
      </article>
    );
  }

  // 14. Cross-Sell / Pre-Approved Financial Recommendation Card
  if (type === 'APPLICATION_SUBMITTED') {
    return (
      <article className="chat-result">
        <h3>Application submitted</h3>
        <div className="info-row"><span>Product</span><strong>{pres.title}</strong></div>
        <div className="info-row"><span>Reference</span><strong>{pres.application_ref}</strong></div>
        <div className="info-row"><span>Status</span><strong>Awaiting bank officer review</strong></div>
        {pres.next_steps && <p style={{ marginTop: 10 }}>{pres.next_steps}</p>}
        <p style={{ marginTop: 6 }}><a href={`#/track/${encodeURIComponent(pres.application_ref || '')}`}>Track this application</a></p>
      </article>
    );
  }

  if (type === 'CROSS_SELL_OFFER') {
    const cardTitle = pres.title || title || 'Pre-Approved Recommendation';
    const badge = pres.badge || 'Exclusive Offer';
    const headline = pres.headline_rate || '';
    const specialOffer = pres.special_offer || '';
    const perks = pres.key_perks || [];
    const options = pres.options || [];
    const leadId = pres.lead_id || '';

    return (
      <article
        className="chat-result"
        style={{
          border: '1px solid #d4af37',
          borderLeft: '4px solid #b8860b',
          background: 'linear-gradient(135deg, rgba(254, 252, 232, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%)',
          borderRadius: '10px',
          padding: '16px',
          boxShadow: '0 4px 12px rgba(184, 134, 11, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }} role="img" aria-label="Star">✨</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#92400e',
                background: '#fef3c7',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid #fde68a',
              }}
            >
              {badge}
            </span>
          </div>
          {headline && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
              {headline}
            </span>
          )}
        </div>

        <h3 style={{ margin: '0 0 6px 0', color: '#1e293b', fontSize: '15px', fontWeight: 700 }}>
          {cardTitle}
        </h3>

        {specialOffer && (
          <p
            style={{
              fontSize: '12px',
              color: '#854d0e',
              background: 'rgba(254, 240, 138, 0.35)',
              padding: '8px 10px',
              borderRadius: '6px',
              margin: '0 0 10px 0',
              lineHeight: 1.45,
              fontWeight: 500,
              border: '1px dashed #facc15',
            }}
          >
            🔥 <strong>Special Incentive:</strong> {specialOffer}
          </p>
        )}

        {perks.length > 0 && (
          <ul
            style={{
              fontSize: '12px',
              color: '#334155',
              margin: '0 0 12px 0',
              paddingLeft: '18px',
              lineHeight: 1.5,
            }}
          >
            {perks.map((perk: string, idx: number) => (
              <li key={idx} style={{ marginBottom: '3px' }}>
                {perk}
              </li>
            ))}
          </ul>
        )}

        {options.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            {options.map((opt: any, idx: number) => (
              <button
                key={idx}
                type="button"
                className={`button ${idx === 0 ? 'primary' : 'secondary'}`}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: idx === 0 ? '#19382e' : '#ffffff',
                  color: idx === 0 ? '#ffffff' : '#19382e',
                  border: idx === 0 ? 'none' : '1px solid #cbd5e1',
                }}
                onClick={() => {
                  if (leadId) {
                    fetch(`/api/leads/${leadId}/action`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: opt.label }),
                    }).catch(() => {});
                  }
                  onPromptClick?.(opt.prompt || opt.label);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </article>
    );
  }

  // Generic fallback if presentation title or some key-values exist
  const entries = Object.entries(result).filter(
    ([k, v]) => !['presentation', 'type', 'name', 'timestamp', 'success', 'status'].includes(k) && typeof v !== 'object'
  );

  if (entries.length > 0) {
    return (
      <article className="chat-result">
        <h3>{title || 'Information'}</h3>
        {entries.map(([k, v], idx) => (
          <div key={idx} className="info-row">
            <span>{k.replace(/_/g, ' ')}</span>
            <strong>{String(v)}</strong>
          </div>
        ))}
      </article>
    );
  }

  return null;
};
