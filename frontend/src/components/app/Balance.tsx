import React, { useSyncExternalStore } from 'react';
import { AnimatePresence, AnimatedNumber, EASE, motion } from '../common/Animate';
import { Icon } from '../common/Icon';
import { formatMoney } from '../common/Formatters';
import { useI18n } from '../../i18n';

const KEY = 'kosh.hideBalances';
const EVENT = 'kosh:hide-balances';
const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);  // other tabs
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', fn); };
};
const useHidden = () => useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) === '1');
const setHidden = (hide: boolean) => { localStorage.setItem(KEY, hide ? '1' : '0'); window.dispatchEvent(new Event(EVENT)); };

const money = (v: number) => formatMoney(Math.round(v));

/**
 * A balance figure (minor units) that obeys "Hide balances". Hidden: blurred dots, and screen readers hear "Balance hidden"
 * (the real figure is not in the DOM). Revealed: the blur lifts while the digits roll up to the value.
 */
export const Money: React.FC<{ value: number }> = ({ value }) => {
  const { t } = useI18n();
  const hidden = useHidden();
  return (
    <AnimatePresence initial={false}>
      {hidden ? (
        <motion.span key="hidden" className="c-money-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span aria-hidden="true">₹ ••,••,•••</span><span className="sr-only">{t('Balance hidden')}</span>
        </motion.span>
      ) : (
        <motion.span key="shown" className="c-money" initial={{ opacity: 0.3, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.45, ease: EASE }}>
          <AnimatedNumber value={value} format={money} />
        </motion.span>
      )}
    </AnimatePresence>
  );
};

/** The one switch for every balance on Overview, Accounts and Deposits; remembered on this device. */
export const HideBalancesToggle: React.FC<{ className?: string }> = ({ className = 'k-btn outline sm' }) => {
  const { t } = useI18n();
  const hidden = useHidden();
  return (
    <button type="button" className={`${className} c-hide-toggle`} aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
      <Icon name={hidden ? 'eye-off' : 'eye'} />{t('Hide balances')}
    </button>
  );
};
