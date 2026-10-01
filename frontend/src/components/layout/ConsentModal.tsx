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
    >
      <form onSubmit={handleSubmit} className="cm-form">
        <p className="cm-lead">
          {t('Allow Kosh digital banking to use the following information and prepare the actions you ask for:')}
        </p>

        <div className="cm-uses">
          {uses.map(use => (
            <div key={use} className="cm-use">
              <div className="cm-tick">
                <Check size={14} />
              </div>
              <span>{use}</span>
            </div>
          ))}
        </div>

        <label className="cm-agree">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            required
          />
          <span>
            {t('I agree to these uses for my digital banking services.')}
          </span>
        </label>

        <p className="cm-note">
          {t('You can change or withdraw this consent at any time in Profile and settings.')}
        </p>

        <button
          type="submit"
          disabled={!agreed || isLoading}
          className="cm-submit"
        >
          {isLoading ? t('Saving consent…') : t('Agree and continue')}
        </button>
      </form>
    </Modal>
  );
};
