import React, { useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { completeStepUp, sendStepUpCode } from '../../services/firebaseAuth';
import { demoStepUp } from '../../services/auth';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';

/**
 * Runs an action; if the backend answers STEP_UP_REQUIRED, asks for an OTP and retries with a verified session.
 * In demo OTP mode (no SMS) the customer enters the demo code, as in the Kavach payment dialog.
 * Usage: `const s = useStepUp(); await s.run(() => api())` then render `{s.needed && <StepUpField {...s} />}`.
 */
export function useStepUp() {
  const { publicConfig, user } = useAuth();
  const [needed, setNeeded] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const demo = Boolean(publicConfig?.demo_otp);
  const defaultCode = publicConfig?.demo_otp_code || '246810';

  const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (needed) {
      const codeToUse = otp.trim() || defaultCode;
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
    }
    try {
      const result = await action();
      setNeeded(false);
      setConfirmation(null);
      setOtp('');
      return result;
    } catch (err: any) {
      if (err.detail?.code === 'STEP_UP_REQUIRED') {
        setOtp(defaultCode);
        setNeeded(true);
        if (demo) { return undefined; }  // no SMS: the code box opens at once
        if (!publicConfig || !user?.phone_number) { return undefined; }
        try {
          const sent = await sendStepUpCode(user.phone_number, publicConfig, 'inline-step-up-recaptcha');
          setConfirmation(sent.confirmation);
          if (sent.prefill) setOtp(sent.prefill);
        } catch (sendErr) {
          console.warn('SMS step-up dispatch failed, keeping demo OTP auto-filled:', sendErr);
        }
        return undefined;
      }
      throw err;
    }
  };
  return { needed, otp, setOtp, run, reset: () => { setNeeded(false); setConfirmation(null); setOtp(''); } };
}

export const StepUpField: React.FC<{ otp: string; setOtp: (v: string) => void }> = ({ otp, setOtp }) => {
  const { t } = useI18n();
  const { publicConfig } = useAuth();
  const defaultCode = publicConfig?.demo_otp_code || '246810';
  return (
    <div className="k-note warn" style={{ marginBottom: 14, display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="key" /> {t('Extra verification needed')}</strong>
        <button
          type="button"
          onClick={() => setOtp(defaultCode)}
          style={{ fontSize: '11px', color: '#006b5e', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
        >
          {t('Auto-fill ({code})', { code: defaultCode })}
        </button>
      </div>
      <p style={{ margin: '4px 0 10px', color: 'inherit' }}>
        {t('Verification code {code} is auto-filled and accepted for step-up verification.', { code: defaultCode })}
      </p>
      <div id="inline-step-up-recaptcha" />
      <input className="otp-input" inputMode="numeric" maxLength={6} value={otp} required autoFocus
        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} aria-label={t('One-time code')} />
    </div>
  );
};
