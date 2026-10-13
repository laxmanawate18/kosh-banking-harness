import React, { useEffect, useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useI18n } from '../../i18n';
import { get, post } from '../../services/api';
import { startVideoKyc } from '../../services/banking';
import { RecentTransactions, TransactionDetailModal } from './RecentTransactions';
import { SpendingBreakdown } from './SpendingBreakdown';
import { formatMoney, formatDate, formatDateTime } from '../common/Formatters';
import { Icon } from '../common/Icon';
import { FeatureIcon, type FeatureIconName } from '../common/FeatureIcon';
import { Badge } from '../common/Badge';
import { Card3D } from '../common/Card3D';
import { LotusLoader } from '../common/LotusLoader';
import { LotusMark, Rangoli } from '../common/KoshLogo';
import { Stagger } from '../common/Animate';
import { HideBalancesToggle, Money } from '../app/Balance';
import { useSeenSince } from './seen';
import type { Challenge, Transaction } from '../../types/banking';

type PendingApproval = Challenge & { requested_via: 'MITRA' | 'ASSISTANT_APP' };

/** Payments waiting for the customer's Kavach approval, including ones an assistant app proposed through the agent gateway. */
const PendingApprovals: React.FC = () => {
  const { t } = useI18n();
  const { activeChallenge, setActiveChallenge } = useBanking();
  const [items, setItems] = useState<PendingApproval[]>([]);
  useEffect(() => {
    if (activeChallenge) return;  // refresh once the Kavach dialog closes
    get<{ approvals: PendingApproval[] }>('/api/portal/approvals').then(r => setItems(r.approvals)).catch(() => setItems([]));
  }, [activeChallenge]);
  if (!items.length) return null;
  return (
    <section className="k-alert warn" aria-label={t('Waiting for your approval')}>
      <Icon name="shield" />
      <div>
        <strong>{t('Waiting for your approval')}</strong>
        {items.map(item => (
          <p key={item.id}>
            {formatMoney(item.amount_minor || 0)} {t('to')} {item.payee_name} · {item.requested_via === 'ASSISTANT_APP' ? t('proposed by an assistant app') : t('proposed by Mitra')}{' '}
            <button type="button" className="k-btn primary sm" onClick={() => setActiveChallenge(item)}>{t('Review in Kavach')}</button>
          </p>
        ))}
      </div>
    </section>
  );
};

interface OverviewPageProps {
  onNavigate: (route: string) => void;
}

const ACTIONS: { id: string; label: string; icon: FeatureIconName; hl?: boolean }[] = [
  { id: 'upi', label: 'UPI', icon: 'upi', hl: true },
  { id: 'payments', label: 'Send money', icon: 'send' },
  { id: 'bills', label: 'Pay bills', icon: 'bills' },
  { id: 'beneficiaries', label: 'Add payee', icon: 'payee' },
];

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');

/** Previous session start if the user has one, else this session's start. */
function useLastLogin() {
  const [when, setWhen] = useState<string | null>(null);
  useEffect(() => {
    get<{ sessions: { created_at: string; current: boolean }[] }>('/api/portal/security/sessions')
      .then(({ sessions }) => {
        const sorted = [...sessions].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setWhen((sorted.find(s => !s.current) || sorted[0])?.created_at || null);
      })
      .catch(() => setWhen(null));
  }, []);
  return when;
}

type Offer = { product_id: string; title: string; headline_rate: string; reason: string };

