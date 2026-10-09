import React, { useEffect, useState } from 'react';
import { get, post } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useBanking } from '../../context/BankingContext';
import { Modal } from '../common/Modal';
import { Icon } from '../common/Icon';
import { formatRupees } from '../common/Formatters';
import { StepUpField, useStepUp } from '../app/StepUp';
import type { Product } from '../../types/products';

/**
 * Opening a savings account or booking a fixed deposit. Who is asking decides the form:
 * a visitor applies for savings with full KYC and documents; a signed-in customer opens another savings account or books
 * an FD after verifying their identity; a visitor asking for an FD is pointed to savings first. Details never pass through
 * chat: Mitra only opens this.
 */

const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];
const RELATIONSHIPS = ['SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'OTHER'];
const PROOFS: Record<string, string> = { AADHAAR: 'Aadhaar', PASSPORT: 'Passport', VOTER_ID: 'Voter ID', DRIVING_LICENSE: 'Driving licence' };
const MATURITY: Record<string, string> = {
  RENEW_PRINCIPAL_INTEREST: 'Renew principal and interest', RENEW_PRINCIPAL: 'Renew principal, pay out the interest',
  CLOSE_AND_CREDIT: 'Close and credit my account',
};
const TENURES = [6, 12, 24, 36, 60, 120];
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export interface Prefill { reapplied_from: string; product_id: string; fields: Record<string, string> }

export const AccountApplication: React.FC<{ product: Product; onClose: () => void; prefill?: Prefill }> = ({ product, onClose, prefill }) => {
  const { user } = useAuth();
  const customer = user?.role === 'CUSTOMER' && user.customer_id;
  if (product.category === 'deposits') return customer ? <DepositDialog product={product} onClose={onClose} /> : <FdNeedsAccount onClose={onClose} />;
  return customer ? <CustomerSavingsDialog product={product} onClose={onClose} /> : <SavingsApplicationForm product={product} onClose={onClose} prefill={prefill} />;
};

const DemoNotice = () => (
  <p className="k-note"><Icon name="info" /> Kosh is a product demo, not a bank. Use sample details and sample documents, never real ones.</p>);

const Done: React.FC<{ reference: string; heading: string; children: React.ReactNode; onClose: () => void }> = ({ reference, heading, children, onClose }) => (
  <div className="k-app-done" role="status">
    <Icon name="check" />
    <h3>{heading}</h3>
    <p>Your reference: <strong>{reference}</strong></p>
    {children}
    <div className="k-dialog-actions"><button type="button" className="k-btn primary" onClick={onClose}>Done</button></div>
  </div>);

/* ---------------- a visitor: savings with full KYC ---------------- */
type Docs = Record<string, { name: string; mime: string; data: string }>;
const read = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('The file could not be read'));
  reader.readAsDataURL(file);
});

