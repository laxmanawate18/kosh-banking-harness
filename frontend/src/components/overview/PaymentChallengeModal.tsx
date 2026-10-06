import React, { useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { Challenge } from '../../types/banking';
import { formatMoney } from '../common/Formatters';
import { Modal } from '../common/Modal';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { useBanking } from '../../context/BankingContext';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { completeStepUp, sendStepUpCode } from '../../services/firebaseAuth';
import { demoStepUp } from '../../services/auth';

interface PaymentChallengeModalProps {
  challenge: Challenge | null;
  onClose: () => void;
}

export const PaymentChallengeModal: React.FC<PaymentChallengeModalProps> = ({
  challenge,
  onClose,
}) => {
  const { verifyChallenge } = useBanking();
  const { recordPaymentSuccess } = useChat();
  const { auth, publicConfig } = useAuth();
  const demo = Boolean(publicConfig?.demo_otp);  // demo OTP mode: no Firebase, no SMS
  const [code, setCode] = useState(publicConfig?.demo_otp_code || '');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!challenge) return null;

  const handleSendCode = async () => {
    if (!publicConfig?.firebase_api_key || !auth?.user?.phone_number) {
      setError('Firebase step-up is not configured for this account.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const sent = await sendStepUpCode(auth.user.phone_number, publicConfig, 'payment-step-up-recaptcha');
      setConfirmation(sent.confirmation);
      setCode(sent.prefill);
    } catch (err: any) {
      setError(err.message || 'Could not send a fresh Firebase verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (demo) await demoStepUp(code);
      else {
        if (!confirmation) throw new Error('Send a fresh Firebase verification code first.');
        await completeStepUp(confirmation, code);
      }
      const res = await verifyChallenge();
      if (res.success || res.status === 'SUCCESS' || res.status === 'APPROVED') {
        const receipt = res.receipt || {
          amount_minor: challenge.amount_minor,
          beneficiary_name: challenge.payee_name,
          source_account_name: challenge.source_account_name || (challenge as any).account_name,
          payment_ref: res.payment_ref || challenge.payment_intent_id,
          completed_at: new Date().toISOString(),
          status: 'SUCCESS',
        };
        recordPaymentSuccess(receipt);
        onClose();
      } else {
        setError(res.error || 'Authorization failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={!!challenge}
      onClose={onClose}
      title="Approve this payment"
      subtitle="Confirm your intent with a fresh Firebase phone verification."
    >
      <form onSubmit={handleSubmit} className="pcm-form">
        {error && (
          <div className="pcm-error">
            {error}
          </div>
        )}

        <div className="pcm-bound">
          <span>
            <ShieldCheck size={16} /> Transaction-bound approval
          </span>
          <span className="pcm-tag">
            Immutable
          </span>
        </div>

        <div className="pcm-amount">
          <span>Payment Amount</span>
          <div>{formatMoney(challenge.amount_minor)}</div>
          <p>To: {challenge.payee_name}</p>
        </div>

        <div id="payment-step-up-recaptcha" />

        {!demo && !confirmation && (
          <button type="button" onClick={handleSendCode} disabled={isLoading} className="mf-go pcm-send">
            {isLoading ? 'Sending…' : 'Send fresh verification code'}
          </button>
        )}

        {(demo || confirmation) && <div>
          <label className="mf-label">
            One-time verification code
          </label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={6}
            required
            className="pcm-code mf-focus"
          />
        </div>}

        <p className="pcm-note">
          {demo
            ? 'Demo approval: no SMS is sent. Enter the demo code to approve this exact payment.'
            : 'Firebase verifies the code, and the auth server grants this Kosh session five minutes of L3 assurance.'}
        </p>

        <button
          type="submit"
          disabled={isLoading || (!demo && !confirmation) || code.length !== 6}
          className="mf-go mf-transition pcm-submit"
        >
          {isLoading ? 'Verifying…' : 'Verify & send payment'} <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
};
