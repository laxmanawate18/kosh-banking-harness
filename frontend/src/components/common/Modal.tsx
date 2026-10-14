import React, { type ReactNode, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { motion, EASE } from './Animate';
import { useI18n } from '../../i18n';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  closeOnBackdrop?: boolean;
}

/** Native <dialog>: focus trap, Esc and top-layer stacking come from the platform. */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, wide, closeOnBackdrop = true }) => {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  // The dialog leaves the page when it closes, so the browser cannot send focus back by itself: remember what opened it
  // and return there, otherwise a keyboard user lands at the top of the page.
  useEffect(() => {
    const d = ref.current;
    if (!d || !isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    return () => { if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true }); };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Tab') {
      const d = ref.current;
      if (!d) return;
      const focusables = Array.from(d.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <dialog
      ref={ref}
      className={`k-dialog ${wide ? 'wide' : ''}`}
      aria-labelledby="k-modal-title"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onKeyDown={handleKeyDown}
      onClick={e => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.26, ease: EASE }}>
        <div className="k-dialog-head">
          <h2 id="k-modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
          <button type="button" className="k-close" onClick={onClose} aria-label={t('Close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="k-dialog-body">{children}</div>
      </motion.div>
    </dialog>
  );
};
