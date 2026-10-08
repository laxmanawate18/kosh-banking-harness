import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import { useI18n } from '../../i18n';

/*
 * Decorative pieces for the home story (Story.tsx). All aria-hidden by their parents, nothing focusable.
 * - Manifesto glyphs: one small 3D moment per accent phrase; CSS plays it when WordReveal adds .on (story.css).
 * - Split-flap characters for the stats board.
 * - The carved temple door of the finale.
 */

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/* ------------------------------------------------------------------ manifesto glyphs */

const PETALS = [-80, 80, -54, 54, -27, 27, 0];  // painted outer to inner, so the centre petal sits in front

const Lotus = () => (
  <span className="kg kg-lotus">
    <i className="kg-halo" />
    {PETALS.map(a => (
      <i key={a} className="kg-petal" style={{ '--a': `${a}deg`, '--d': `${Math.abs(a) * 5}ms`, '--s': 1 - Math.abs(a) / 340 } as Vars} />
    ))}
    <i className="kg-pad" />
  </span>
);

const Greeting = () => {
  const { t } = useI18n();
  return <span className="kg kg-sign">{['Hello', 'Namaste', 'Namaskar'].map(w => <b key={w}>{t(w)}</b>)}</span>;
};

const Coin = () => (
  <span className="kg kg-coin">
    <span className="kg-spin">
      {[1, 2, 3, 4, 5, 6].map(z => <i key={z} style={{ '--z': z } as Vars} />)}
      <b className="back">₹</b>
      <b>₹</b>
    </span>
  </span>
);

const Bubble = () => (
  <span className="kg kg-chat"><span className="kg-bubble">{[0, 1, 2].map(n => <i key={n} style={{ '--n': n } as Vars} />)}</span></span>
);

const Shield = () => (
  <span className="kg kg-shield"><i /><i /><span className="kg-badge"><Icon name="shield" /></span></span>
);

/** The diya from Celebrate.tsx, in the site's gold. */
const Diya = () => (
  <span className="kg kg-diya">
    <i className="kg-glow" />
    <svg viewBox="12 8 72 76">
      <g className="kg-flicker">
        <path className="kg-flame" d="M48 14c7 10 9 17 9 22a9 9 0 0 1-18 0c0-5 2-12 9-22Z" fill="#f5c45e" />
        <path className="kg-flame" d="M48 26c3 5 4 8 4 11a4 4 0 0 1-8 0c0-3 1-6 4-11Z" fill="#fff6d8" />
      </g>
      <path d="M16 54h64c0 16-14 26-32 26S16 70 16 54Z" fill="#b8862f" />
      <path d="M16 54h64" stroke="#f3d9a0" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 64c6 4 30 4 36 0" stroke="#7d5418" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  </span>
);

const GLYPHS = [Lotus, Greeting, Coin, Bubble, Shield, Diya];

/** The nth "*…*" phrase of the manifesto's glyph: bharosa, their language, every rupee, Mitra, Sentinel, home. */
export const Glyph: React.FC<{ n: number }> = ({ n }) => React.createElement(GLYPHS[n]);

/* ------------------------------------------------------------------ split-flap board */

