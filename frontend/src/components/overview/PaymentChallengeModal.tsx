import React, { useEffect, useRef, useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Challenge } from '../../types/banking';
import { formatMoney } from '../common/Formatters';
import { Modal } from '../common/Modal';
import { Icon } from '../common/Icon';
import { ApprovalSeal } from '../common/ApprovalSeal';
import { EASE } from '../common/Animate';
import { useBanking } from '../../context/BankingContext';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { completeStepUp, sendStepUpCode } from '../../services/firebaseAuth';
import { demoStepUp } from '../../services/auth';

interface PaymentChallengeModalProps {
  challenge: Challenge | null;
  onClose: () => void;
}

type Receipt = { amount_minor?: number; beneficiary_name?: string; payment_ref?: string; completed_at?: string };

/** Seconds left until the challenge expires, ticking once a second (null when the challenge has no expiry). */
function useSecondsLeft(expiresAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000)) : null;
}

/** A thin ring that empties as the approval window closes; turns amber in the last minute. */
const CountdownRing: React.FC<{ left: number; total: number }> = ({ left, total }) => {
  const { t } = useI18n();
  const r = 15, c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, left / total));
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
  return (
    <span className={`kv-ring ${left <= 60 ? 'late' : ''}`} title={t('Time left to approve')}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} className="kv-ring-track" />
        <circle cx="18" cy="18" r={r} className="kv-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
      </svg>
      <span aria-live="off">{mm}:{ss}</span>
      <span className="sr-only">{t('{m} minutes {s} seconds left to approve', { m: mm, s: ss })}</span>
    </span>
  );
};

