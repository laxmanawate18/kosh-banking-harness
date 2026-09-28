import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { Card3D } from '../common/Card3D';
import { formatMoney } from '../common/Formatters';
import { submitServiceRequest } from '../../services/banking';
import { ServiceRequestDialog, type ServiceSpec } from '../app/ServiceRequestDialog';

interface CardsPageProps {
  onNavigate?: (route: string) => void;
  onOpenService?: (serviceId: string) => void;
}

type Controls = { online: boolean; international: boolean; contactless: boolean; atm: boolean; limit: string };
const DEFAULTS: Controls = { online: true, international: false, contactless: true, atm: true, limit: '25000' };
const key = (id: string) => `kosh.cardControls.${id}`;
const load = (id: string): Controls => ({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(key(id)) || '{}') });

export const CardsPage: React.FC<CardsPageProps> = () => {
  const { t } = useI18n();
  const { overview, toggleCardFreeze } = useBanking();
  const cards = overview?.cards || [];
  const accounts = overview?.accounts || [];
  const name = overview?.customer?.display_name || '';
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [spec, setSpec] = useState<ServiceSpec | null>(null);

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
    <div className="k-app-page">
      <header className="k-app-head">
        <h1>{t('Cards')}</h1>
        <p>{t('Freeze your card in one tap and choose where it works.')}</p>
      </header>
      {error && <div className="k-alert danger" role="alert"><Icon name="alert" /><div><p>{error}</p></div></div>}
      {cards.length === 0 && <div className="k-empty k-card"><Icon name="cards" /><strong>{t('No cards yet')}</strong></div>}
      {cards.map((c: any) => (
        <CardBlock key={c.id} card={c} name={name} account={accounts.find(a => a.id === c.account_id)?.name}
          busy={busy === c.id} onFreeze={freeze} onService={setSpec} />
      ))}
      <ServiceRequestDialog spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
};

const CardBlock: React.FC<{
  card: any; name: string; account?: string; busy: boolean;
  onFreeze: (card: any, frozen: boolean) => void; onService: (s: ServiceSpec) => void;
}> = ({ card, name, account, busy, onFreeze, onService }) => {
  const { t } = useI18n();
  const frozen = card.status === 'FROZEN' || card.is_frozen;
  const last4 = String(card.card_number_masked || card.card_number || '0000').slice(-4);
  const [controls, setControls] = useState<Controls>(() => load(card.id));
  const [saved, setSaved] = useState<Controls>(() => load(card.id));
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
    <div className="k-two">
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card-surface" style={{ display: 'grid', placeItems: 'center' }}>
          <Card3D holder={name.toUpperCase()} number={`•••• •••• •••• ${last4}`} label={(card.card_type || 'Kosh Platinum Debit').replace(/sentinel/i, 'Kosh')} frozen={frozen} />
        </div>
        <section className="k-panel">
          <div className="k-panel-body" style={{ paddingTop: 18 }}>
            <ul className="k-list">
              <li><span>{t('Status')}</span><Badge status={frozen ? 'FROZEN' : 'ACTIVE'}>{frozen ? t('Frozen') : t('Active')}</Badge></li>
              <li><span>{t('Linked account')}</span><strong>{account || t('Primary account')}</strong></li>
              <li><span>{t('Network')}</span><strong>{card.network || card.card_network || 'RuPay'}</strong></li>
              <li><span>{t('Current daily limit')}</span><strong>{formatMoney(card.daily_limit_minor ?? card.daily_limit_paise ?? 2_500_000)}</strong></li>
            </ul>
            {frozen ? (
              <button type="button" className="k-btn wide primary" style={{ marginTop: 14 }} onClick={() => onService({
                serviceId: 'P1-10', title: t('Request unfreeze'), subtitle: t('For your safety, the bank confirms unfreezing. It usually takes a few minutes.'),
                details: () => `Unfreeze card ${last4}`,
              })}>
                <Icon name="undo" />{t('Request unfreeze')}
              </button>
            ) : (
              <button type="button" className="k-btn wide danger" style={{ marginTop: 14 }} disabled={busy} onClick={() => onFreeze(card, frozen)}>
                <Icon name="freeze" />{busy ? t('Updating…') : t('Freeze card')}
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="k-panel">
        <header className="k-panel-head"><div><h2>{t('Card controls')}</h2><p>{t('Turn off what you do not use. Changes apply within minutes.')}</p></div></header>
        <div className="k-panel-body">
          {toggles.map(([k, icon, title, sub]) => (
            <label key={k} className="k-toggle-row">
              <div><Icon name={icon} /><div><strong>{title}</strong><small>{sub}</small></div></div>
              <input type="checkbox" className="k-switch" checked={controls[k] as boolean} disabled={frozen}
                onChange={e => setControls(c => ({ ...c, [k]: e.target.checked }))} />
            </label>
          ))}
          <label className="k-field" style={{ marginTop: 10 }}>
            {t('Daily spending limit')}
            <select value={controls.limit} disabled={frozen} onChange={e => setControls(c => ({ ...c, limit: e.target.value }))}>
              {['10000', '25000', '50000', '100000'].map(v => <option key={v} value={v}>{formatMoney(Number(v) * 100)}</option>)}
            </select>
          </label>
          {msg && <p role="status" className="form-hint">{msg}</p>}
          <button type="button" className="k-btn primary wide" disabled={!dirty || saving || frozen} onClick={save}>
            {saving ? t('Saving…') : t('Save controls')}
          </button>
          <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
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
