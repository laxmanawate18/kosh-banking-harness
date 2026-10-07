import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform,
  type AnimationPlaybackControls, type Variants,
} from 'framer-motion';
import { LotusMark, Rangoli } from '../common/KoshLogo';
import { Icon } from '../common/Icon';
import { EASE } from '../common/Animate';
import { useI18n } from '../../i18n';

/*
 * "Forged in light": the home hero's metal card.
 * 1. It arrives as an exploded 3D stack (metal core, rangoli guilloché, holo foil, chip, lettering, glass) that slams
 *    together with a spring, throwing gold shockwaves and sparks.
 * 2. Then it lives: a real slab with a gold edge, foil and hologram that shift with the angle, two particle orbits
 *    passing behind it, and a Sentinel scan beam every few seconds.
 * 3. It leans toward the cursor, spins when flung (settling on a face), flips on tap and turns as the page scrolls.
 * Decorative only (aria-hidden, nothing focusable). Reduced motion: the finished card, still.
 */

type Phase = 'gather' | 'exploded' | 'forged';
type Layer = { key: string; tag: string; far: number; burst: number; rest: number };
type Vars = CSSProperties & Record<`--${string}`, string | number>;

const STACK: Layer[] = [
  { key: 'plate', tag: 'Metal core', far: -560, burst: -160, rest: 0 },
  { key: 'pattern', tag: 'Rangoli guilloché', far: -280, burst: -80, rest: 0.4 },
  { key: 'foil', tag: 'Holographic foil', far: 280, burst: 0, rest: 0.8 },
  { key: 'type', tag: 'Engraved details', far: 560, burst: 80, rest: 1.6 },
  { key: 'chip', tag: 'EMV chip', far: 840, burst: 160, rest: 2.4 },
  { key: 'gloss', tag: 'Sentinel shield', far: 1120, burst: 240, rest: 3.2 },
];
const EDGE = Array.from({ length: 9 }, (_, i) => -0.7 * (i + 1));  // slices behind the face: a 6 px metal slab
const FORGE_AT = 2050;  // ms: the stack hangs exploded, then slams shut
const LIVE_AT = 2700;

const pose: Variants = {
  gather: { rotateX: 58, rotateY: 0, rotateZ: -34, scale: 0.7 },
  exploded: { rotateX: 54, rotateY: 4, rotateZ: -24, scale: 0.74, transition: { duration: 2.3, ease: 'easeOut' } },
  forged: { rotateX: 6, rotateY: -14, rotateZ: -5, scale: 1, transition: { type: 'spring', stiffness: 110, damping: 13, mass: 1.05 } },
};
type Custom = Layer & { i: number; k: number };
const layer: Variants = {
  gather: (c: Custom) => ({ z: c.far * c.k, opacity: 0 }),
  exploded: (c: Custom) => ({ z: c.burst * c.k, opacity: 1, transition: { delay: 0.15 + c.i * 0.11, duration: 0.95, ease: EASE } }),
  forged: (c: Custom) => ({ z: c.rest, opacity: 1, transition: { type: 'spring', stiffness: 520, damping: 26, delay: (STACK.length - c.i) * 0.018 } }),
};

/* Two tilted orbits. Each particle exists twice: in the layer behind the card (visible on the far half of the ellipse)
   and the layer in front (near half), so the orbit passes behind the card without any 3D sorting. */
const ORBITS = [
  { id: 'gold', rx: 300, ry: 74, tilt: -16, secs: 16, reverse: false,
    dots: Array.from({ length: 16 }, (_, i) => ({ at: i / 16, size: 3 + ((i * 7) % 5) })),
    sats: [] },
  { id: 'platinum', rx: 250, ry: 120, tilt: 24, secs: 24, reverse: true,
    dots: Array.from({ length: 12 }, (_, i) => ({ at: i / 12 + 0.04, size: 2 + ((i * 5) % 4) })),
    sats: [] },
  // Wide enough to pass under the card in front and over it behind, so the badges never cover the card's details.
  { id: 'sats', rx: 330, ry: 182, tilt: -6, secs: 21, reverse: false, dots: [],
    sats: [{ at: 0.08, icon: 'upi', label: 'UPI' }, { at: 0.41, icon: 'shield', label: 'Sentinel' }, { at: 0.74, icon: 'ai-banker', label: 'Mitra' }] },
];
const ellipse = (rx: number, ry: number) => `path("M ${-rx} 0 A ${rx} ${ry} 0 0 0 ${rx} 0 A ${rx} ${ry} 0 0 0 ${-rx} 0")`;
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.2;
  const d = 170 + (i % 3) * 70;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.62, s: 3 + (i % 3) * 2 };
});

