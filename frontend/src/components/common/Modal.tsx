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
}

/** Native <dialog>: focus trap, Esc and top-layer stacking come from the platform. */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, wide }) => {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) d.showModal();
    if (!isOpen && d.open) d.close();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={ref}
      className={`k-dialog ${wide ? 'wide' : ''}`}
      aria-labelledby="k-modal-title"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
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
