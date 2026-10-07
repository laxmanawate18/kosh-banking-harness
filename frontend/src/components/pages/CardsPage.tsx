import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { Card3D } from '../common/Card3D';
import { PageHeader } from '../common/PageHeader';
import { formatMoney } from '../common/Formatters';
import { submitServiceRequest } from '../../services/banking';
import { LotusLoader } from '../common/LotusLoader';
import { ServiceRequestDialog, type ServiceSpec } from '../app/ServiceRequestDialog';

interface CardsPageProps {
  onNavigate?: (route: string) => void;
  onOpenService?: (serviceId: string) => void;
}

type Controls = { online: boolean; international: boolean; contactless: boolean; atm: boolean; limit: string };
const LIMITS = ['10000', '25000', '50000', '100000'];
const key = (id: string) => `kosh.cardControls.${id}`;
/** Saved choices on this device, else the bank's current settings (the limit starts at the card's real daily limit). */
const load = (card: any): Controls => {
  const limit = String(Math.round((card.daily_limit_minor ?? card.daily_limit_paise ?? 2_500_000) / 100));
  return { online: true, international: false, contactless: true, atm: true, limit: LIMITS.includes(limit) ? limit : '25000',
    ...JSON.parse(localStorage.getItem(key(card.id)) || '{}') };
};

