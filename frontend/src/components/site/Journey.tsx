import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Icon } from '../common/Icon';
import { useI18n } from '../../i18n';
import { MetalCard } from './HeroCard';
import { rich } from './Story';
import '../../home.css';

/*
 * The home page as one journey ("Ek kadam, ek kahani"):
 * - TravelingCard: scrolling lifts the forged hero card, flies it down the right margin past the manifesto, and lands it
 *   in the card section, where CardFan spreads it into a hand with its siblings. FinaleCard brings it back in the light
 *   behind the temple doors.
 * - GoldenThread: a gold line that draws itself down the page with the scroll, beading at every section, ending at the
 *   footer lotus. Torch: a cursor light that reveals rangoli hidden in the dark. Dust: three parallax layers of gold.
 * All decorative (aria-hidden). Reduced motion or narrow screens: cards sit in their sections, the thread is drawn in
 * full, nothing follows the cursor or the scroll.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const POSE = { rotateX: 6, rotateY: -14, rotateZ: -5 };  // the hero card's resting pose; every hand-off lands on it
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const centre = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2, w: r.width };
};

/** The flying parts run only on wide screens with motion allowed. */
function useWideMotion() {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1025px)');
    const update = () => setOn(mq.matches && !reduce);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [reduce]);
  return on;
}

/** Re-measure whenever the page's layout changes (fonts, images, the pinned rail's height). */
function useRelayout(fn: () => void, enabled = true) {
  const cb = useRef(fn);
  useLayoutEffect(() => { cb.current = fn; });
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const run = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; cb.current(); }); };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(document.body);
    window.addEventListener('resize', run);
    return () => { ro.disconnect(); window.removeEventListener('resize', run); cancelAnimationFrame(raf); };
  }, [enabled]);
}

/* ------------------------------------------------------------------ the card's flight: hero → card section */

export const TravelingCard: React.FC = () => {
  const on = useWideMotion();
  const { scrollY } = useScroll();
  const x = useMotionValue(0), y = useMotionValue(0), scale = useMotionValue(1);
  const rotateX = useMotionValue(POSE.rotateX), rotateY = useMotionValue(POSE.rotateY), rotateZ = useMotionValue(POSE.rotateZ);
  const [w, setW] = useState(420);
  const geo = useRef<{ from: ReturnType<typeof centre>; to: ReturnType<typeof centre>; a: number; b: number } | null>(null);

  const place = (sy: number) => {
    const g = geo.current;
    if (!g) return;
    const t = clamp01((sy - g.a) / Math.max(1, g.b - g.a)), e = ease(t), arc = Math.sin(Math.PI * t);
    // Flown in screen space, so it never leaves view: from where the hero card sat when the flight began to the centre
    // of the screen, where the fan's slot arrives at the end. Mid-flight it hugs the right margin, clear of the text.
    const vh = window.innerHeight, lineX = g.from.x + (g.to.x - g.from.x) * e;
    const margin = window.innerWidth - 112;
    const cx = lineX + (margin - lineX) * Math.min(1, arc * 1.25);
    const cy = (g.from.y - g.a) + (vh / 2 - (g.from.y - g.a)) * e - arc * vh * 0.08;
    x.set(cx - g.from.w / 2);
    y.set(cy - g.from.w / 1.586 / 2);
    scale.set((1 + (g.to.w / g.from.w - 1) * e) * (1 - 0.6 * arc));
    rotateY.set(POSE.rotateY + 360 * e);
    rotateX.set(POSE.rotateX + 26 * arc);
    rotateZ.set(POSE.rotateZ + 16 * arc);
    const where = t <= 0 ? 'hero' : t >= 1 ? 'ring' : 'flying';
    if (document.body.dataset.card !== where) document.body.dataset.card = where;
  };

  useRelayout(() => {
    const from = document.querySelector('.kh-3d'), to = document.querySelector('.kj-fan-slot');
    if (!from || !to) { geo.current = null; return; }
    const f = centre(from), d = centre(to);
    geo.current = { from: f, to: d, a: window.innerHeight * 0.06, b: d.y - window.innerHeight / 2 };
    setW(f.w);
    place(window.scrollY);
  }, on);
  useMotionValueEvent(scrollY, 'change', v => { if (on) place(v); });
  useEffect(() => {
    if (!on) delete document.body.dataset.card;
    return () => { delete document.body.dataset.card; };
  }, [on]);

  if (!on) return null;
  return (
    <div className="kj-traveler" aria-hidden="true" style={{ '--w': `${w}px` } as Vars}>
      <motion.div className="kj-traveler-card" style={{ x, y, scale }}>
        <MetalCard style={{ rotateX, rotateY, rotateZ }} />
      </motion.div>
    </div>
  );
};

/* ------------------------------------------------------------------ the card section: it lands and fans into a hand */

