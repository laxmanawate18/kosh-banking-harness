import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const PETALS = [{ r: 0, s: 1 }, { r: -36, s: 0.9 }, { r: 36, s: 0.9 }, { r: -72, s: 0.72 }, { r: 72, s: 0.72 }];
const PETAL = 'M24 11C30.5 18 30.5 28 24 35C17.5 28 17.5 18 24 11Z';

/** The Kosh lotus drawing itself, petal by petal, while something loads. Reduced motion: a still lotus with the label. */
export const LotusLoader: React.FC<{ label?: string; size?: number; full?: boolean }> = ({ label, size = 64, full = false }) => {
  const reduce = useReducedMotion();
  const draw = (i: number) => reduce ? {} : {
    initial: { pathLength: 0, opacity: 0.25 },
    animate: { pathLength: [0, 1, 1, 0], opacity: [0.25, 1, 1, 0.25] },
    transition: { duration: 2.4, times: [0, 0.4, 0.75, 1], ease: 'easeInOut' as const, repeat: Infinity, delay: i * 0.12 },
  };
  return (
    <div className={`k-loading k-lotus-loader ${full ? 'full' : ''}`} role="status" aria-live="polite">
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="k-lotus-svg">
        <circle cx="24" cy="24" r="22.5" className="k-lotus-ring" />
        {PETALS.map(({ r, s }, i) => (
          <motion.path key={r} d={PETAL} className="k-lotus-petal" {...draw(i)}
            transform={`rotate(${r} 24 35) translate(24 35) scale(${s}) translate(-24 -35)`} />
        ))}
        <motion.path d="M13 37.5Q24 42.5 35 37.5" className="k-lotus-petal" {...draw(5)} />
      </svg>
      {label && <span>{label}</span>}
    </div>
  );
};
