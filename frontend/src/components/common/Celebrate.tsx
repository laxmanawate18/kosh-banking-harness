import React from 'react';

const COLORS = ['#f5b53d', '#e8740c', '#e5487a', '#4c5bd4', '#0c7461'];
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const dist = 60 + (i % 3) * 22;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 10, c: COLORS[i % COLORS.length], d: (i % 4) * 40 };
});

/** Success moment: a lit diya with a one-shot spark burst. Rare-event delight only (payments, onboarding). */
export const Celebrate: React.FC = () => (
  <div className="k-celebrate" aria-hidden="true">
    <div className="k-sparks">
      {SPARKS.map((s, i) => (
        <i key={i} style={{ '--x': `${s.x}px`, '--y': `${s.y}px`, '--c': s.c, '--delay': `${s.d}ms` } as React.CSSProperties} />
      ))}
    </div>
    <svg className="k-diya" viewBox="0 0 96 96">
      <path className="flame" d="M48 14c7 10 9 17 9 22a9 9 0 0 1-18 0c0-5 2-12 9-22Z" fill="#f5b53d" />
      <path className="flame" d="M48 26c3 5 4 8 4 11a4 4 0 0 1-8 0c0-3 1-6 4-11Z" fill="#fff3c4" />
      <path d="M16 54h64c0 16-14 26-32 26S16 70 16 54Z" fill="#e8740c" />
      <path d="M16 54h64" stroke="#a8500a" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 64c6 4 30 4 36 0" stroke="#ffd37a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  </div>
);