export const CardFan: React.FC = () => {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const fan = useTransform(scrollYProgress, v => (reduce ? 1 : clamp01((v - 0.47) / 0.17)));
  const left = { x: useTransform(fan, v => `${-36 * v}%`), y: useTransform(fan, v => `${7 * v}%`), rotate: useTransform(fan, v => -14 * v), scale: useTransform(fan, v => 1 - 0.07 * v) };
  const right = { x: useTransform(fan, v => `${33 * v}%`), y: useTransform(fan, v => `${3 * v}%`), rotate: useTransform(fan, v => 11 * v), scale: useTransform(fan, v => 1 - 0.04 * v) };

  return (
    <section ref={ref} className="kl-ring kj-fan" aria-labelledby="ring-title">
      <div className="kl-ring-copy">
        <span className="kl-eyebrow">{t('Cards and accounts')}</span>
        <h2 id="ring-title">{rich(t('do more with *every rupee*.'))}</h2>
        <p>{t('Accounts, cards, deposits and loans in one place. Reminders before every due date, no hidden charges, and a clear view of what your money earns.')}</p>
        <a className="kl-link" href="#/products">{t('Explore products')} <Icon name="arrow-right" /></a>
      </div>
      <div className="kl-ring-stage kj-fan-stage" aria-hidden="true">
        <div className="kj-fan-slot">
          <motion.div className="kj-fan-card" style={left}><MetalCard variant="vajra" style={POSE} /></motion.div>
          <motion.div className="kj-fan-card" style={right}><MetalCard variant="neo" style={POSE} /></motion.div>
          <div className="kj-fan-card kj-fan-main"><MetalCard style={POSE} /></div>
        </div>
      </div>
    </section>
  );
};

/** The card returns: it drops into the light behind the opening temple doors (driven by the finale's --p). */
export const FinaleCard: React.FC = () => (
  <div className="kj-finale-card" aria-hidden="true">
    <span className="kj-finale-glow" />
    <div className="kj-finale-float"><MetalCard /></div>
  </div>
);

/* ------------------------------------------------------------------ the golden thread */

type Sample = { len: number; x: number; y: number; reach: number };

export const GoldenThread: React.FC<{ root: RefObject<HTMLElement | null> }> = ({ root }) => {
  const reduce = useReducedMotion();
  const [shape, setShape] = useState({ d: '', beads: [] as { x: number; y: number }[], h: 0 });
  const line = useRef<SVGPathElement>(null), glow = useRef<SVGPathElement>(null), spark = useRef<HTMLSpanElement>(null);
  const samples = useRef<Sample[]>([]), total = useRef(0), top = useRef(0);
  const { scrollY } = useScroll();

  useRelayout(() => {
    const el = root.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    top.current = base.top + window.scrollY;
    const W = base.width, narrow = W < 1025;
    const m = narrow ? 10 : Math.max(18, Math.min(44, W * 0.028));
    const rel = (r: DOMRect) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
    const sections = Array.from(el.querySelectorAll(':scope > section')).map(s => rel(s.getBoundingClientRect()));
    const card = el.querySelector('.kh-3d');
    if (sections.length < 2 || !card) return;
    const c = rel(card.getBoundingClientRect());
    const x0 = narrow ? m : c.x + c.w / 2, y0 = narrow ? sections[1].y : c.y + c.h + 70;
    const beads: { x: number; y: number }[] = [];
    let d = `M ${x0} ${y0}`, side = 0, x = m;
    if (!narrow) {  // spool out of the card, curving down to the left margin as the hero ends
      const yb = sections[1].y;
      d += ` C ${x0} ${yb - 30}, ${m} ${y0 + 60}, ${m} ${yb + 40}`;
    }
    const r = narrow ? 5 : 9;
    sections.slice(1).forEach((s, i, rest) => {
      const by = s.y + Math.min(170, s.h / 3);  // a bead near each section's heading
      d += ` L ${x} ${by - r} A ${r} ${r} 0 1 1 ${x} ${by + r} A ${r} ${r} 0 1 1 ${x} ${by - r} L ${x} ${by + r}`;
      beads.push({ x, y: by });
      const next = rest[i + 1];
      if (!next) { d += ` L ${x} ${s.y + s.h - 60}`; return; }
      if (narrow) return;
      side = 1 - side;  // cross the page in the seam between sections, then run down the other margin
      const nx = side ? W - m : m, yb = next.y;
      d += ` L ${x} ${yb - 80} C ${x} ${yb}, ${nx} ${yb}, ${nx} ${yb + 80}`;
      x = nx;
    });
    const logo = document.querySelector('.k-footer .k-logo svg');
    if (logo && !narrow) {  // tie off around the footer lotus
      const l = rel(logo.getBoundingClientRect()), lx = l.x + l.w / 2, ly = l.y + l.h / 2, lr = l.w / 2 + 12;
      const last = sections[sections.length - 1];
      d += ` C ${x} ${last.y + last.h + 40}, ${lx + lr * 2} ${ly - lr * 2}, ${lx + lr} ${ly} A ${lr} ${lr} 0 1 1 ${lx + lr - 0.1} ${ly - 0.1}`;
    }
    setShape({ d, beads, h: Math.ceil(base.height) });
  });

  const draw = (sy: number) => {
    const list = samples.current, L = total.current;
    if (!list.length || !line.current || !glow.current) return;
    let len = L, at = list[list.length - 1];
    if (!reduce) {
      const tip = sy + window.innerHeight * 0.66 - top.current;
      let lo = 0, hi = list.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].reach < tip) lo = mid + 1; else hi = mid; }
      at = list[Math.max(0, lo - 1)];
      len = lo === 0 ? 0 : at.len;
    }
    const off = String(L - len);
    line.current.style.strokeDashoffset = off;
    glow.current.style.strokeDashoffset = off;
    if (spark.current) {
      spark.current.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
      spark.current.style.opacity = !reduce && len > 0 && len < L ? '1' : '0';
    }
  };
  // Sample the path once per shape: (length, point, highest y reached so far) for the scroll lookup.
  useEffect(() => {
    const p = line.current;
    if (!p || !shape.d) return;
    total.current = p.getTotalLength();
    for (const el of [line.current, glow.current]) el?.style.setProperty('stroke-dasharray', String(total.current));
    const n = Math.min(2400, Math.max(300, Math.round(total.current / 6)));
    let reach = -Infinity;
    samples.current = Array.from({ length: n + 1 }, (_, i) => {
      const len = (total.current * i) / n, pt = p.getPointAtLength(len);
      reach = Math.max(reach, pt.y);
      return { len, x: pt.x, y: pt.y, reach };
    });
    draw(window.scrollY);
  }, [shape.d]);  // eslint-disable-line react-hooks/exhaustive-deps

  useMotionValueEvent(scrollY, 'change', draw);

  return (
    <div className="kj-thread" aria-hidden="true" style={{ height: shape.h }}>
      <svg width="100%" height={shape.h}>
        <defs>
          <linearGradient id="kj-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6dc94" /><stop offset=".5" stopColor="#d4a24c" /><stop offset="1" stopColor="#f3d27f" />
          </linearGradient>
        </defs>
        <path ref={glow} d={shape.d} className="kj-thread-glow" />
        <path ref={line} d={shape.d} className="kj-thread-line" stroke="url(#kj-gold)" />
        {shape.beads.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r="3" className="kj-bead" />)}
      </svg>
      <span ref={spark} className="kj-spark" />
    </div>
  );
};

