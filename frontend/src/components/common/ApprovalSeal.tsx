import React from 'react';
import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import { EASE } from './Animate';

const PETALS = [{ r: 0, s: 1 }, { r: -36, s: 0.9 }, { r: 36, s: 0.9 }, { r: -72, s: 0.72 }, { r: 72, s: 0.72 }];
const PETAL = 'M24 11C30.5 18 30.5 28 24 35C17.5 28 17.5 18 24 11Z';

/**
 * The Kavach approval moment: a gold ring closes, the lotus blooms, a check settles, one soft ripple.
 * Plays once (~1.2s) and never blocks the receipt below it. Reduced motion: the finished seal, no movement.
 */
export const ApprovalSeal: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const reduce = useReducedMotion();
  const anim = (from: TargetAndTransition, to: TargetAndTransition, delay = 0, duration = 0.5) =>
    reduce ? {} : { initial: from, animate: to, transition: { duration, delay, ease: EASE } };
  return (
    <div className="k-seal" role="status">
      <div className="k-seal-art">
        {!reduce && <motion.span className="k-seal-ripple" initial={{ scale: 0.6, opacity: 0.55 }} animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 1.1, delay: 0.75, ease: 'easeOut' }} aria-hidden="true" />}
        <svg viewBox="0 0 48 48" width="96" height="96" aria-hidden="true">
          <motion.circle cx="24" cy="24" r="22" className="k-seal-ring" {...anim({ pathLength: 0 }, { pathLength: 1 }, 0, 0.55)} />
          {PETALS.map(({ r, s }, i) => (
            <motion.g key={r} {...anim({ scale: 0, opacity: 0 }, { scale: 1, opacity: 1 }, 0.35 + i * 0.06, 0.4)} style={{ originX: '24px', originY: '35px' }}>
              <path d={PETAL} className="k-seal-petal" transform={`rotate(${r} 24 35) translate(24 35) scale(${s}) translate(-24 -35)`} />
            </motion.g>
          ))}
          <motion.path d="M17 25.5l5 5 9.5-10" className="k-seal-check" {...anim({ pathLength: 0 }, { pathLength: 1 }, 0.8, 0.35)} />
        </svg>
      </div>
      <motion.h3 {...anim({ opacity: 0, y: 8 }, { opacity: 1, y: 0 }, 0.6, 0.35)}>{title}</motion.h3>
      {subtitle && <motion.p {...anim({ opacity: 0, y: 8 }, { opacity: 1, y: 0 }, 0.7, 0.35)}>{subtitle}</motion.p>}
    </div>
  );
};
