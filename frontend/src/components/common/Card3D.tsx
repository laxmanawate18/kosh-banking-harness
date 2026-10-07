import React, { useEffect, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { EASE } from './Animate';
import { LotusMark, Rangoli } from './KoshLogo';
import { Icon } from './Icon';
import { useI18n } from '../../i18n';

interface Card3DProps {
  holder?: string;
  number?: string;
  expiry?: string;
  label?: string;
  variant?: 'indigo' | 'saffron' | 'peacock';
  frozen?: boolean;
  float?: boolean;
  /** Tilt toward the pointer (fine pointers only). */
  interactive?: boolean;
  /** Show "Tap the card to see the back" under the card. */
  hint?: boolean;
}

const TILT = 9;                                          // degrees at the card's edge
const FLIP = { stiffness: 120, damping: 16, mass: 1.1 };  // a weighted, physical flip
const LEAN = { stiffness: 220, damping: 22 };

/** The debit card in 3D: tap to flip (spring physics), leans toward the cursor. With reduced motion it crossfades. */
export const Card3D: React.FC<Card3DProps> = ({
  holder = 'AARAV SHARMA',
  number = '•••• •••• •••• 4821',
  expiry = '08/31',
  label = 'Kosh Platinum Debit',
  variant = 'indigo',
  frozen = false,
  float = false,
  interactive = false,
  hint = false,
}) => {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);

  const flip = useSpring(0, FLIP);
  const leanX = useSpring(0, LEAN);
  const leanY = useSpring(0, LEAN);
  useEffect(() => { flip.set(flipped ? 180 : 0); }, [flipped, flip]);
  const rotateY = useTransform([flip, leanY], ([f, y]: number[]) => f + y);

  const lean = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    leanY.set(((e.clientX - r.left) / r.width - 0.5) * TILT * 2);
    leanX.set((0.5 - (e.clientY - r.top) / r.height) * TILT * 2);
  };
  const settle = () => { leanX.set(0); leanY.set(0); };

  return (
    <div className="k-card3d-holder">
      <div className={`k-card3d-wrap ${float ? 'floating' : ''}`} onPointerMove={lean} onPointerLeave={settle}>
        <motion.button
          type="button"
          className={`k-card3d k-card3d-motion ${variant} ${flipped ? 'flipped' : ''} ${frozen ? 'frozen' : ''} ${reduce ? 'reduced' : ''}`}
          style={reduce ? undefined : { rotateX: leanX, rotateY, rotateZ: -3 }}
          whileTap={reduce ? undefined : { scale: 0.98 }}
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
            {/* Freezing: frost closes in from the edges and the label settles; unfreezing: it melts and runs off. Instant with reduced motion. */}
            <AnimatePresence initial={false}>
              {frozen && (
                <motion.span key="frost" className="k-card-frost" aria-hidden="true"
                  initial={{ opacity: 0, scale: 1.18 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
                  exit={{ opacity: 0, y: 14, filter: 'blur(4px)', transition: { duration: reduce ? 0 : 0.5, ease: 'easeIn' } }} />
              )}
              {frozen && (
                <motion.span key="label" className="k-card-frozen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: reduce ? 0 : 0.25, delay: reduce ? 0 : 0.45 }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}>
                  <Icon name="freeze" />{t('Frozen by you')}
                </motion.span>
              )}
            </AnimatePresence>
            <span className="k-card-sheen" aria-hidden="true" />
          </span>
          <span className="k-card-face back">
            <span className="k-card-strip" />
            <span className="k-card-cvv"><small>CVV</small>•••</span>
            <span className="k-card-note">{t('Kosh will never ask for your card PIN, CVV or OTP. Report fraud on 1930.')}</span>
            <span className="k-card-back-foot"><LotusMark size={22} /> {t('Tap to turn the card over')}</span>
          </span>
        </motion.button>
      </div>
      {hint && (
        <p className="k-card3d-hint" aria-hidden="true">
          <Icon name="undo" /> {flipped ? t('Tap the card to see the front') : t('Tap the card to see the back')}
        </p>
      )}
    </div>
  );
};
