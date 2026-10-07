import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { MotionConfig, animate, motion, useInView, useReducedMotion, useSpring, type Variants } from 'framer-motion';

/** Kosh motion tokens: one rhythm everywhere. Matches --ease-out in kosh.css; UI motion stays under 300ms. */
export const EASE = [0.23, 1, 0.32, 1] as const;
export const DUR = { fast: 0.15, base: 0.22, slow: 0.32 };
export const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 } as const;

/** App root: honours the system "reduce motion" setting (transforms off, fades kept) and sets the default rhythm. */
export const MotionProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
  <MotionConfig reducedMotion="user" transition={{ duration: DUR.base, ease: EASE }}>{children}</MotionConfig>
);

/** A page arriving: short rise + fade. No exit animation, so navigation never waits. */
export const pageMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
};

const group: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
};

type Tag = keyof typeof motion & keyof React.JSX.IntrinsicElements;
type Props = { as?: Tag; className?: string; children?: ReactNode; style?: React.CSSProperties } & Record<string, unknown>;

/** A list or grid whose children (each a <Stagger.Item>) rise in one after another, 45ms apart. */
export function Stagger({ as = 'div', className, children, ...rest }: Props) {
  const Comp = motion[as] as React.ElementType;
  return <Comp className={className} variants={group} initial="hidden" animate="show" {...rest}>{children}</Comp>;
}

/**
 * One element of a Stagger, rendered as the element it replaces (as="article", "li", "section"…).
 * `tilt` (degrees, e.g. 5) adds gentle depth: the tile leans toward the mouse and lifts. Mouse only; still under reduced motion.
 */
Stagger.Item = function StaggerItem({ as = 'div', className, children, tilt, ...rest }: Props & { tilt?: number }) {
  const Comp = motion[as] as React.ElementType;
  const reduce = useReducedMotion();
  const rx = useSpring(0, { stiffness: 260, damping: 22 });
  const ry = useSpring(0, { stiffness: 260, damping: 22 });
  if (!tilt || reduce) return <Comp className={className} variants={rise} {...rest}>{children}</Comp>;
  const move = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * tilt * 2);
    rx.set((0.5 - (e.clientY - r.top) / r.height) * tilt * 2);
  };
  return (
    <Comp className={`${className ?? ''} k-tilt`} variants={rise} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      whileHover={{ y: -3 }} onPointerMove={move} onPointerLeave={() => { rx.set(0); ry.set(0); }} {...rest}>
      {children}
    </Comp>
  );
};

/** Content that rises in the first time it scrolls into view (long pages; marketing sections). */
export function Reveal({ as = 'div', className, children, ...rest }: Props) {
  const Comp = motion[as] as React.ElementType;
  const reduce = useReducedMotion();  // reduced motion: content is simply there, no fade on scroll
  return (
    <Comp className={className} initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }} transition={{ duration: 0.45, ease: EASE }} {...rest}>
      {children}
    </Comp>
  );
}

/** A figure that counts to its value when it first appears or changes (balances, KPIs). Screen readers get the final text. */
export function AnimatedNumber({ value, format = v => Math.round(v).toLocaleString('en-IN') }:
  { value: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const from = useRef(0);
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { setShown(value); from.current = value; return; }
    const controls = animate(from.current, value, { duration: 0.7, ease: EASE, onUpdate: setShown });
    from.current = value;
    return () => controls.stop();
  }, [seen, value, reduce]);
  return (
    <span ref={ref} className="k-num">
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** The sliding highlight behind the active item of a tab bar, filter row or sidebar. Place it inside the active item. */
export const ActiveIndicator: React.FC<{ id: string; className?: string }> = ({ id, className = 'k-active-pill' }) => (
  <motion.span layoutId={id} className={className} transition={SPRING} aria-hidden="true" />
);

export { motion, AnimatePresence } from 'framer-motion';