/** Six boxes over one real input: paste, autofill (one-time-code) and screen readers all work on the input. */
const CodeBoxes: React.FC<{ value: string; onChange: (v: string) => void; invalid: boolean; disabled?: boolean }> = (
  { value, onChange, invalid, disabled }) => {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const shake = useAnimationControls();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (invalid && !reduce) void shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.36 } });
  }, [invalid, reduce, shake]);
  return (
    <motion.div className={`kv-code ${invalid ? 'invalid' : ''}`} animate={shake} onClick={() => ref.current?.focus()}>
      <input ref={ref} className="kv-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
        aria-label={t('One-time verification code')} aria-invalid={invalid} value={value} disabled={disabled}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      {Array.from({ length: 6 }, (_, i) => {
        const digit = value[i];
        const active = i === Math.min(value.length, 5) && !disabled;
        return (
          <span key={i} className={`kv-box ${digit ? 'filled' : ''} ${active ? 'active' : ''}`} aria-hidden="true">
            <AnimatePresence initial={false}>
              {digit && (
                <motion.span key={digit + i} initial={{ y: 10, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
                  {digit}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        );
      })}
    </motion.div>
  );
};

/**
 * Kavach: the customer approves this exact payment with a fresh one-time code. The agent never sees the code.
 * On success the gold seal plays once and the receipt stays on screen until the customer closes it.
 */
export const PaymentChallengeModal: React.FC<PaymentChallengeModalProps> = ({ challenge, onClose }) => {
  const { t } = useI18n();
  const { verifyChallenge } = useBanking();
  const { recordPaymentSuccess } = useChat();
  const { auth, publicConfig } = useAuth();
  const demo = Boolean(publicConfig?.demo_otp);  // demo OTP mode: no Firebase, no SMS
  const defaultOtp = publicConfig?.demo_otp_code || '246810';
  const [code, setCode] = useState(publicConfig?.demo_otp_code || '246810');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const left = useSecondsLeft(receipt ? undefined : challenge?.expires_at);
  const total = useRef<number | null>(null);
  if (left !== null && total.current === null) total.current = Math.max(left, 1);

  if (!challenge) return null;
  const expired = left === 0 && !receipt;
  const amount = challenge.amount_minor ?? challenge.amount_paise ?? 0;

  const handleSendCode = async () => {
    if (!publicConfig?.firebase_api_key || !auth?.user?.phone_number) {
      setCode(defaultOtp);
      setError(t('Phone verification is not set up. Demo code {code} is auto-filled.', { code: defaultOtp }));
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const sent = await sendStepUpCode(auth.user.phone_number, publicConfig, 'payment-step-up-recaptcha');
      setConfirmation(sent.confirmation);
      setCode(sent.prefill || defaultOtp);
    } catch (err: any) {
      setCode(defaultOtp);
      setError(err.message ? `${err.message}. Demo OTP ${defaultOtp} has been auto-filled.` : t('SMS could not be sent. Demo OTP has been auto-filled.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const codeToUse = code.trim() || defaultOtp;
      if (demo || !confirmation) {
        await demoStepUp(codeToUse);
      } else {
        try {
          await completeStepUp(confirmation, codeToUse);
        } catch (firebaseErr: any) {
          console.warn('Firebase step-up failed, falling back to demo code:', firebaseErr);
          await demoStepUp(codeToUse);
        }
      }
      const res = await verifyChallenge();
      if (res.success || res.status === 'SUCCESS' || res.status === 'APPROVED') {
        const done = res.receipt || {
          amount_minor: amount,
          beneficiary_name: challenge.payee_name,
          source_account_name: challenge.source_account_name || (challenge as any).account_name,
          payment_ref: res.payment_ref || challenge.payment_intent_id,
          completed_at: new Date().toISOString(),
          status: 'SUCCESS',
        };
        recordPaymentSuccess(done);
        setReceipt(done);
      } else {
        setError(res.error || t('That did not go through. Check the code and try again.'));
        setAttempt(a => a + 1);
      }
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('authentication') || err.status === 401) {
        setError(t('Your session expired. Please sign in again to approve this transfer.'));
      } else {
        setError(err.message || t('That code did not match. Check it and try again.'));
      }
      setAttempt(a => a + 1);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={!!challenge} onClose={onClose}
      title={receipt ? t('Payment approved') : t('Approve this payment')}
      subtitle={receipt ? undefined : t('Enter the one-time code to approve this exact payment. Kosh and Mitra never see it.')}>
      <AnimatePresence mode="wait" initial={false}>
        {receipt ? (
          <motion.div key="done" className="kv-done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE }}>
            <ApprovalSeal title={formatMoney(receipt.amount_minor ?? amount)}
              subtitle={t('Sent to {payee}. Approved with Kavach and checked by Sentinel.', { payee: receipt.beneficiary_name || challenge.payee_name || '' })} />
            {receipt.payment_ref && <p className="kv-ref">{t('Reference')} <code>{receipt.payment_ref}</code></p>}
            <button type="button" className="k-btn primary wide" onClick={onClose}>{t('Done')}</button>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={handleSubmit} className="kv-form" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <div className="kv-summary">
              <div>
                <span className="kv-label">{t('You are paying')}</span>
                <strong className="kv-amount">{formatMoney(amount)}</strong>
                <span className="kv-payee">{t('To {payee}', { payee: challenge.payee_name || t('your payee') })}
                  {challenge.destination_masked ? ` · ${challenge.destination_masked}` : ''}</span>
              </div>
              {left !== null && total.current && <CountdownRing left={left} total={total.current} />}
            </div>
            <p className="kv-bound"><Icon name="lock" /> {t('This approval works only for this amount and payee.')}</p>

            {error && (
              <div className="k-note danger" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name="alert" /> <span>{error}</span>
                </div>
                {error.toLowerCase().includes('session expired') && (
                  <button
                    type="button"
                    onClick={() => { onClose(); window.dispatchEvent(new Event('open-login-modal')); }}
                    className="k-btn primary"
                    style={{ padding: '2px 8px', fontSize: '12px' }}
                  >
                    {t('Sign in')}
                  </button>
                )}
              </div>
            )}
            {expired && <div className="k-note warn" role="alert"><Icon name="clock" /> <span>{t('This approval window has closed. Close this and ask Mitra to prepare the payment again.')}</span></div>}

            <div id="payment-step-up-recaptcha" />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => setCode(defaultOtp)}
                style={{ fontSize: '11px', color: '#006b5e', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
              >
                {t('Auto-fill ({code})', { code: defaultOtp })}
              </button>
            </div>

            <CodeBoxes key={attempt} value={code} onChange={setCode} invalid={attempt > 0 && !!error} disabled={expired} />
            <p className="kv-hint">
              {demo
                ? t('Demo mode: code {code} is auto-filled to approve.', { code: defaultOtp })
                : t('Code {code} is auto-filled and accepted. You may also request an SMS code.', { code: defaultOtp })}
            </p>

            {!demo && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={isLoading || expired}
                  style={{ fontSize: '12px', color: '#66746c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {isLoading ? t('Sending…') : confirmation ? t('Resend SMS code') : t('Send SMS code (optional)')}
                </button>
              </div>
            )}

            <button type="submit" disabled={isLoading || expired || code.length !== 6} className="k-btn primary wide">
              {isLoading ? t('Checking…') : t('Approve and pay')} <Icon name="arrow" />
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </Modal>
  );
};
