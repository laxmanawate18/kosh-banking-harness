import React, { useState } from 'react';
import { LotusMark, Rangoli } from './KoshLogo';
import { Icon } from './Icon';
import { tilt } from './motion';
import { useI18n } from '../../i18n';

interface Card3DProps {
  holder?: string;
  number?: string;
  expiry?: string;
  label?: string;
  variant?: 'indigo' | 'saffron' | 'peacock';
  frozen?: boolean;
  float?: boolean;
  /** Pointer tilt is decorative: marketing pages only, never on banking data screens. */
  interactive?: boolean;
}

export const Card3D: React.FC<Card3DProps> = ({
  holder = 'AARAV SHARMA',
  number = '•••• •••• •••• 4821',
  expiry = '08/31',
  label = 'Kosh Platinum Debit',
  variant = 'indigo',
  frozen = false,
  float = false,
  interactive = false,
}) => {
  const { t } = useI18n();
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`k-card3d-wrap ${float ? 'floating' : ''}`} {...(interactive ? tilt(12) : {})}>
      <button
        type="button"
        className={`k-card3d ${variant} ${flipped ? 'flipped' : ''} ${frozen ? 'frozen' : ''}`}
        onClick={() => setFlipped(f => !f)}
        aria-pressed={flipped}
        aria-label={t('{label}, {number}. Press to flip the card.', { label, number })}
      >
        <span className="k-card-face front">
          <Rangoli className="k-card-motif" rings={10} />
          <span className="k-card-row">
            <span className="k-card-brand"><LotusMark size={28} /> kosh</span>
            <span className="k-card-label">{label}</span>
          </span>
          <span className="k-card-chip" />
          <span className="k-card-number">{number}</span>
          <span className="k-card-row bottom">
            <span><small>{t('Card holder')}</small>{holder}</span>
            <span><small>{t('Valid thru')}</small>{expiry}</span>
            <span className="k-card-network">RuPay</span>
          </span>
          {frozen && <span className="k-card-frozen"><Icon name="freeze" />{t('Frozen by you')}</span>}
        </span>
        <span className="k-card-face back">
          <span className="k-card-strip" />
          <span className="k-card-cvv"><small>CVV</small>•••</span>
          <span className="k-card-note">{t('Kosh will never ask for your card PIN, CVV or OTP. Report fraud on 1930.')}</span>
        </span>
      </button>
    </div>
  );
};
