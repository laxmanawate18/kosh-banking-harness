import React, { useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { completeStepUp, sendStepUpCode } from '../../services/firebaseAuth';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';

/**
 * Runs an action; if the backend answers STEP_UP_REQUIRED, asks for an OTP and retries with a verified session.
 * Usage: `const s = useStepUp(); await s.run(() => api())` then render `{s.needed && <StepUpField {...s} />}`.
 */
export function useStepUp() {
  const { publicConfig, user } = useAuth();
  const [needed, setNeeded] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (needed) {
      if (!confirmation) throw new Error('A verification code could not be sent. Please try again.');
      await completeStepUp(confirmation, otp);
    }
    try {
      const result = await action();
      setNeeded(false);
      setConfirmation(null);
      setOtp('');
      return result;
    } catch (err: any) {
      if (err.detail?.code === 'STEP_UP_REQUIRED') {
        if (!publicConfig || !user?.phone_number) throw new Error('Extra verification is not configured for this account.');
        const sent = await sendStepUpCode(user.phone_number, publicConfig, 'inline-step-up-recaptcha');
        setConfirmation(sent.confirmation);
        setOtp(sent.prefill);
        setNeeded(true);
        return undefined;
      }
      throw err;
    }
  };
  return { needed, otp, setOtp, run, reset: () => { setNeeded(false); setConfirmation(null); setOtp(''); } };
}

export const StepUpField: React.FC<{ otp: string; setOtp: (v: string) => void }> = ({ otp, setOtp }) => {
  const { t } = useI18n();
  return (
    <div className="k-note warn" style={{ marginBottom: 14, display: 'block' }}>
      <strong style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="key" /> {t('Extra verification needed')}</strong>
      <p style={{ margin: '4px 0 10px', color: 'inherit' }}>{t('This change needs a one-time code sent to your registered mobile.')}</p>
      <div id="inline-step-up-recaptcha" />
      <input className="otp-input" inputMode="numeric" maxLength={6} value={otp} required autoFocus
        onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} aria-label={t('One-time code')} />
    </div>
  );
};
