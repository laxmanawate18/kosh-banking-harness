import React from 'react';
import { formatMoney } from '../common/Formatters';
import type { ChatPresentation } from '../../types/chat';
import { useAuth } from '../../context/AuthContext';
import { startVideoKyc } from '../../services/banking';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';

interface ChatPresentationCardProps {
  presentation?: ChatPresentation;
  toolResult?: any;
  onPromptClick?: (prompt: string) => void;
  onOpenWorkflow?: (workflowId: string) => void;
  onStartWorkflow?: (skillId: string) => void;
  onPaymentChallenge?: (challenge: any) => void;
}

const Row: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="info-row"><span>{label}</span><strong>{children}</strong></div>
);

// Simple list cards, checked in order: [type, result key, empty text, (item) => [label, value]].
const LIST_CARDS: [string, string, string | null, (x: any) => [string, string]][] = [
  ['TRANSACTION_LIST', 'transactions', 'No recent activity found.',
    (t) => [t.description || t.narration || t.note || 'Transaction', formatMoney(t.amount_minor ?? t.amount_paise ?? 0)]],
  ['ACCOUNT_SUMMARY', 'accounts', null,
    (a) => [`${a.name || 'Account'} ${a.account_number_masked ? `(${a.account_number_masked})` : ''}`, formatMoney(a.available_balance_minor ?? a.balance_paise ?? 0)]],
  ['BILL_LIST', 'bills', 'No bills currently due.',
    (b) => [b.biller_name || b.name || 'Biller', formatMoney(b.amount_minor ?? b.amount_paise ?? 0)]],
  ['SECURITY_ALERT', 'alerts', null, (a) => [a.title || a.message || 'Alert', a.status || 'Active']],
];

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

  for (const [listType, key, empty, row] of LIST_CARDS) {
    if (type !== listType && !Array.isArray(result[key])) continue;
    const items: any[] = (result[key] || pres[key] || []).slice(0, key === 'transactions' ? 8 : undefined);
    return (
      <article className="chat-result">
        <h3>{title}</h3>
        {empty && items.length === 0
          ? <p className="muted cr-empty">{empty}</p>
          : items.map((item, idx) => { const [label, value] = row(item); return <Row key={idx} label={label}>{value}</Row>; })}
      </article>
    );
  }

  // 5. Choice Selection (Interactive Options)
  if (type === 'CHOICE_SELECTION' || (result.options && Array.isArray(result.options))) {
    const options = result.options || pres.options || [];
    return (
      <article className="chat-result">
        <h3>{title}</h3>
        {pres.description && <p className="muted cr-note">{pres.description}</p>}
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
        <h3>{title}</h3>
        {kycStatus && <div className="info-row"><span>Status</span><Badge status={String(kycStatus)} /></div>}
        {pan && <Row label="PAN">{pan}</Row>}
        {reqId ? (
          <Row label="Request">{reqId}</Row>
        ) : (
          <div className="c-mt">
            <p className="muted cr-note">
              Scan documents, review prefilled details and complete declarations in your saved form.
            </p>
            <button
              type="button"
              className="k-btn primary sm"
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
              Open KYC form <Icon name="arrow-right" />
            </button>
          </div>
        )}
      </article>
    );
  }

  // Clarification / Missing parameters
  if (type === 'CLARIFICATION') {
    return (
      <article className="chat-result c-edge-warn">
        <h3>{title}</h3>
        {pres.message && <p className="muted cr-note">{pres.message}</p>}
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
        <h3>{isCompleted ? 'Approval verified' : title}</h3>
        {(challenge?.payee_name || challenge?.beneficiary_name) && (
          <Row label="Payee">{challenge.payee_name || challenge.beneficiary_name}</Row>
        )}
        {challenge?.amount_minor != null && <Row label="Amount">{formatMoney(challenge.amount_minor)}</Row>}
        {isCompleted ? (
          <div className="cr-ok"><Icon name="check" /><span>Approved &amp; verified</span></div>
        ) : (
          <button type="button" className="k-btn primary sm" onClick={() => onPaymentChallenge?.(challenge)}>
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
        <h3>{title}</h3>
        {payee && <Row label="Paid to">{payee}</Row>}
        {sourceAcc && <Row label="From">{sourceAcc}</Row>}
        {receipt?.amount_minor != null && <Row label="Amount">{formatMoney(receipt.amount_minor)}</Row>}
        {ref && <Row label="Reference">{ref}</Row>}
        <div className="cr-ok"><Icon name="check" /><span>Payment sent successfully</span></div>
      </article>
    );
  }

  // 9. Sentinel Policy Denial
  if (type === 'SENTINEL_DENIAL' || result.sentinel?.reason_codes) {
    const reasons = result.sentinel?.reason_codes || pres.sentinel?.reason_codes || [result.reason || 'Policy restriction'];
    return (
      <article className="chat-result">
        <h3>{title}</h3>
        {reasons.map((r: string, idx: number) => (
          <Row key={idx} label="Policy reason">{String(r).replace(/_/g, ' ')}</Row>
        ))}
      </article>
    );
  }

  // 10. Card Frozen
  if (type === 'CARD_FROZEN' || result.card) {
    const card = result.card || pres.card;
    return (
      <article className="chat-result">
        <h3>{title}</h3>
        <Row label="Card">{card?.card_number_masked || '•••• 9821'}</Row>
        <Row label="Status">Frozen</Row>
      </article>
    );
  }

  // 11. Banking Workflow Draft
  if (type === 'BANKING_WORKFLOW' || pres.workflow_id) {
    const wfId = result.id || pres.workflow_id || result.workflow_id;
    const wfName = result.name || pres.name || title;
    return (
      <article className="chat-result">
        <h3>{wfName}</h3>
        <p className="muted cr-note">
          Your saved form is ready. Review details and use the form to continue.
        </p>
        <button
          type="button"
          className="k-btn primary sm"
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
          Open form <Icon name="arrow-right" />
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

    // Customers see what happened to their account, not how the bank's systems did it.
    return (
      <article className={`chat-result ${isCompleted ? 'c-edge-ok' : 'c-edge-info'}`}>
        <div className="c-result-head">
          <h3>{isCompleted ? 'Your new account is open' : 'Opening your account'}</h3>
          <Badge status={isCompleted ? 'COMPLETED' : 'IN_PROGRESS'}>{isCompleted ? 'Open' : 'In progress'}</Badge>
        </div>
        <Row label="Application reference">{ref}</Row>
        {isCompleted ? (
          <>
            <Row label="Customer number">{cif}</Row>
            <Row label="Account number">{acct}</Row>
            <button type="button" className="k-btn primary sm c-mt" onClick={() => onPromptClick?.('Show my accounts and balance.')}>
              Show my accounts <Icon name="arrow-right" />
            </button>
          </>
        ) : (
          <>
            <Row label="Your documents">Verified by the bank</Row>
            <p className="muted cr-note">We are setting up your account now. This usually takes a few minutes.</p>
          </>
        )}
      </article>
    );
  }

  // 13. Secure Authentication Challenge (Out-of-band sign-in prompt)
  if (type === 'AUTH_CHALLENGE') {
    const message = pres.message || 'To view your personal account balance, transactions, cards, or make transfers, please sign in securely.';
    const buttonText = pres.button_text || 'Sign In to Kosh';

    if (isAuthenticated) {
      const displayName = user?.display_name || user?.username || 'Authenticated Customer';
      return (
        <article className="chat-result cr-auth ok">
          <div className="cr-auth-head">
            <span role="img" aria-label="Verified">✅</span>
            <h3>Signed In & Verified</h3>
          </div>
          <p>
            You are securely authenticated as <strong>{displayName}</strong>. Your account services and banking tools are unlocked.
          </p>
        </article>
      );
    }
    return (
      <article className="chat-result cr-auth">
        <div className="cr-auth-head">
          <span role="img" aria-label="Security">🔐</span>
          <h3>{title}</h3>
        </div>
        <p>{message}</p>
        <div className="cr-auth-actions">
          <button
            type="button"
            className="k-btn primary sm"
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
            className="k-btn outline sm"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-login-modal', { detail: { tab: 'password' } }));
            }}
          >
            <span>Sign in with Password</span>
          </button>
        </div>
        <div className="cr-auth-foot">
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
        <Row label="Product">{pres.title}</Row>
        <Row label="Reference">{pres.application_ref}</Row>
        <Row label="Status">Awaiting bank officer review</Row>
        {pres.next_steps && <p className="cr-note">{pres.next_steps}</p>}
        <p className="cr-note"><a className="k-link" href={`#/track/${encodeURIComponent(pres.application_ref || '')}`}>Track this application</a></p>
      </article>
    );
  }

  if (type === 'VIDEO_KYC') {
    return (
      <article className="chat-result">
        <strong>Video KYC (V-CIP)</strong>
        <p className="cr-note">Aadhaar e-KYC, PAN check and a short live video call with a Kosh official. Keep your PAN card ready.</p>
        {pres.sandbox && <p role="note" className="cr-note c-sandbox">Sandbox provider: this is a test. Nothing is really verified.</p>}
        <button type="button" className="k-btn primary sm" onClick={() => startVideoKyc().catch((e) => alert(e.message))}>Start video KYC</button>
      </article>
    );
  }

  if (type === 'CROSS_SELL_OFFER') {
    const badge = pres.badge || 'Exclusive Offer';
    const headline = pres.headline_rate || '';
    const specialOffer = pres.special_offer || '';
    const perks = pres.key_perks || [];
    const options = pres.options || [];
    const leadId = pres.lead_id || '';

    return (
      <article className="chat-result cr-offer">
        <div className="cr-offer-head">
          <div>
            <span role="img" aria-label="Star">✨</span>
            <span className="cr-offer-badge">{badge}</span>
          </div>
          {headline && <span className="cr-offer-rate">{headline}</span>}
        </div>

        <h3>{title}</h3>

        {specialOffer && (
          <p className="cr-offer-special">
            🔥 <strong>Special Incentive:</strong> {specialOffer}
          </p>
        )}

        {perks.length > 0 && (
          <ul>
            {perks.map((perk: string, idx: number) => <li key={idx}>{perk}</li>)}
          </ul>
        )}

        {options.length > 0 && (
          <div className="cr-offer-options">
            {options.map((opt: any, idx: number) => (
              <button
                key={idx}
                type="button"
                className={`button ${idx === 0 ? 'primary' : 'secondary'}`}
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
        <h3>{title}</h3>
        {entries.map(([k, v], idx) => <Row key={idx} label={k.replace(/_/g, ' ')}>{String(v)}</Row>)}
      </article>
    );
  }

  return null;
};
