import React, { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { LotusMark, Rangoli } from '../common/KoshLogo';
import { motion } from '../common/Animate';

/*
 * Decorative motion for the home page's lower sections (Lux.tsx). Everything here is aria-hidden with nothing
 * focusable inside; reduced motion gets the finished, still state. Desktop only (hidden at 1024 px and below in lux.css).
 */

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;
const DESKTOP = '(min-width: 1025px)';

/* ------------------------------------------------------------------ coin orbit (Rewards) */

type Ring = { rx: number; ry: number; tilt: number; rev: number };  // rev: slow orbit, turns per second
const FACES = ['₹', 'pts', '%', 'lotus'] as const;
const COINS = Array.from({ length: 12 }, (_, i) => ({
  ring: i % 3,
  at: Math.floor(i / 3) / 4 + (i % 3) * 0.11,
  face: FACES[(i + Math.floor(i / 3)) % 4],
  size: [76, 58, 68, 54][(i + Math.floor(i / 3)) % 4],
  spin: [38, -52, 30, -44][i % 4],    // deg per second once settled
  lean: [-22, 18, -12, 26][(i * 3) % 4],
}));
const EDGE = [-2, -1, 0, 1, 2];  // slices through a 5 px rim
const STILL = [0, 0.05, 0.05];  // reduced motion: per-ring turn that keeps the parked coins apart and off the copy

const ringsFor = (w: number): Ring[] => {
  const R = Math.min(w * 0.4, 600);
  return [
    { rx: R, ry: R * 0.42, tilt: -11, rev: 1 / 46 },
    { rx: R * 0.8, ry: R * 0.56, tilt: 14, rev: -1 / 58 },
    { rx: R * 1.1, ry: R * 0.37, tilt: 3, rev: 1 / 72 },
  ];
};

/**
 * Gold coins burst from behind the headline, whirl on three tilted orbits (passing behind and in front of the copy by
 * switching z-index on the near half), slow down and settle on gold rings, then keep a slow orbit while on screen.
 * The section must be its own stacking context with the copy at z-index 1; this layer must not create one.
 */
export const CoinOrbit: React.FC = () => {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const coins = useRef<(HTMLSpanElement | null)[]>([]);
  const clock = useRef(0);
  const inView = useInView(box, { amount: 0.4 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState<'idle' | 'burst' | 'settled'>('idle');

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rings = ringsFor(size.w);
  const staged = useRef(stage);

  useEffect(() => {
    if (!size.w || !window.matchMedia(DESKTOP).matches) return;
    const rings = ringsFor(size.w);
    const paint = (t: number | null) => {  // t: seconds since the burst; null = the still, settled pose
      const still = t === null;
      const s = still ? 1 : 1 - Math.exp(-4.2 * t) * Math.cos(7 * t);          // radius: a springy burst outwards
      COINS.forEach((c, i) => {
        const el = coins.current[i];
        if (!el) return;
        const ring = rings[c.ring];
        const whip = still ? 0 : Math.sign(ring.rev) * 1.4 * (1 - Math.exp(-t / 0.8));  // extra turns, fast then easing
        const th = 2 * Math.PI * (c.at + (still ? STILL[c.ring] : ring.rev * t) + whip);
        const x = s * ring.rx * Math.cos(th), y = s * ring.ry * Math.sin(th);
        const a = (ring.tilt * Math.PI) / 180;
        const depth = Math.sin(th);  // +1 nearest the viewer (lower half of the orbit)
        const near = (depth + 1) / 2;
        const spin = still ? c.lean : c.lean + c.spin * t + 1260 * (1 - Math.exp(-t / 0.9));
        el.style.transform = `translate3d(${(x * Math.cos(a) - y * Math.sin(a)).toFixed(1)}px,${(x * Math.sin(a) + y * Math.cos(a)).toFixed(1)}px,0) scale(${(0.7 + 0.38 * near).toFixed(3)})`;
        el.style.zIndex = depth > 0.04 ? '2' : '0';
        el.style.opacity = ((still ? 1 : Math.min(1, t * 5)) * (0.5 + 0.5 * near)).toFixed(3);
        (el.firstElementChild as HTMLElement).style.transform = `rotateX(14deg) rotateY(${spin.toFixed(1)}deg)`;
      });
    };
    if (reduce) { paint(null); return; }
    if (!inView) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      clock.current += Math.min(0.05, (now - last) / 1000);
      last = now;
      paint(clock.current);
      const next = clock.current > 2.6 ? 'settled' : 'burst';
      if (staged.current !== next) { staged.current = next; setStage(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, inView, size.w]);

  const settled = reduce || stage === 'settled';
  return (
    <div ref={box} className={`kl-coins ${settled ? 'is-settled' : ''}`} aria-hidden="true">
      {size.w > 0 && (
        <svg className="kl-coin-rings" viewBox={`${-size.w / 2} ${-size.h / 2} ${size.w} ${size.h}`}>
          {rings.map((r, i) => (
            <ellipse key={i} rx={r.rx} ry={r.ry} transform={`rotate(${r.tilt})`} pathLength={1} style={{ '--i': i } as Vars} />
          ))}
        </svg>
      )}
      {stage !== 'idle' && !reduce && [0, 1].map(i => (
        <motion.span key={i} className="kl-coin-shock" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 2.6 + i * 0.8, opacity: 0 }}
          transition={{ duration: 1.4 + i * 0.3, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }} />
      ))}
      {COINS.map((c, i) => (
        <span key={i} ref={el => { coins.current[i] = el; }} className="kl-coin" style={{ '--s': `${c.size}px` } as Vars}>
          <span className="kl-coin-body">
            {EDGE.map(z => <i key={z} className="kl-coin-edge" style={{ transform: `translateZ(${z}px)` }} />)}
            <b className="kl-coin-face front">{c.face === 'lotus' ? <LotusMark size={c.size * 0.62} /> : <span className={c.face === 'pts' ? 'pts' : undefined}>{c.face}</span>}</b>
            <b className="kl-coin-face back"><Rangoli rings={8} /></b>
          </span>
        </span>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ Kavach force field (SentinelDemo) */

/** Hex cells on a unit disc, projected onto a dome (packed tighter towards the rim), as SVG point lists. */
const HEXES = (() => {
  const s = 0.105, out: { points: string; r: number; d: number }[] = [];
  const dome = (x: number, y: number) => {
    const r = Math.hypot(x, y);
    const k = r < 1e-6 ? Math.PI / 2 : Math.sin(Math.min(1, r) * Math.PI / 2) / r;
    return [x * k, y * k];
  };
  for (let row = -10; row <= 10; row++) {
    for (let col = -10; col <= 10; col++) {
      const cx = (col + (row & 1 ? 0.5 : 0)) * Math.sqrt(3) * s, cy = row * 1.5 * s;
      if (Math.hypot(cx, cy) > 0.97) continue;
      const pts = Array.from({ length: 6 }, (_, k) => {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        return dome(cx + Math.cos(a) * s * 0.9, cy + Math.sin(a) * s * 0.9).map(v => v.toFixed(3)).join(',');
      }).join(' ');
      const [px, py] = dome(cx, cy);
      out.push({ points: pts, r: Math.hypot(px, py), d: Math.round((1 - (py + 1) / 2) * 820 + Math.abs(px) * 120) });
    }
  }
  return out;
})();

/** Threats hit the rim at angle `a` (deg, 0 = right, 90 = down) and glance off; positions in % of the field box. */
const THREATS = [{ a: 200, slant: 0.55 }, { a: 148, slant: -0.6 }, { a: 246, slant: 0.5 }, { a: 112, slant: 0.45 }].map(({ a, slant }, i) => {
  const r = (a * Math.PI) / 180, n = [Math.cos(r), Math.sin(r)];
  const raw = [-n[0] - n[1] * slant, -n[1] + n[0] * slant], len = Math.hypot(raw[0], raw[1]);
  const d = [raw[0] / len, raw[1] / len];                       // incoming direction
  const dot = d[0] * n[0] + d[1] * n[1];
  const b = [d[0] - 2 * dot * n[0], d[1] - 2 * dot * n[1]];     // reflected off the dome
  const pc = (u: number) => `${(50 + 50 * u).toFixed(1)}`;
  return {
    hx: pc(n[0]), hy: pc(n[1]),
    vars: {
      '--x0': `${pc(n[0] - d[0] * 1.15)}cqw`, '--y0': `${pc(n[1] - d[1] * 1.15)}cqh`,
      '--x1': `${pc(n[0])}cqw`, '--y1': `${pc(n[1])}cqh`,
      '--x2': `${pc(n[0] + b[0] * 0.8)}cqw`, '--y2': `${pc(n[1] + b[1] * 0.8)}cqh`,
      '--delay': `${1.5 + i * 1.5}s`,
    } as Vars,
  };
});

/**
 * A hexagonal dome forms over the sample payment (bottom row first), then red threat sparks fly in and glance off with
 * ripples while the real payment, a gold dot, passes straight through. Loops only while on screen.
 */
export const ForceField: React.FC<{ on: boolean }> = ({ on }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const live = useInView(ref, { amount: 0.3 });
  return (
    <div ref={ref} className={`kl-field ${on || reduce ? 'is-on' : ''} ${live ? 'is-live' : ''}`} aria-hidden="true">
      <svg viewBox="-1 -1 2 2" preserveAspectRatio="none">
        <defs>
          <radialGradient id="kl-field-fill">
            <stop offset=".55" stopColor="#4fd1a5" stopOpacity="0" />
            <stop offset=".9" stopColor="#4fd1a5" stopOpacity=".07" />
            <stop offset="1" stopColor="#d4a24c" stopOpacity=".2" />
          </radialGradient>
          <radialGradient id="kl-field-gloss" cx=".3" cy=".22" r=".5">
            <stop offset="0" stopColor="#fff" stopOpacity=".16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="kl-field-line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#4fd1a5" />
            <stop offset=".55" stopColor="#9fe6cf" />
            <stop offset="1" stopColor="#f0c870" />
          </linearGradient>
        </defs>
        <circle className="kl-field-glass" r="1" fill="url(#kl-field-fill)" />
        <g className="kl-field-hex" stroke="url(#kl-field-line)">
          {HEXES.map((c, i) => (
            <polygon key={i} points={c.points} style={{ '--d': `${c.d}ms`, strokeOpacity: 0.06 + c.r ** 3 * 0.7, fillOpacity: c.r ** 4 * 0.12 } as Vars} />
          ))}
        </g>
        <circle className="kl-field-glass" r="1" fill="url(#kl-field-gloss)" />
        <circle className="kl-field-halo" r="1" stroke="url(#kl-field-line)" />
        <circle className="kl-field-rim" r="1" stroke="url(#kl-field-line)" />
        <path className="kl-field-shine" d="M-.82 -.36A.9 .9 0 0 1 -.3 -.84" />
      </svg>
      {!reduce && (
        <div className="kl-field-fx">
          {THREATS.map((t, i) => (
            <React.Fragment key={i}>
              <i className="kl-ripple" style={{ ...t.vars, left: `${t.hx}%`, top: `${t.hy}%` }} />
              {[0, 1, 2].map(k => <i key={k} className="kl-threat" style={{ ...t.vars, '--lag': `${k * 0.035}s`, '--k': k } as Vars} />)}
            </React.Fragment>
          ))}
          <i className="kl-ripple pass" style={{ left: '20%', top: '90%', '--delay': '1.59s' } as Vars} />
          <i className="kl-ripple pass" style={{ left: '80%', top: '90%', '--delay': '2.81s' } as Vars} />
          {[0, 1, 2].map(k => <i key={k} className="kl-pay-dot" style={{ '--lag': `${k * 0.04}s`, '--k': k } as Vars} />)}
        </div>
      )}
    </div>
  );
};
