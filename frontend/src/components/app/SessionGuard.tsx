import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';

const IDLE_MS = 5 * 60_000;
const WARN_MS = 60_000;
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Bank-style idle timeout: warn after 4 idle minutes, sign out at 5. Keeps the server session fresh on "stay". */
export const SessionGuard: React.FC = () => {
  const { t } = useI18n();
  const { logout, refreshSession } = useAuth();
  const last = useRef(Date.now());
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const bump = () => { if (remaining === null) last.current = Date.now(); };
    ACTIVITY.forEach(e => window.addEventListener(e, bump, { passive: true }));
    const id = setInterval(() => {
      const left = IDLE_MS - (Date.now() - last.current);
      if (left <= 0) { clearInterval(id); logout(); }
      else if (left <= WARN_MS) setRemaining(Math.ceil(left / 1000));
    }, 1000);
    return () => {
      ACTIVITY.forEach(e => window.removeEventListener(e, bump));
      clearInterval(id);
    };
  }, [remaining === null, logout]);

  const stay = () => {
    last.current = Date.now();
    setRemaining(null);
    refreshSession();
  };

  if (remaining === null) return null;
  return (
    <Modal isOpen onClose={stay} title={t('Are you still there?')} subtitle={t('For your security, we will sign you out when the timer ends.')}>
      <div className="k-timeout-count" role="timer" aria-live="polite">0:{String(remaining).padStart(2, '0')}</div>
      <div className="k-dialog-actions">
        <button type="button" className="k-btn outline" onClick={logout}>{t('Sign out now')}</button>
        <button type="button" className="k-btn primary" onClick={stay} autoFocus>{t('Stay signed in')}</button>
      </div>
    </Modal>
  );
};
