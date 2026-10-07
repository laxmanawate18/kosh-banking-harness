import React, { type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion, useSpring } from 'framer-motion';

type Props = { as?: 'div' | 'article' | 'a' | 'button' | 'li'; className?: string; children?: ReactNode; max?: number } & Record<string, unknown>;

/**
 * Gentle depth for tiles and cards: leans a few degrees toward the cursor and lifts slightly.
 * Mouse only; touch, keyboard and reduced-motion users get a still card. Never on dense data (tables, statements).
 */
export function Tilt({ as = 'div', className, children, max = 5, ...rest }: Props) {
  const reduce = useReducedMotion();
  const rx = useSpring(0, { stiffness: 260, damping: 22 });
  const ry = useSpring(0, { stiffness: 260, damping: 22 });
  const Comp = motion[as] as React.ElementType;
  const move = (e: PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * max * 2);
    rx.set((0.5 - (e.clientY - r.top) / r.height) * max * 2);
  };
  const reset = () => { rx.set(0); ry.set(0); };
  return (
    <Comp className={`k-tilt ${className ?? ''}`} style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      whileHover={reduce ? undefined : { y: -3 }} onPointerMove={move} onPointerLeave={reset} {...rest}>
      {children}
    </Comp>
  );
}