const Orbits: React.FC<{ side: 'back' | 'front'; lit: boolean }> = ({ side, lit }) => {
  const { t } = useI18n();
  return (
    <div className={`kh-orbits ${side}`}>
      {ORBITS.map(o => (
        <motion.div key={o.id} className={`kh-orbit ${o.id}`} style={{ rotate: o.tilt }}
          initial={false} animate={{ scale: lit ? 1 : 0 }} transition={{ type: 'spring', stiffness: 80, damping: 11, delay: lit ? 0.1 : 0 }}>
          {[...o.dots.map(d => ({ ...d, sat: null })), ...o.sats.map(s => ({ ...s, size: 0, sat: s }))].map((p, i) => {
            const style: Vars = {
              offsetPath: ellipse(o.rx, o.ry), '--at': `${p.at * 100}%`, '--size': `${p.size}px`,
              animationDuration: `${o.secs}s`, animationDelay: `${-p.at * o.secs}s`,
              animationDirection: o.reverse ? 'reverse' : 'normal',
              // Reduced motion (no animation): park each particle on the half of the ellipse it belongs to.
              opacity: side === 'front' ? (p.at % 1 < 0.5 ? 1 : 0) : (p.at % 1 < 0.5 ? 0 : 0.7),
            };
            return p.sat
              ? <span key={i} className="kh-sat" style={style}><Icon name={p.sat.icon} />{t(p.sat.label)}</span>
              : <i key={i} className="kh-dot" style={style} />;
          })}
        </motion.div>
      ))}
    </div>
  );
};