/* ------------------------------------------------------------------ torchlight and dust */

const TILE = 220;
const RANGOLI_TILE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}' viewBox='0 0 220 220'><g fill='none' stroke='#e2b964' stroke-width='1'>${
    Array.from({ length: 8 }, (_, i) => `<ellipse cx='110' cy='110' rx='98' ry='32' transform='rotate(${i * 22.5} 110 110)'/>`).join('')
  }<circle cx='110' cy='110' r='12'/><circle cx='0' cy='0' r='18'/><circle cx='220' cy='0' r='18'/><circle cx='0' cy='220' r='18'/><circle cx='220' cy='220' r='18'/></g></svg>`,
)}")`;
const R = 280;

/** A soft gold light under the cursor that reveals rangoli hidden in the dark (pattern fixed to the page). */
export const Torch: React.FC = () => {
  const reduce = useReducedMotion();
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let mx = 0, my = 0, raf = 0;
    const paint = () => {
      raf = 0;
      const ox = mx - R, oy = my - R;
      if (outer.current) outer.current.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
      const px = ((ox % TILE) + TILE) % TILE, py = (((oy + window.scrollY) % TILE) + TILE) % TILE;
      if (inner.current) inner.current.style.transform = `translate3d(${-px}px, ${-py}px, 0)`;
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const move = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; outer.current?.classList.add('on'); queue(); };
    const leave = () => outer.current?.classList.remove('on');
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('scroll', queue, { passive: true });
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', queue);
      document.documentElement.removeEventListener('mouseleave', leave);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);
  return (
    <div ref={outer} className="kj-torch" aria-hidden="true">
      <div ref={inner} className="kj-torch-pattern" style={{ backgroundImage: RANGOLI_TILE } as Vars} />
    </div>
  );
};

const DUST = [{ cls: 'far', speed: 0.12, tile: 420 }, { cls: 'mid', speed: 0.3, tile: 320 }, { cls: 'near', speed: 0.55, tile: 260 }];

/** Three layers of gold dust drifting at different speeds as the page scrolls: depth behind everything. */
export const Dust: React.FC = () => {
  const reduce = useReducedMotion();
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      DUST.forEach((l, i) => {
        const el = layers.current[i];
        if (el) el.style.transform = `translate3d(0, ${-((window.scrollY * l.speed) % l.tile)}px, 0)`;
      });
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', queue, { passive: true });
    return () => { window.removeEventListener('scroll', queue); cancelAnimationFrame(raf); };
  }, [reduce]);
  return (
    <div className="kj-dust" aria-hidden="true">
      {DUST.map((l, i) => <div key={l.cls} ref={el => { layers.current[i] = el; }} className={`kj-dust-layer ${l.cls}`} />)}
    </div>
  );
};
