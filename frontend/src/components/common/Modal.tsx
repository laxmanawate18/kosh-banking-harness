import React, { type ReactNode, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../../i18n';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
}

/** Native <dialog>: focus trap, Esc and top-layer stacking come from the platform. */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, maxWidth = '' }) => {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (isOpen && !d.open) d.showModal();
    if (!isOpen && d.open) d.close();
  }, [isOpen]);

  if (!isOpen) return null;
  const wide = /max-w-(2xl|3xl|4xl|5xl|6xl)/.test(maxWidth);

  return (
    <dialog
      ref={ref}
      className={`k-dialog ${wide ? 'wide' : ''}`}
      aria-labelledby="k-modal-title"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="k-dialog-head">
        <h2 id="k-modal-title">{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        <button type="button" className="k-close" onClick={onClose} aria-label={t('Close')}>
          <Icon name="close" />
        </button>
      </div>
      <div className="k-dialog-body">{children}</div>
    </dialog>
  );
};