export const HeroCard: React.FC = () => {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const scene = useRef<HTMLDivElement>(null);
  const inView = useInView(scene, { margin: '-8% 0px' });
  const [phase, setPhase] = useState<Phase>(reduce ? 'forged' : 'gather');
  const [live, setLive] = useState(!!reduce);
  const [k, setK] = useState(1);  // explode distance shrinks on small screens

  useEffect(() => {
    if (reduce) return;
    setK(Math.max(0.55, Math.min(1, (scene.current?.clientWidth ?? 600) / 620)));
    const timers = [
      window.setTimeout(() => setPhase('exploded'), 60),
      window.setTimeout(() => setPhase('forged'), FORGE_AT),
      window.setTimeout(() => setLive(true), LIVE_AT),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [reduce]);

  // Rotation = pointer lean + fling spin + idle sway + scroll turn.
  const tiltX = useSpring(0, { stiffness: 170, damping: 18 });
  const tiltY = useSpring(0, { stiffness: 170, damping: 18 });
  const spinY = useMotionValue(0);
  const idleX = useMotionValue(0);
  const idleY = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollTurn = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 150]);
  const rotateX = useTransform([tiltX, idleX], ([a, b]: number[]) => a + b);
  const rotateY = useTransform([tiltY, spinY, idleY, scrollTurn], ([a, b, c, d]: number[]) => a + b + c + d);

  // Light: foil and hologram follow the angle; the glare follows the pointer.
  const foilPos = useTransform([rotateY, rotateX], ([y, x]: number[]) =>
    `${50 + Math.sin((y * Math.PI) / 70) * 46}% ${50 + Math.sin((x * Math.PI) / 50) * 40}%`);
  const holoHue = useTransform(rotateY, v => `hue-rotate(${v * 4}deg) saturate(1.4)`);
  const glareX = useSpring(30, { stiffness: 120, damping: 20 });
  const glareY = useSpring(18, { stiffness: 120, damping: 20 });
  const glareA = useSpring(0.16, { stiffness: 120, damping: 20 });
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / ${glareA}), transparent 46%)`;

  useEffect(() => {
    if (!live || !inView || reduce) return;
    const runs = [
      animate(idleY, [0, 11, -11, 0], { duration: 11, repeat: Infinity, ease: 'easeInOut' }),
      animate(idleX, [0, -5, 4, 0], { duration: 7.5, repeat: Infinity, ease: 'easeInOut' }),
    ];
    return () => runs.forEach(r => r.stop());
  }, [live, inView, reduce, idleX, idleY]);

  const spin = useRef<AnimationPlaybackControls | null>(null);
  const from = useRef(0);
  const panned = useRef(false);
  const settle = (target: number, velocity = 0) => {
    spin.current?.stop();
    if (reduce) { spinY.set(target); return; }
    spin.current = animate(spinY, target, { type: 'spring', velocity, stiffness: 55, damping: 12, mass: 1.1 });
  };

  const lean = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!live || reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    tiltY.set((px - 0.5) * 30);
    tiltX.set((0.5 - py) * 22);
    glareX.set(px * 100); glareY.set(py * 100); glareA.set(0.34);
  };
  const rest = () => { tiltX.set(0); tiltY.set(0); glareX.set(30); glareY.set(18); glareA.set(0.16); };

  return (
    <div ref={scene} className={`kh-scene kh-${phase} ${live ? 'kh-live' : ''} ${inView ? '' : 'kh-paused'}`} aria-hidden="true">
      <div className="kh-floor" />
      <Orbits side="back" lit={phase === 'forged'} />

      <motion.div className="kh-3d" style={{ touchAction: 'pan-y' }}
        onPointerMove={lean} onPointerLeave={rest} onPointerDown={() => { panned.current = false; }}
        onPanStart={() => { if (!live) return; panned.current = true; spin.current?.stop(); from.current = spinY.get(); }}
        onPan={(_, info) => { if (live) spinY.set(from.current + info.offset.x * 0.6); }}
        onPanEnd={(_, info) => {
          if (!live) return;
          const projected = spinY.get() + info.velocity.x * 0.22;  // where the fling would carry it, snapped to a face
          settle(Math.round(projected / 180) * 180, info.velocity.x * 0.6);
        }}
        onTap={() => { if (live && !panned.current) settle((Math.round(spinY.get() / 180) + 1) * 180); }}>
        <motion.div className="kh-world" variants={pose} initial={reduce ? 'forged' : 'gather'} animate={phase}>
          <div className="kh-float">
            <motion.div className="kh-card" style={{ rotateX, rotateY }}>
              {EDGE.map((z, i) => <span key={i} className="kh-edge" style={{ transform: `translateZ(${z}px)` }} />)}
              <div className="kh-back">
                <span className="kh-strip" />
                <span className="kh-sign"><em>Aarav Sharma</em><b>CVV •••</b></span>
                <span className="kh-note">{t('Kosh will never ask for your card PIN, CVV or OTP. Report fraud on 1930.')}</span>
                <span className="kh-back-foot"><LotusMark size={22} /> kosh</span>
              </div>

              {STACK.map((l, i) => (
                <motion.div key={l.key} className={`kh-layer kh-${l.key}`} custom={{ ...l, i, k }} variants={layer}
                  initial={reduce ? 'forged' : 'gather'} animate={phase}>
                  <span className="kh-tag">{t(l.tag)}</span>
                  {l.key === 'plate' && <span className="kh-brush" />}
                  {l.key === 'pattern' && <span className="kh-clip"><Rangoli className="kh-rangoli" rings={14} /><Rangoli className="kh-rangoli small" rings={10} /></span>}
                  {l.key === 'foil' && <>
                    <motion.span className="kh-foil" style={{ backgroundPosition: foilPos }} />
                    <motion.span className="kh-holo" style={{ filter: holoHue }}><LotusMark size={30} /></motion.span>
                  </>}
                  {l.key === 'type' && <>
                    <span className="kh-row"><span className="kh-brand"><LotusMark size={26} /> kosh</span><span className="kh-kind">{t('Platinum metal')}</span></span>
                    <span className="kh-number">5241&nbsp; ••••&nbsp; ••••&nbsp; 4821</span>
                    <span className="kh-row bottom">
                      <span><small>{t('Card holder')}</small>AARAV SHARMA</span>
                      <span><small>{t('Valid thru')}</small>08/31</span>
                      <span className="kh-network">RuPay</span>
                    </span>
                  </>}
                  {l.key === 'chip' && <><span className="kh-chip" /><span className="kh-wave"><Icon name="contactless" /></span></>}
                  {l.key === 'gloss' && <span className="kh-clip">
                    <motion.span className="kh-glare" style={{ background: glare }} />
                    <span className="kh-scan" />
                    <span className="kh-stamp"><Icon name="shield" />{t('Checked by Sentinel')}</span>
                    {phase === 'forged' && !reduce && <motion.span className="kh-flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0] }}
                      transition={{ duration: 0.7, delay: 0.1, times: [0, 0.15, 1] }} />}
                  </span>}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      <Orbits side="front" lit={phase === 'forged'} />

      {phase === 'forged' && !reduce && (
        <div className="kh-burst">
          {[0, 1, 2].map(i => (
            <motion.span key={i} className="kh-shock" initial={{ scale: 0.25, opacity: 0.9 }} animate={{ scale: 2.4 + i * 0.7, opacity: 0 }}
              transition={{ duration: 1.25 + i * 0.25, delay: 0.1 + i * 0.09, ease: [0.16, 1, 0.3, 1] }} />
          ))}
          {SPARKS.map((s, i) => (
            <motion.span key={`s${i}`} className="kh-spark" style={{ width: s.s, height: s.s }} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: s.x * k, y: s.y * k, opacity: 0, scale: 0.3 }} transition={{ duration: 1.1 + (i % 4) * 0.12, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} />
          ))}
        </div>
      )}
      <p className="kh-hint">{t('Drag to spin · tap to flip')}</p>
    </div>
  );
};