/** Personalised offers from the bank's rules (consent, KYC, caps and suppression are enforced server-side). */
function PersonalOffers({ onNavigate, ask }: { onNavigate: (r: string) => void; ask: (q: string) => void }) {
  const { t, lang } = useI18n();
  const { startWorkflowById } = useBanking();
  const [state, setState] = useState<{ offers: Offer[]; blocked: string | null } | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  useEffect(() => { get(`/api/portal/offers?lang=${lang}`).then(setState).catch(() => setState(null)); }, [lang]);
  if (!state) return null;
  if (state.blocked === 'MARKETING_CONSENT_REQUIRED') {
    return (
      <button type="button" className="k-offer" onClick={() => onNavigate('settings')}>
        <Icon name="sparkles" /><span><strong>{t('Offers picked for you')}</strong>
          <small>{t('Turn on personalised offers in Settings to see offers based on your own banking. You can turn it off any time.')}</small></span>
      </button>
    );
  }
  const act = async (o: Offer, action: 'CLICKED' | 'DISMISSED' | 'APPLY') => {
    try {
      const res = await post<{ open_workflow?: string }>(`/api/portal/offers/${o.product_id}`, { action });
      if (res?.open_workflow) { await startWorkflowById(res.open_workflow); return; }  // instant product: open its form
      if (action === 'CLICKED') ask(t('Tell me more about the {title} and why it suits me.', { title: o.title }));
      else setDone(d => ({ ...d, [o.product_id]: action === 'APPLY' ? t('Applied. A Kosh officer will contact you shortly.') : t('Okay, we will not show this offer again.') }));
    } catch {
      setDone(d => ({ ...d, [o.product_id]: t('This offer is no longer available.') }));
    }
  };
  return (
    <>
      {state.offers.map(o => (
        <article key={o.product_id} className="k-offer nbo" aria-label={o.title}>
          <Icon name="gift" />
          <span>
            <strong>{o.title} · {o.headline_rate}</strong>
            <small>{o.reason}</small>
            {done[o.product_id] ? <small role="status"><b>{done[o.product_id]}</b></small> : (
              <span className="k-offer-actions">
                <button type="button" className="k-btn primary sm" onClick={() => act(o, 'APPLY')}>{t('Apply')}</button>
                <button type="button" className="k-btn sm" onClick={() => act(o, 'CLICKED')}>{t('Ask Mitra')}</button>
                <button type="button" className="k-link" onClick={() => act(o, 'DISMISSED')}>{t('Not interested')}</button>
              </span>
            )}
          </span>
        </article>
      ))}
    </>
  );
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigate }) => {
  const { t } = useI18n();
  const { overview, isLoading } = useBanking();
  const { user } = useAuth();
  const { sendMessage } = useChat();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const lastLogin = useLastLogin();
  const seenSince = useSeenSince(overview?.transactions);

  const accounts = overview?.accounts || [];
  const totalBalance = overview?.total_available_minor ?? accounts.reduce((s, a) => s + (a.available_balance_minor || 0), 0);

  if (isLoading || !overview) {
    return <LotusLoader label={t('Preparing your Kosh…')} />;
  }

  const transactions = overview.transactions || [];
  const dueBills = (overview.bills || []).filter(b => b.status === 'DUE' || b.status === 'OVERDUE');
  const kyc = overview.kyc || overview.customer?.kyc;
  const firstName = overview.customer?.first_name || user?.display_name?.split(' ')[0] || '';
  const card = overview.cards?.[0];
  const amt = (x: Transaction) => x.amount_minor ?? x.amount_paise ?? 0;
  const credits = transactions.filter(x => amt(x) > 0).reduce((s, x) => s + amt(x), 0);
  const debits = transactions.filter(x => amt(x) < 0).reduce((s, x) => s - amt(x), 0);
  const festive = !!document.documentElement.dataset.festival;

  const startKyc = () => {
    onNavigate('ai-banker');
    setTimeout(() => sendMessage(t('I would like to complete my pending KYC verification.')), 200);
  };
  const ask = (q: string) => { onNavigate('ai-banker'); setTimeout(() => sendMessage(q), 200); };

  const kycState = kyc && ['NOT_DONE', 'PENDING_RE_KYC', 'SUBMITTED_FOR_REVIEW'].includes(kyc.status) ? kyc.status : null;

  return (
    <div className="k-dash">
      <section className="k-dash-hero" aria-labelledby="dash-balance-label">
        <Rangoli className="k-hero-motif" />
        <div>
          <div className="k-dash-hello">{t('Namaste')}, <strong>{firstName}</strong></div>
          {lastLogin && <div className="k-last-login"><Icon name="clock" />{t('Last login {when}', { when: formatDateTime(lastLogin) })}</div>}
          <div className="k-balance-label" id="dash-balance-label">
            {t('Total available balance')}
            <HideBalancesToggle className="k-eye" />
          </div>
          <div className="k-balance"><Money value={totalBalance} /></div>
          <div className="k-dash-flow">
            <span className="in"><Icon name="arrow-down-left" />{t('In')} <Money value={credits} /></span>
            <span className="out"><Icon name="arrow-up-right" />{t('Out')} <Money value={debits} /></span>
            <span>{t('{n} accounts', { n: accounts.length })}</span>
          </div>
          <div className="k-dash-hero-actions">
            <button type="button" className="k-btn accent" onClick={() => onNavigate('upi')}><Icon name="upi" />{t('Pay with UPI')}</button>
            <button type="button" className="k-btn on-band" onClick={() => onNavigate('ai-banker')}><LotusMark size={22} />{t('Ask Mitra')}</button>
          </div>
        </div>
        <div className="k-dash-hero-card">
          <Card3D
            holder={(overview.customer?.display_name || user?.display_name || card?.cardholder_name || 'Kosh customer').toUpperCase()}
            number={card?.card_number_masked ? `•••• •••• ${card.card_number_masked}` : undefined}
            label={(card?.card_type || 'Kosh Platinum Debit').replace(/sentinel/i, 'Kosh')}
            frozen={card?.status === 'FROZEN' || card?.is_frozen}
            hint
          />
        </div>
      </section>

      <PendingApprovals />

      {kycState && (
        <section className={`k-alert ${kycState === 'NOT_DONE' ? 'danger' : kycState === 'SUBMITTED_FOR_REVIEW' ? 'calm' : 'warn'}`}>
          <Icon name={kycState === 'SUBMITTED_FOR_REVIEW' ? 'clock' : 'alert'} />
          <div>
            <strong>{kycState === 'NOT_DONE' ? t('Complete your KYC to unlock transfers') : kycState === 'SUBMITTED_FOR_REVIEW' ? t('Your Re-KYC is under review') : t('Periodic Re-KYC is due')}</strong>
            <p>{kycState === 'NOT_DONE'
              ? t('As per RBI rules, UPI, IMPS, NEFT and RTGS transfers and debit card use are paused until KYC is complete.')
              : kycState === 'SUBMITTED_FOR_REVIEW'
                ? t('Documents submitted. A bank officer will approve them shortly.')
                : t('Complete verification by {date} to keep your accounts active.', { date: formatDate(kyc?.due_date || '') })}</p>
          </div>
          {kycState !== 'SUBMITTED_FOR_REVIEW' && <button type="button" className="k-btn primary" onClick={startKyc}>{t('Complete KYC with Mitra')}</button>}
          {kycState === 'NOT_DONE' && <button type="button" className="k-link" onClick={() => startVideoKyc().catch(() => undefined)}>{t('Video KYC now')}</button>}
        </section>
      )}

      <Stagger as="nav" className="k-actions" aria-label={t('Quick actions')}>
        {ACTIONS.map(a => (
          <Stagger.Item as="button" tilt={4} key={a.id} type="button" className={`k-action fi-host ${a.hl ? 'hl' : ''}`} whileTap={{ scale: 0.97 }} onClick={() => onNavigate(a.id)}>
            <FeatureIcon name={a.icon} size={50} />
            <span>{t(a.label)}</span>
          </Stagger.Item>
        ))}
      </Stagger>

      <section aria-label={t('Offers for you')}>
        <div className="k-offers">
          {festive && (
            <button type="button" className="k-offer festive" onClick={() => ask(t('Tell me about festive offers on Kosh cards.'))}>
              <Icon name="sparkles" /><span><strong>{t('Festive cashback')}</strong><small>{t('10% back on shopping with Kosh cards this festival week, up to ₹1,500.')}</small></span>
            </button>
          )}
          <PersonalOffers onNavigate={onNavigate} ask={ask} />
        </div>
      </section>

      <Stagger as="section" className="k-acc-grid" aria-label={t('Your accounts')}>
        {accounts.map(a => (
          <Stagger.Item as="article" tilt={3} key={a.id} className="k-acc">
            <header>
              <span className="k-acc-type">{t(titleCase(a.type || a.account_type || 'SAVINGS'))}</span>
                <Badge status={a.status} />
            </header>
            <h3>{a.name || t('Savings account')}</h3>
            <span className="k-acc-no">{a.account_number_masked || '•••• 0000'}{a.ifsc_code ? ` · ${a.ifsc_code}` : ''}</span>
            <strong className="k-acc-bal"><Money value={a.available_balance_minor ?? 0} /></strong>
            <button type="button" className="k-link" onClick={() => onNavigate('accounts')}>{t('Details and statements')} <Icon name="arrow-right" /></button>
          </Stagger.Item>
        ))}
      </Stagger>

      <div className="k-dash-grid">
        <section className="k-panel">
          <header className="k-panel-head">
            <div><h2>{t('Recent transactions')}</h2><p>{t('Your latest account activity')}</p></div>
            <button type="button" className="k-link" onClick={() => onNavigate('transactions')}>{t('View all')} <Icon name="arrow-right" /></button>
          </header>
          <RecentTransactions transactions={transactions} compact newSince={seenSince} onSelectTransaction={setSelectedTx} />
        </section>

        <div className="k-dash-side">
          <section className="k-panel">
            <header className="k-panel-head"><div><h2>{t('Where your money goes')}</h2><p>{t('By category')}</p></div></header>
            <SpendingBreakdown transactions={transactions} />
          </section>

          <section className="k-panel">
            <header className="k-panel-head">
              <div><h2>{t('Coming up')}</h2><p>{t('Bills due')}</p></div>
              <button type="button" className="k-link" onClick={() => onNavigate('bills')}>{t('All bills')} <Icon name="arrow-right" /></button>
            </header>
            {dueBills.length ? dueBills.map(b => (
              <div key={b.id} className="k-bill">
                <span className="k-bill-icon"><Icon name="utilities" /></span>
                <div><strong>{b.biller_name}</strong><small>{t('Due {date}', { date: formatDate(b.due_date) })}</small></div>
                <span className="k-bill-amt">{formatMoney(b.amount_minor ?? b.amount_paise)}</span>
                <button type="button" className="k-btn primary sm" onClick={() => onNavigate('bills')}>{t('Pay')}</button>
              </div>
            )) : (
              <div className="k-empty"><Icon name="check" /><strong>{t('You are all caught up')}</strong><small>{t('No bills due right now.')}</small></div>
            )}
          </section>

          <aside className="k-kavach-tip">
            <LotusMark size={34} />
            <div>
              <strong>{t('Sentinel is watching out for you')}</strong>
              <p>{t('Every payment is checked against your instructions. Anything unusual waits for your approval.')}</p>
            </div>
          </aside>
        </div>
      </div>

      {selectedTx && <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  );
};
