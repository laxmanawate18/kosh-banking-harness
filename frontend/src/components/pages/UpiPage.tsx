import React, { useEffect, useMemo, useRef, useState } from 'react';
import { renderSVG } from 'uqr';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { RecentTransactions } from '../overview/RecentTransactions';
import { parseUpi } from '../../upi';
import { useStepUp, StepUpField } from '../app/StepUp';

interface UpiPageProps {
  onNavigate: (route: string) => void;
  onSendMoney: (beneficiaryId: string) => void;
}

export const UpiPage: React.FC<UpiPageProps> = ({ onNavigate, onSendMoney }) => {
  const { t } = useI18n();
  const { overview, addBeneficiary, beneficiaries } = useBanking();
  const customer: any = overview?.customer || {};
  const name = customer.display_name || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Kosh customer';
  const upiId = `${(customer.first_name || 'kosh').toLowerCase()}.${(customer.last_name || 'user').toLowerCase()}@kosh`.replace(/[^a-z0-9.@-]/g, '');
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [target, setTarget] = useState<{ pa: string; pn: string; am?: string } | null>(null);
  const [manual, setManual] = useState({ pa: '', pn: '' });
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const step = useStepUp();

  const payload = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&cu=INR${Number(amount) > 0 ? `&am=${Number(amount).toFixed(2)}` : ''}`;
  const qr = useMemo(() => renderSVG(payload, { border: 1, pixelSize: 1, whiteColor: '#ffffff', blackColor: '#0e0f12' }), [payload]);
  const upiTx = (overview?.transactions || []).filter(x => /upi/i.test(x.description || '') || x.category === 'P2P_TRANSFER');
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  const copy = async () => {
    await navigator.clipboard?.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const share = () => navigator.share?.({ title: t('Pay me on UPI'), text: `${name} · ${upiId}`, url: payload }).catch(() => {});

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    const Detector = (window as any).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
      stream = s;
      const video = videoRef.current!;
      video.srcObject = s;
      video.play();
      const tick = async () => {
        const codes = await detector.detect(video).catch(() => []);
        const hit = codes.map((c: any) => parseUpi(c.rawValue)).find(Boolean);
        if (hit) { setTarget(hit); setScanning(false); return; }
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => { setScanError(t('Camera access was blocked. Enter the UPI ID instead.')); setScanning(false); });
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(tr => tr.stop()); };
  }, [scanning]);

  const payTarget = async (to: { pa: string; pn: string }) => {
    setBusy(true);
    try {
      const existing = beneficiaries.find((b: any) => b.upi_id === to.pa);
      const row: any = existing || await step.run(() => addBeneficiary({ name: to.pn, account_number: to.pa, nickname: to.pa }));
      if (row) onSendMoney(row.id);
    } catch (err: any) {
      setScanError(err.message || t('Could not add this payee.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="k-app-page">
      <header className="k-app-head">
        <h1>{t('UPI')}</h1>
        <p>{t('Receive money with your QR code, or scan any UPI QR to pay. Sentinel checks every payment.')}</p>
      </header>

      <div className="k-two">
        <section className="k-panel">
          <header className="k-panel-head"><div><h2>{t('Receive money')}</h2><p>{t('Works with every UPI app')}</p></div></header>
          <div className="k-panel-body">
            <div className="k-upi-id">
              <span>{upiId}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="k-btn sm outline" onClick={copy}><Icon name={copied ? 'check' : 'copy'} />{copied ? t('Copied') : t('Copy')}</button>
                {'share' in navigator && <button type="button" className="k-btn sm outline" onClick={share}><Icon name="share" />{t('Share')}</button>}
              </span>
            </div>
            <div className="k-qr" role="img" aria-label={t('UPI QR code for {id}', { id: upiId })} dangerouslySetInnerHTML={{ __html: qr }} />
            <label className="k-field">
              {t('Request a specific amount (optional)')}
              <input inputMode="decimal" placeholder="₹ 0" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
            <p className="k-product-fine">{t('Money received lands in {account}.', { account: overview?.accounts?.[0]?.name || t('your primary account') })}</p>
          </div>
        </section>

        <section className="k-panel">
          <header className="k-panel-head"><div><h2>{t('Scan and pay')}</h2><p>{t('Point your camera at a UPI QR')}</p></div></header>
          <div className="k-panel-body">
            {scanning ? (
              <div className="k-scan">
                <video ref={videoRef} muted playsInline aria-label={t('Camera preview')} />
                <button type="button" className="k-btn outline wide" style={{ marginTop: 12 }} onClick={() => setScanning(false)}>{t('Cancel')}</button>
              </div>
            ) : target ? (
              <div>
                <div className="k-note"><Icon name="check" /><span>{t('Pay {name}', { name: target.pn })} · <strong>{target.pa}</strong>{target.am ? ` · ₹${target.am}` : ''}</span></div>
                <div className="k-dialog-actions">
                  <button type="button" className="k-btn outline" onClick={() => setTarget(null)}>{t('Scan again')}</button>
                  <button type="button" className="k-btn primary" disabled={busy} onClick={() => payTarget(target)}>{t('Continue to pay')}</button>
                </div>
              </div>
            ) : (
              <>
                {canScan && <button type="button" className="k-btn accent wide lg" onClick={() => { setScanError(''); setScanning(true); }}><Icon name="scan" />{t('Scan QR code')}</button>}
                <form onSubmit={e => { e.preventDefault(); payTarget({ pa: manual.pa.trim(), pn: manual.pn.trim() || manual.pa.split('@')[0] }); }} style={{ marginTop: canScan ? 20 : 0 }}>
                  <label className="k-field">
                    {t('Or enter a UPI ID')}
                    <input value={manual.pa} onChange={e => setManual(m => ({ ...m, pa: e.target.value }))} placeholder="name@bank" pattern="^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,63}$" required />
                  </label>
                  <label className="k-field">
                    {t('Payee name')}
                    <input value={manual.pn} onChange={e => setManual(m => ({ ...m, pn: e.target.value }))} />
                  </label>
                  <button type="submit" className="k-btn primary wide" disabled={busy}>{t('Continue to pay')}</button>
                </form>
              </>
            )}
            {step.needed && <form onSubmit={e => { e.preventDefault(); payTarget(target || { pa: manual.pa.trim(), pn: manual.pn.trim() || manual.pa.split('@')[0] }); }}>
              <StepUpField otp={step.otp} setOtp={step.setOtp} />
              <button type="submit" className="k-btn primary wide" disabled={busy}>{t('Verify and continue')}</button>
            </form>}
            {scanError && <div className="form-error" role="alert">{scanError}</div>}
            <div className="k-note warn" style={{ marginTop: 16 }}>
              <Icon name="alert" />
              <span>{t('You never enter your UPI PIN to receive money. New payees can receive up to ₹25,000 in their first 24 hours.')}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="k-panel">
        <header className="k-panel-head">
          <div><h2>{t('UPI activity')}</h2><p>{t('Daily UPI limit ₹1,00,000')}</p></div>
          <button type="button" className="k-link" onClick={() => onNavigate('transactions')}>{t('All transactions')} <Icon name="arrow-right" /></button>
        </header>
        <RecentTransactions transactions={upiTx} compact />
      </section>
    </div>
  );
};
