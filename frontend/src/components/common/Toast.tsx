import React, { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { SPRING } from './Animate';
import { useI18n } from '../../i18n';

type Tone = 'success' | 'info' | 'warning' | 'danger';
export type ToastInput = { message: string; tone?: Tone; undo?: () => void | Promise<void>; duration?: number };
type Toast = ToastInput & { id: number };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Short confirmations ("Payee saved"). Undo only where the action is genuinely reversible; payments never get one. */
export const useToast = () => useContext(ToastContext);

const ICON: Record<Tone, string> = { success: 'check', info: 'info', warning: 'alert', danger: 'alert' };

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(list => list.filter(x => x.id !== id));
  }, []);
  const schedule = useCallback((id: number, ms: number) => {
    timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  const show = useCallback((input: ToastInput) => {
    const id = next.current++;
    const toast = { tone: 'success' as Tone, duration: input.undo ? 6000 : 4000, ...input, id };
    setToasts(list => [...list.slice(-2), toast]);  // at most three on screen
    schedule(id, toast.duration);
  }, [schedule]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="k-toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map(toast => (
            <motion.div key={toast.id} layout className={`k-toast ${toast.tone}`}
              initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, transition: { duration: 0.14 } }}
              transition={SPRING}
              onMouseEnter={() => window.clearTimeout(timers.current.get(toast.id))}
              onMouseLeave={() => schedule(toast.id, 2000)}>
              <Icon name={ICON[toast.tone ?? 'success']} />
              <span className="k-toast-text">{toast.message}</span>
              {toast.undo && (
                <button type="button" className="k-toast-undo" onClick={async () => { dismiss(toast.id); await toast.undo?.(); }}>{t('Undo')}</button>
              )}
              <button type="button" className="k-toast-close" aria-label={t('Dismiss')} onClick={() => dismiss(toast.id)}><Icon name="close" /></button>
              <span className="k-toast-timer" style={{ animationDuration: `${toast.duration}ms` }} aria-hidden="true" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