const FLIP_MS = 150;  // one character change: the top half falls (75 ms), the bottom half lands (75 ms)
const DRUMS = ['0123456789', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** The characters a flap shows on its way to `c`: digits and letters roll through their drum, symbols flip once. */
const drum = (c: string, flips: number) => {
  const set = DRUMS.find(d => d.includes(c));
  if (!set) return [c];
  const at = set.indexOf(c);
  return Array.from({ length: flips }, (_, k) => set[(at - flips + 1 + k + set.length * 4) % set.length]);
};

const FlapCell: React.FC<{ char: string; run: boolean; still: boolean; delay: number; flips: number }> = ({ char, run, still, delay, flips }) => {
  const [f, setF] = useState({ cur: ' ', next: ' ', n: 0, done: false });
  useEffect(() => {
    if (!run || still) return;
    const seq = drum(char, flips);
    let k = 0;
    let timer = window.setTimeout(function step() {
      const next = seq[k], last = ++k === seq.length;
      setF(prev => ({ cur: prev.next, next, n: prev.n + 1, done: last }));
      if (!last) timer = window.setTimeout(step, FLIP_MS);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [run, still, char, delay, flips]);

  const { cur, next, n, done } = still ? { cur: char, next: char, n: 0, done: false } : f;
  const size = char === '.' || char === ',' ? 'narrow' : char === '%' ? 'wide' : '';
  return (
    <span className={`kf-cell ${size} ${done ? 'done' : ''}`} style={{ '--ms': `${FLIP_MS / 2}ms` } as Vars}>
      <span className="kf-half top"><span>{next}</span></span>
      <span className="kf-half bottom"><span>{n ? cur : next}</span></span>
      {n > 0 && (
        <React.Fragment key={n}>
          <span className="kf-half top kf-fall"><span>{cur}</span></span>
          <span className="kf-half bottom kf-land"><span>{next}</span></span>
        </React.Fragment>
      )}
    </span>
  );
};

/** A figure on the departure board. Decorative: the caller gives screen readers the value. */
export const FlapBoard: React.FC<{ text: string; run: boolean; still: boolean; delay: number }> = ({ text, run, still, delay }) => (
  <span className="kf" aria-hidden="true">
    {[...text].map((c, i) => <FlapCell key={i} char={c} run={run} still={still} delay={delay + i * 120} flips={5 + i * 2} />)}
  </span>
);

/* ------------------------------------------------------------------ temple doors */

/** Carved relief: each motif is drawn three times (shadow, highlight, gold) so it reads as cut into the wood. */
const Carve: React.FC<{ id: string }> = ({ id }) => (
  <svg className="ks-carve">
    <use href={`#${id}`} className="sh" x="1" y="1.4" />
    <use href={`#${id}`} className="hi" x="-.7" y="-.9" />
    <use href={`#${id}`} className="gd" />
  </svg>
);

const ring = (n: number, child: React.ReactNode, offset = 0) =>
  Array.from({ length: n }, (_, i) => <g key={i} transform={`rotate(${offset + (i * 360) / n} 60 60)`}>{child}</g>);

/** The motifs, defined once per page and referenced by every panel. */
export const DoorCarvings = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <defs>
      <symbol id="ks-medal" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet">
        <circle cx="60" cy="60" r="56" /><circle cx="60" cy="60" r="50" />
        {ring(24, <ellipse cx="60" cy="17" rx="3" ry="5" />)}
        <circle cx="60" cy="60" r="36" />
        {ring(8, <path d="M60 60C67 50 67 36 60 27C53 36 53 50 60 60Z" />)}
        {ring(8, <path d="M60 60C64 53 64 45 60 39C56 45 56 53 60 60Z" />, 22.5)}
        <circle cx="60" cy="60" r="7" /><circle cx="60" cy="60" r="2.5" />
      </symbol>
      <symbol id="ks-tall" viewBox="0 0 120 220" preserveAspectRatio="xMidYMid meet">
        <use href="#ks-medal" x="8" y="58" width="104" height="104" />
        <path d="M60 6C70 22 70 40 60 52C50 40 50 22 60 6Z" /><path d="M60 214C70 198 70 180 60 168C50 180 50 198 60 214Z" />
        <path d="M38 40Q60 24 82 40" /><path d="M38 180Q60 196 82 180" />
        <circle cx="30" cy="46" r="3" /><circle cx="90" cy="46" r="3" /><circle cx="30" cy="174" r="3" /><circle cx="90" cy="174" r="3" />
      </symbol>
    </defs>
  </svg>
);

/** One leaf: carved panels between rows of brass studs, hinge straps, a ring handle and a solid edge that catches the light. */
export const TempleDoor: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <div className={`ks-door ${side}`} aria-hidden="true">
    <span className="ks-door-edge" />
    <span className="ks-door-face">
      <span className="ks-door-grid">
        <span className="ks-panel-c"><Carve id="ks-medal" /></span>
        <span className="ks-panel-c"><Carve id="ks-medal" /></span>
        <span className="ks-studs" />
        <span className="ks-panel-c tall"><Carve id="ks-tall" /></span>
        <span className="ks-panel-c tall"><Carve id="ks-tall" /></span>
        <span className="ks-studs" />
        <span className="ks-panel-c"><Carve id="ks-medal" /></span>
        <span className="ks-panel-c"><Carve id="ks-medal" /></span>
      </span>
      <span className="ks-strap a" /><span className="ks-strap b" />
      <span className="ks-astragal" />
      <span className="ks-handle"><i /></span>
      <span className="ks-sheen" />
    </span>
  </div>
);

/** Dust in the light: fixed pseudo-random positions so renders are stable. */
const MOTES = Array.from({ length: 26 }, (_, i) => ({
  '--x': `${22 + ((i * 37) % 56)}%`,
  '--y': `${18 + ((i * 53) % 70)}%`,
  '--s': `${2 + (i % 4) * 1.5}px`,
  '--dx': `${((i * 29) % 9) - 4}vw`,
  '--dur': `${9 + (i % 5) * 2.2}s`,
  '--delay': `${-((i * 1.7) % 11)}s`,
}) as Vars);

export const Motes = () => <div className="ks-motes" aria-hidden="true">{MOTES.map((m, i) => <i key={i} style={m} />)}</div>;