export const CardsPage: React.FC<CardsPageProps> = () => {
  const { t } = useI18n();
  const { overview, toggleCardFreeze } = useBanking();
  const cards = overview?.cards || [];
  const accounts = overview?.accounts || [];
  const name = overview?.customer?.display_name || '';
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [spec, setSpec] = useState<ServiceSpec | null>(null);

  // Until the accounts arrive, say so instead of claiming there is nothing here.
  if (!overview) return <LotusLoader label={t('Loading your cards…')} />;

  const freeze = async (card: any, frozen: boolean) => {
    setBusy(card.id);
    setError('');
    try {
      await toggleCardFreeze(card.id, !frozen);
    } catch (err: any) {
      setError(err.message || t('Could not update the card. Please try again.'));
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title={t('Cards')} subtitle={t('Freeze your card in one tap and choose where it works.')} />
      <div className="k-page-stack">
      {error && <div className="k-alert danger" role="alert"><Icon name="alert" /><div><p>{error}</p></div></div>}
      {cards.length === 0 && <div className="k-card empty"><Icon name="cards" /><h3>{t('No cards yet')}</h3></div>}
      {cards.map((c: any) => (
        <CardBlock key={c.id} card={c} name={name} account={accounts.find(a => a.id === c.account_id)?.name}
          busy={busy === c.id} onFreeze={freeze} onService={setSpec} />
      ))}
      </div>
      <ServiceRequestDialog spec={spec} onClose={() => setSpec(null)} />
    </>
  );
};

const CardBlock: React.FC<{
  card: any; name: string; account?: string; busy: boolean;
  onFreeze: (card: any, frozen: boolean) => void; onService: (s: ServiceSpec) => void;
}> = ({ card, name, account, busy, onFreeze, onService }) => {
  const { t } = useI18n();
  const frozen = card.status === 'FROZEN' || card.is_frozen;
  const last4 = String(card.card_number_masked || card.card_number || '0000').slice(-4);
  const [controls, setControls] = useState<Controls>(() => load(card));
  const [saved, setSaved] = useState<Controls>(() => load(card));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = JSON.stringify(controls) !== JSON.stringify(saved);

  const toggles: [keyof Controls, string, string, string][] = [
    ['online', 'online', t('Online payments'), t('Shopping on websites and apps')],
    ['international', 'globe', t('International use'), t('Payments and ATM withdrawals abroad')],
    ['contactless', 'contactless', t('Contactless (tap and pay)'), t('Up to ₹5,000 per tap')],
    ['atm', 'rupee', t('ATM withdrawals'), t('Cash at any ATM in India')],
  ];

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const on = (k: keyof Controls) => (controls[k] ? 'on' : 'off');
      await submitServiceRequest({
        service_id: 'P1-10',
        data: {
          account_id: card.account_id,
          details: `Card ${last4} controls: online ${on('online')}, international ${on('international')}, contactless ${on('contactless')}, ATM ${on('atm')}, daily limit ₹${controls.limit}`,
        },
      });
      localStorage.setItem(key(card.id), JSON.stringify(controls));
      setSaved(controls);
      setMsg(t('Card controls saved.'));
    } catch (err: any) {
      setMsg(err.message || t('Could not save card controls.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="k-two c-card-block">
      <div className="k-page-stack">
        <div className="card-surface">
          <Card3D holder={name.toUpperCase()} number={`•••• •••• •••• ${last4}`} interactive hint label={(card.card_type || 'Kosh Platinum Debit').replace(/sentinel/i, 'Kosh')} frozen={frozen} />
        </div>
        <section className="k-panel">
          <div className="k-panel-body c-pt">
            <ul className="k-list">
              <li><span>{t('Status')}</span><Badge status={frozen ? 'FROZEN' : 'ACTIVE'} /></li>
              <li><span>{t('Linked account')}</span><strong>{account || t('Primary account')}</strong></li>
              <li><span>{t('Network')}</span><strong>{card.network || card.card_network || 'RuPay'}</strong></li>
              <li><span>{t('Current daily limit')}</span><strong>{formatMoney(card.daily_limit_minor ?? card.daily_limit_paise ?? 2_500_000)}</strong></li>
            </ul>
            {frozen ? (
              <button type="button" className="k-btn wide primary c-mt" onClick={() => onService({
                serviceId: 'P1-10', title: t('Request unfreeze'), subtitle: t('For your safety, the bank confirms unfreezing. It usually takes a few minutes.'),
                details: () => `Unfreeze card ${last4}`,
              })}>
                <Icon name="undo" />{t('Request unfreeze')}
              </button>
            ) : (
              <button type="button" className="k-btn wide danger c-mt" disabled={busy} onClick={() => onFreeze(card, frozen)}>
                <Icon name="freeze" />{busy ? t('Updating…') : t('Freeze card')}
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="k-panel">
        <header className="k-panel-head"><div><h2>{t('Card controls')}</h2><p>{t('Turn off what you do not use. Changes apply within minutes.')}</p></div></header>
        <div className="k-panel-body">
          {frozen && (
            <div className="k-note warn c-mb">
              <Icon name="freeze" />
              <span>{t('Your card is frozen, so it cannot be used anywhere. These controls apply again once the card is unfrozen.')}</span>
            </div>
          )}
          <fieldset className="c-controls" disabled={frozen}>
          <legend className="sr-only">{t('Card controls')}</legend>
          {toggles.map(([k, icon, title, sub]) => (
            <label key={k} className="k-toggle-row">
              <div><Icon name={icon} /><div><strong>{title}</strong><small>{sub}</small></div></div>
              <input type="checkbox" className="k-switch" checked={controls[k] as boolean}
                onChange={e => setControls(c => ({ ...c, [k]: e.target.checked }))} />
            </label>
          ))}
          <label className="k-field c-mt">
            {t('Daily spending limit')}
            <select value={controls.limit} onChange={e => setControls(c => ({ ...c, limit: e.target.value }))}>
              {LIMITS.map(v => <option key={v} value={v}>{formatMoney(Number(v) * 100)}</option>)}
            </select>
          </label>
          </fieldset>
          {msg && <p role="status" className="form-hint">{msg}</p>}
          <button type="button" className="k-btn primary wide" disabled={!dirty || saving || frozen} onClick={save}>
            {saving ? t('Saving…') : dirty ? t('Save controls') : t('No changes to save')}
          </button>
          <div className="c-card-more">
            <button type="button" className="k-btn outline wide" onClick={() => onService({ serviceId: 'P1-09', title: t('Set a new card PIN'), subtitle: t('You will get a secure link to set your PIN.'), details: () => `Regenerate PIN for card ${last4}` })}>
              <Icon name="key" />{t('Set a new PIN')}
            </button>
            <button type="button" className="k-btn outline wide" onClick={() => onService({
              serviceId: 'P1-08', title: t('Replace card'), subtitle: t('Your current card stops working once the new one is issued.'),
              fields: [{ name: 'reason', label: t('Reason'), type: 'select', options: [['Damaged', t('Damaged')], ['Lost', t('Lost')], ['Stolen', t('Stolen')]] }],
              details: d => `Replace card ${last4}: ${d.reason}`,
            })}>
              <Icon name="cards" />{t('Replace card')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
