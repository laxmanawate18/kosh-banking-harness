import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../common/Modal';
import { Check } from 'lucide-react';
import { useI18n } from '../../i18n';

export const ConsentModal: React.FC = () => {
  const { t } = useI18n();
  const { requiresConsent, submitConsent } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!requiresConsent) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;
    setIsLoading(true);
    try {
      await submitConsent(true);
    } finally {
      setIsLoading(false);
    }
  };

  const uses = [
    t('View accounts and transactions'),
    t('Prepare payments that you approve separately'),
    t('Protect your cards and monitor security activity'),
    t('Create and track banking service requests'),
  ];

  return (
    <Modal
      isOpen={requiresConsent}
      onClose={() => {}}
      title={t('Your banking. Your permission.')}
      subtitle={t('Review how Kosh helps manage and protect your digital banking.')}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-[13px] text-[var(--ink)]">
        <p className="leading-relaxed text-[var(--muted)]">
          {t('Allow Kosh digital banking to use the following information and prepare the actions you ask for:')}
        </p>

        <div className="p-5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] space-y-3">
          {uses.map(use => (
            <div key={use} className="flex items-center gap-2.5 font-medium text-[var(--ink)]">
              <div className="w-5 h-5 rounded-full bg-[var(--ok-bg)] flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-[var(--ok)]" />
              </div>
              <span>{use}</span>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-3 p-3.5 bg-[var(--surface)] border border-[var(--line)] rounded-2xl cursor-pointer hover:border-[var(--brand)] transition">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 rounded text-[var(--brand)] focus:ring-[var(--brand)]"
            required
          />
          <span className="font-semibold text-[var(--ink)]">
            {t('I agree to these uses for my digital banking services.')}
          </span>
        </label>

        <p className="text-[13px] text-[var(--muted)]">
          {t('You can change or withdraw this consent at any time in Profile and settings.')}
        </p>

        <button
          type="submit"
          disabled={!agreed || isLoading}
          className="w-full bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--on-brand)] font-bold py-3.5 px-6 rounded-2xl transition shadow-sm disabled:opacity-50 text-sm"
        >
          {isLoading ? t('Saving consent…') : t('Agree and continue')}
        </button>
      </form>
    </Modal>
  );
};