const SavingsApplicationForm: React.FC<{ product: Product; onClose: () => void; prefill?: Prefill }> = ({ product, onClose, prefill }) => {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Record<string, string>>({ state: 'Maharashtra', ...(prefill?.fields || {}) });
  const [proof, setProof] = useState('AADHAAR');
  const [docs, setDocs] = useState<Docs>({});
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<any>(null);
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [key]: e.target.value });
  const field = (key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="k-field">{label}<input value={f[key] || ''} onChange={set(key)} required {...props} /></label>);
  const attach = (kind: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setError('Each document must be 8 MB or smaller.');
    setDocs({ ...docs, [kind]: { name: file.name, mime: file.type, data: await read(file) } });
  };
  const steps = ['About you', 'Address', 'Identity', 'Nominee', 'Review'];
  const next = (e: React.FormEvent) => { e.preventDefault(); setError(''); setStep(s => s + 1); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!docs.PAN || !docs[proof]) return setError('Upload your PAN card and your address proof.');
    setBusy(true);
    try {
      setDone(await post('/api/applications/account', {
        product_id: product.id, reapplied_from: prefill?.reapplied_from,
        fields: { ...f, declarations_accepted: agreed },
        documents: [{ document_type: 'PAN', mime_type: docs.PAN.mime, content_base64: docs.PAN.data },
          { document_type: proof, mime_type: docs[proof].mime, content_base64: docs[proof].data }],
      }));
    } catch (err: any) {
      setError(err.message || 'The application could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Open ${product.title}`} subtitle={done ? undefined : `Step ${step + 1} of ${steps.length}: ${steps[step]}`} wide>
      {done ? (
        <Done reference={done.reference} heading="Application received" onClose={onClose}>
          <p>A Kosh officer verifies your KYC and reviews it. Once approved, your account is opened and your welcome kit
            (user ID and account number) is prepared. Track it any time with your reference and mobile number.</p>
          <a className="k-btn outline" href={`#/track/${done.reference}`} onClick={onClose}>Track application</a>
        </Done>
      ) : (
        <form onSubmit={step < 4 ? next : submit} className="k-app-form">
          {prefill && step === 0 && <p className="k-note"><Icon name="refresh" /> Applying again after {prefill.reapplied_from}. Check the details,
            and enter your PAN and date of birth again.</p>}
          {step === 0 && <>
            {field('full_name', 'Full name (as on your PAN card)', { maxLength: 100 })}
            {field('date_of_birth', 'Date of birth', { type: 'date' })}
            {field('mobile', 'Mobile number', { inputMode: 'numeric', pattern: '[6-9][0-9]{9}', maxLength: 10, placeholder: '10 digits' })}
            {field('email', 'Email', { type: 'email', maxLength: 120 })}
          </>}
          {step === 1 && <>
            {field('address', 'Address (house, street, area)', { maxLength: 200 })}
            {field('city', 'City', { maxLength: 50 })}
            <label className="k-field">State<select value={f.state} onChange={set('state')}>{STATES.map(s => <option key={s}>{s}</option>)}</select></label>
            {field('pincode', 'PIN code', { inputMode: 'numeric', pattern: '[1-9][0-9]{5}', maxLength: 6 })}
          </>}
          {step === 2 && <>
            {field('pan_number', 'PAN', { maxLength: 10, pattern: '[A-Za-z]{5}[0-9]{4}[A-Za-z]', placeholder: 'ABCDE1234F' })}
            {field('document_last4', 'Last 4 digits of your Aadhaar', { inputMode: 'numeric', pattern: '[0-9]{4}', maxLength: 4 })}
            <label className="k-field">PAN card (photo or PDF)<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={attach('PAN')} required={!docs.PAN} />
              {docs.PAN && <small>{docs.PAN.name}</small>}</label>
            <label className="k-field">Address proof<select value={proof} onChange={e => setProof(e.target.value)}>
              {Object.entries(PROOFS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="k-field">{PROOFS[proof]} (photo or PDF)<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={attach(proof)} required={!docs[proof]} />
              {docs[proof] && <small>{docs[proof].name}</small>}</label>
            <DemoNotice />
          </>}
          {step === 3 && <>
            <p className="muted">Optional: who should receive the money in your account if something happens to you.</p>
            <label className="k-field">Nominee name<input value={f.nominee_name || ''} onChange={set('nominee_name')} maxLength={100} /></label>
            <label className="k-field">Relationship<select value={f.nominee_relationship || ''} onChange={set('nominee_relationship')}>
              <option value="">Choose</option>{RELATIONSHIPS.map(r => <option key={r} value={r}>{title(r)}</option>)}</select></label>
          </>}
          {step === 4 && <>
            <dl className="k-app-review">
              {[['Name', f.full_name], ['Date of birth', f.date_of_birth], ['Mobile', f.mobile], ['Email', f.email],
                ['Address', `${f.address}, ${f.city}, ${f.state} ${f.pincode}`], ['PAN', f.pan_number?.toUpperCase()],
                ['Documents', [docs.PAN && 'PAN card', docs[proof] && PROOFS[proof]].filter(Boolean).join(', ')],
                ['Nominee', f.nominee_name ? `${f.nominee_name} (${title(f.nominee_relationship || 'OTHER')})` : 'None']].map(([k, v]) =>
                <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
            </dl>
            <label className="k-check"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} required />
              <span>I confirm these details are true and consent to Kosh verifying my identity and documents (KYC).</span></label>
            <DemoNotice />
          </>}
          {error && <p role="alert" className="k-form-error"><Icon name="alert" />{error}</p>}
          <div className="k-dialog-actions">
            {step > 0 && <button type="button" className="k-btn outline" onClick={() => setStep(s => s - 1)}>Back</button>}
            <button type="submit" className="k-btn primary" disabled={busy}>{step < 4 ? 'Continue' : busy ? 'Submitting…' : 'Submit application'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
};

/* ---------------- a signed-in customer: another savings account ---------------- */
const CustomerSavingsDialog: React.FC<{ product: Product; onClose: () => void }> = ({ product, onClose }) => {
  const stepUp = useStepUp();
  const [nominee, setNominee] = useState('');
  const [relationship, setRelationship] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<any>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await stepUp.run(() => post('/api/customer/applications/account',
        { product_id: product.id, nominee_name: nominee, nominee_relationship: relationship }));
      if (result) setDone(result);
    } catch (err: any) {
      setError(err.message || 'The account could not be requested.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`Open ${product.title}`} subtitle="Another account under your existing customer ID">
      {done ? (
        <Done reference={done.reference} heading="Request received" onClose={onClose}>
          <p>A Kosh officer reviews it, then the account is opened in core banking and appears in your accounts.</p>
        </Done>
      ) : (
        <form onSubmit={submit} className="k-app-form">
          <p className="muted">Your KYC is already verified, so we only need a nominee (optional).</p>
          <label className="k-field">Nominee name<input value={nominee} onChange={e => setNominee(e.target.value)} maxLength={100} /></label>
          <label className="k-field">Relationship<select value={relationship} onChange={e => setRelationship(e.target.value)}>
            <option value="">Choose</option>{RELATIONSHIPS.map(r => <option key={r} value={r}>{title(r)}</option>)}</select></label>
          {stepUp.needed && <StepUpField otp={stepUp.otp} setOtp={stepUp.setOtp} />}
          {error && <p role="alert" className="k-form-error"><Icon name="alert" />{error}</p>}
          <div className="k-dialog-actions"><button type="submit" className="k-btn primary" disabled={busy}>
            {busy ? 'Submitting…' : stepUp.needed ? 'Verify and submit' : 'Request the account'}</button></div>
        </form>
      )}
    </Modal>
  );
};

/* ---------------- a signed-in customer: a fixed deposit ---------------- */
const DepositDialog: React.FC<{ product: Product; onClose: () => void }> = ({ product, onClose }) => {
  const { accounts, refreshOverview } = useBanking();
  const savings = accounts.filter(a => (a.type || a.account_type || '').toUpperCase() === 'SAVINGS' && a.status === 'ACTIVE');
  const stepUp = useStepUp();
  const [funding, setFunding] = useState(savings[0]?.id || '');
  const [amount, setAmount] = useState('25000');
  const [tenure, setTenure] = useState(12);
  const [maturity, setMaturity] = useState('RENEW_PRINCIPAL_INTEREST');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<any>(null);
  const rupees = Number(amount) || 0;
  const rate = parseFloat((product.headline_rate || '8.10').match(/[\d.]+/)?.[0] || '8.10');
  const maturityValue = rupees * Math.pow(1 + rate / 400, (tenure / 12) * 4);  // quarterly compounding, indicative

  // After booking, follow it: the robot books it in the core within a minute.
  useEffect(() => {
    if (!booking || ['OPENED', 'NOT_APPROVED'].includes(booking.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const mine = await get<{ applications: any[] }>('/api/customer/applications');
        const now = mine.applications.find(a => a.reference === booking.reference);
        if (now) {
          setBooking(now);
          if (now.status === 'OPENED') refreshOverview();
        }
      } catch { /* keep the last known state */ }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [booking, refreshOverview]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (rupees < 1000) return setError('The minimum deposit is ₹1,000.');
    setBusy(true);
    try {
      const result = await stepUp.run(() => post('/api/customer/applications/deposit', {
        product_id: product.id, funding_account_id: funding, amount_minor: Math.round(rupees * 100), tenure_months: tenure,
        maturity_instruction: maturity }));
      if (result) setBooking(result);
    } catch (err: any) {
      setError(err.message || 'The deposit could not be booked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Book ${product.title}`} subtitle={`${product.headline_rate || '8.10% p.a.'} · funded from your savings`}>
      {booking ? (
        <div className="k-app-done" role="status">
          <Icon name={booking.status === 'OPENED' ? 'check' : 'clock'} />
          <h3>{booking.status === 'OPENED' ? 'Fixed deposit opened' : 'Booking your deposit in core banking…'}</h3>
          <p>Reference <strong>{booking.reference}</strong>
            {booking.cbs?.fd_number && <> · deposit <strong>•••• {String(booking.cbs.fd_number).slice(-4)}</strong></>}</p>
          <p>{booking.status === 'OPENED' ? `${formatRupees(rupees)} has moved from your savings into the deposit.` : booking.next_step}</p>
          <div className="k-dialog-actions"><button type="button" className="k-btn primary" onClick={onClose}>Done</button></div>
        </div>
      ) : savings.length === 0 ? (
        <p className="k-note"><Icon name="info" /> You need an active savings account to fund a fixed deposit.</p>
      ) : (
        <form onSubmit={submit} className="k-app-form">
          <label className="k-field">Fund from<select value={funding} onChange={e => setFunding(e.target.value)}>
            {savings.map(a => <option key={a.id} value={a.id}>{a.name || 'Savings'} {a.account_number_masked} · {formatRupees((a.available_balance_minor ?? a.balance_paise) / 100)} available</option>)}
          </select></label>
          <label className="k-field">Amount (₹)<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} required /></label>
          <label className="k-field">Tenure<select value={tenure} onChange={e => setTenure(Number(e.target.value))}>
            {TENURES.map(m => <option key={m} value={m}>{m < 12 ? `${m} months` : `${m / 12} year${m > 12 ? 's' : ''}`}</option>)}</select></label>
          <label className="k-field">At maturity<select value={maturity} onChange={e => setMaturity(e.target.value)}>
            {Object.entries(MATURITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {rupees >= 1000 && <p className="muted">At {rate}% p.a. this grows to about <strong>{formatRupees(Math.round(maturityValue))}</strong> (indicative,
            quarterly compounding, before tax). The rate is fixed when the core books it.</p>}
          {stepUp.needed && <StepUpField otp={stepUp.otp} setOtp={stepUp.setOtp} />}
          {error && <p role="alert" className="k-form-error"><Icon name="alert" />{error}</p>}
          <div className="k-dialog-actions"><button type="submit" className="k-btn primary" disabled={busy}>
            {busy ? 'Booking…' : stepUp.needed ? 'Verify and book' : 'Book the deposit'}</button></div>
        </form>
      )}
    </Modal>
  );
};

const FdNeedsAccount: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal isOpen onClose={onClose} title="Fixed deposits are for Kosh customers">
    <p>A fixed deposit is funded from a Kosh savings account. Open a savings account first, or sign in if you already bank with Kosh.</p>
    <div className="k-dialog-actions">
      <a className="k-btn outline" href="#/products/savings" onClick={onClose}>See savings accounts</a>
      <button type="button" className="k-btn primary" onClick={() => { onClose(); window.dispatchEvent(new Event('open-login-modal')); }}>Sign in</button>
    </div>
  </Modal>
);
