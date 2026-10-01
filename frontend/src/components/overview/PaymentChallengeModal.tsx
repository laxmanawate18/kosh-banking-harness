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
  const [code, setCode] = useState('');
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
      if (!confirmation) throw new Error('Send a fresh Firebase verification code first.');
      await completeStepUp(confirmation, code);
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
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3.5 bg-[#f9e7e4] text-[#ad413c] border border-[#f2ccc7] rounded-2xl font-medium">
            {error}
          </div>
        )}

        <div className="p-3.5 bg-[#e1f0e9] border border-[#c9d9d1] rounded-2xl text-[#006b5e] font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2 font-mono text-xs">
            <ShieldCheck className="w-4 h-4 text-[#006b5e]" /> Transaction-bound approval
          </span>
          <span className="text-[10px] text-[#006b5e] uppercase tracking-widest font-mono font-bold bg-white/60 px-2 py-0.5 rounded-full">
            Immutable
          </span>
        </div>

        <div className="p-6 rounded-2xl bg-[#f1f5f2] border border-[#d7e1dc] text-center space-y-1">
          <span className="text-[#667a7c] font-mono text-[11px] uppercase tracking-wider block">Payment Amount</span>
          <div className="text-3xl font-serif font-bold text-[#102a2f]">{formatMoney(challenge.amount_minor)}</div>
          <p className="text-xs font-semibold text-[#102a2f] mt-1">To: {challenge.payee_name}</p>
        </div>

        <div id="payment-step-up-recaptcha" />

        {!confirmation && (
          <button type="button" onClick={handleSendCode} disabled={isLoading} className="w-full bg-[#006b5e] text-white font-bold py-3 px-6 rounded-2xl disabled:opacity-50 text-sm">
            {isLoading ? 'Sending…' : 'Send fresh verification code'}
          </button>
        )}

        {confirmation && <div>
          <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
            One-time verification code
          </label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={6}
            required
            className="w-full px-4 py-3 bg-white border border-[#d7e1dc] rounded-2xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-center tracking-[0.5em] font-mono text-2xl font-bold text-[#102a2f]"
          />
        </div>}

        <p className="text-[11px] text-[#667a7c] leading-relaxed">
          Firebase verifies the code, and the auth server grants this Kosh session five minutes of L3 assurance.
        </p>

        <button
          type="submit"
          disabled={isLoading || !confirmation || code.length !== 6}
          className="w-full bg-[#006b5e] hover:bg-[#00544a] text-white font-bold py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 transition shadow-sm disabled:opacity-50 text-sm"
        >
          {isLoading ? 'Verifying…' : 'Verify & send payment'} <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </Modal>
  );
};
