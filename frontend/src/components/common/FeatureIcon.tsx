import React from 'react';
import '../../feature-icons.css';

/**
 * Kosh premium feature icons: glossy tile badges (or bare illustrations) with a short
 * signature animation that plays once on scroll-in, on hover/focus of the icon or any
 * `.fi-host` ancestor, and on a 4s cycle when `loop` is set. Motion lives in feature-icons.css.
 */
export const FEATURE_ICONS = [
  'savings', 'cards', 'deposits', 'loans', 'upi', 'kavach', 'mitra', 'bills', 'rates', 'send', 'nri', 'kisan',
  'student', 'senior', 'women', 'business', 'rewards', 'payee', 'statement',
] as const;
export type FeatureIconName = (typeof FEATURE_ICONS)[number];

interface FeatureIconProps {
  name: FeatureIconName;
  size?: number;
  variant?: 'tile' | 'bare';
  loop?: boolean;
  className?: string;
  title?: string;
}

/** Per-render drawing context: gradient urls + ink colour for the current variant. */
type Ctx = { u: (k: string) => string; ink: string; cut: string; clip: string };

const d = (ms: number, extra?: Record<string, string>) => ({ '--d': `${ms}ms`, ...extra }) as React.CSSProperties;
/** Dark platinum palette: graphite shade, engraving ink, dark bronze for marks cut into gold. */
const SHADE = '#07080a';
const INK = '#33363d';
const BRONZE = '#5a3d10';

/** Four-point sparkle centred on (cx, cy). */
const star = (cx: number, cy: number, r: number, k = 0.22) => {
  const c = r * k;
  return `M${cx} ${cy - r}Q${cx + c} ${cy - c} ${cx + r} ${cy}Q${cx + c} ${cy + c} ${cx} ${cy + r}Q${cx - c} ${cy + c} ${cx - r} ${cy}Q${cx - c} ${cy - c} ${cx} ${cy - r}Z`;
};

const QR_ROWS = ['xxx101xxx', 'xxx011xxx', 'xxx100xxx', '101xxx110', '010xxx011', '110xxx101', 'xxx110010', 'xxx011101', 'xxx101011'];

/** Ground shadow override per icon: [cx, cy, rx] or null for none. Default [32, 50.5, 15]. */
const SHADOWS: Partial<Record<FeatureIconName, [number, number, number] | null>> = {
  deposits: [32, 51, 19], rates: [30, 50.5, 16], send: [29, 52, 11], women: [30, 51, 11], upi: null,
  kisan: [32, 50, 19], nri: [32, 49.5, 11], cards: [33, 51.5, 16], mitra: [30, 50, 12],
  student: [32, 48.5, 12], payee: [30, 51.5, 15], statement: [31, 52, 13],
};

const ART: Record<FeatureIconName, (c: Ctx) => React.ReactNode> = {
  savings: ({ u, ink }) => (
    <>
      <g className="fi-a fi-p-squish">
        <path d="M17.2 36.5c-3.2.2-4.6-2.3-3.1-3.8 1.2-1.2 3-.2 2.3 1.4" fill="none" stroke={u('body2')} strokeWidth="2" strokeLinecap="round" />
        <rect x="21.5" y="41" width="6" height="8" rx="2.4" fill={u('body2')} />
        <rect x="35.5" y="41" width="6" height="8" rx="2.4" fill={u('body2')} />
        <path d="M23.8 28.2 25.6 21c.3-1 1.5-1.3 2.2-.5l4.4 5Z" fill={u('body2')} />
        <ellipse cx="31" cy="35" rx="15.5" ry="11.5" fill={u('body')} />
        <ellipse cx="31" cy="39.5" rx="12" ry="5.5" fill={SHADE} opacity=".08" />
        <rect x="43" y="30.5" width="6.5" height="8.5" rx="3.2" fill={u('body2')} />
        <circle cx="46.8" cy="33.5" r=".85" fill={ink} opacity=".65" />
        <circle cx="46.8" cy="36.2" r=".85" fill={ink} opacity=".65" />
        <circle cx="39.3" cy="31.2" r="1.4" fill={ink} />
        <rect x="25.5" y="25" width="10" height="2.4" rx="1.2" fill={ink} opacity=".8" />
        <path d="M19.8 31.5c1.6-3 4.6-5 8-5.4" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g className="fi-a fi-p-coin">
        <circle cx="30.5" cy="14" r="6" fill={u('goldSide')} />
        <circle cx="30.5" cy="13.2" r="6" fill={u('gold')} />
        <circle cx="30.5" cy="13.2" r="3.8" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.1" />
        <path d="M29.3 11.4h2.8M29.3 13h2.8M30.1 11.4c1.3 0 1.8.7 1.8 1.4s-.6 1.4-1.8 1.4h-.7l2.2 2" fill="none" stroke={BRONZE} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  ),

  cards: ({ u, ink }) => (
    <>
      <g transform="rotate(-13 30 30)">
        <rect x="11.5" y="17" width="34" height="22" rx="4" fill={u('body2')} />
        <rect x="11.5" y="21.5" width="34" height="4.2" fill={SHADE} opacity=".45" />
        <rect x="11.5" y="17" width="34" height="22" rx="4" fill="none" stroke="#fff" strokeOpacity=".3" />
      </g>
      <g className="fi-a fi-p-lift">
        <rect x="17.5" y="26" width="34" height="22" rx="4" fill={SHADE} opacity=".35" transform="translate(0 1.6)" />
        <rect x="17.5" y="26" width="34" height="22" rx="4" fill={u('body')} />
        <rect x="21.5" y="30.5" width="7.5" height="6" rx="1.6" fill={u('gold')} />
        <path d="M21.5 33.5h7.5M25.2 30.5v6" stroke={BRONZE} strokeOpacity=".5" strokeWidth=".8" />
        <path d="M43.6 31.2a3.2 3.2 0 0 1 0 4.6M46.2 29.6a5.8 5.8 0 0 1 0 7.8" fill="none" stroke={ink} strokeOpacity=".5" strokeWidth="1.3" strokeLinecap="round" />
        {[21.5, 27.5, 33.5].map((x) => <rect key={x} x={x} y="40.4" width="4.6" height="1.9" rx=".95" fill={ink} opacity=".45" />)}
        <circle cx="44" cy="43.2" r="2.4" fill={ink} opacity=".55" />
        <circle cx="47.2" cy="43.2" r="2.4" fill={ink} opacity=".3" />
        <path className="fi-a fi-p-glint" d={star(23, 30.2, 4.2, 0.16)} fill="#fff" />
      </g>
    </>
  ),

  deposits: ({ u, ink }) => (
    <>
      {[[19.5, 2], [32, 4], [44.5, 6]].flatMap(([cx, n], s) =>
        Array.from({ length: n }, (_, k) => {
          const y = 44 - k * 4;
          return (
            <g key={`${s}-${k}`} className="fi-a fi-p-stack" style={d((s * 2 + k) * 45)}>
              <path d={`M${cx - 6} ${y}V${y + 4}A6 2.3 0 0 0 ${cx + 6} ${y + 4}V${y}Z`} fill={u('body2')} />
              <ellipse cx={cx} cy={y} rx="6" ry="2.3" fill={u('body')} />
              {k === n - 1 && <ellipse cx={cx} cy={y} rx="3.6" ry="1.2" fill="none" stroke={ink} strokeOpacity=".3" strokeWidth=".9" />}
            </g>
          );
        }),
      )}
      <path className="fi-a fi-p-rise" style={d(420)} d={star(47, 12.5, 4.6)} fill={u('gold')} />
      <path className="fi-a fi-p-rise" style={d(520)} d={star(53.5, 19.5, 2.2)} fill="#fff" />
    </>
  ),

  loans: ({ u, ink }) => (
    <>
      <rect x="38" y="16" width="5" height="10" rx="1.2" fill={u('body2')} />
      <path d="M18 29h28v17.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 18 46.5Z" fill={u('body')} />
      <rect x="18" y="31.8" width="28" height="2.4" fill={SHADE} opacity=".14" />
      <path d="M32 14.2 51 29.1c1.3 1 .6 3.1-1.1 3.1H14.1c-1.7 0-2.4-2.1-1.1-3.1Z" fill={u('body2')} />
      <path d="M17.5 29.5 32 18" stroke="#fff" strokeOpacity=".6" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="21.5" y="36" width="7" height="7" rx="1.6" fill={u('gold')} />
      <path d="M25 36v7M21.5 39.5h7" stroke={BRONZE} strokeOpacity=".6" strokeWidth="1.1" />
      <path d="M33 49V40.5a4 4 0 0 1 8 0V49Z" fill={u('goldSide')} />
      <g className="fi-a fi-p-door">
        <path d="M33 49V40.5a4 4 0 0 1 8 0V49Z" fill={ink} />
        <circle cx="38.8" cy="44.2" r="1" fill={u('body')} />
      </g>
    </>
  ),

  upi: ({ u, ink }) => (
    <>
      <path d="M11.5 19.5v-3.5a4.5 4.5 0 0 1 4.5-4.5h3.5M44.5 11.5H48a4.5 4.5 0 0 1 4.5 4.5v3.5M52.5 44.5V48a4.5 4.5 0 0 1-4.5 4.5h-3.5M19.5 52.5H16a4.5 4.5 0 0 1-4.5-4.5v-3.5" fill="none" stroke={u('body')} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="16" y="16.8" width="32" height="32" rx="5.5" fill={SHADE} opacity=".35" />
      <rect x="16" y="16" width="32" height="32" rx="5.5" fill={u('body')} />
      {[[18.5, 18.5], [36.5, 18.5], [18.5, 36.5]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <rect x={x + 1.3} y={y + 1.3} width="6.4" height="6.4" rx="1.8" fill="none" stroke={ink} strokeWidth="1.8" />
          <rect x={x + 3.2} y={y + 3.2} width="2.6" height="2.6" rx=".7" fill={ink} />
        </g>
      ))}
      {QR_ROWS.flatMap((row, j) => [...row].map((ch, i) => (ch === '1' ? <rect key={`${i}-${j}`} x={18.9 + i * 3} y={18.9 + j * 3} width="2.2" height="2.2" rx=".6" fill={ink} opacity=".85" /> : null)))}
      <rect x="28.4" y="28.4" width="7.2" height="7.2" rx="2.2" fill={u('gold')} />
      <circle cx="32" cy="32" r="1.4" fill={BRONZE} opacity=".7" />
      <g className="fi-a fi-p-scan">
        <rect x="16" y="11" width="32" height="6.4" fill={u('laserGlow')} />
        <rect x="12.5" y="16.6" width="39" height="1.8" rx=".9" fill={u('laser')} />
      </g>
    </>
  ),

  kavach: ({ u }) => (
    <>
      <path className="fi-a fi-p-ring" d="M32 12.5 47.5 18v12c0 9.6-6.4 16.6-15.5 20.5C22.9 46.6 16.5 39.6 16.5 30V18Z" fill="none" stroke="#d9dce2" strokeWidth="1.6" />
      <path d="M32 12.5 47.5 18v12c0 9.6-6.4 16.6-15.5 20.5C22.9 46.6 16.5 39.6 16.5 30V18Z" fill={u('body')} />
      <path d="M32 12.5 47.5 18v12c0 9.6-6.4 16.6-15.5 20.5Z" fill={SHADE} opacity=".1" />
      <path d="M32 16.4 44 20.6v9.3c0 7.5-4.9 13-12 16.3-7.1-3.3-12-8.8-12-16.3v-9.3Z" fill={u('enamel')} stroke={u('body2')} strokeWidth="1.3" />
      <path className="fi-a fi-p-draw" style={d(150)} d="M25.8 30.6 30.2 35l8.3-8.8" fill="none" stroke={u('gold')} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />
    </>
  ),

  mitra: ({ u, ink }) => (
    <>
      <rect x="29" y="10.5" width="24" height="16" rx="8" fill={u('body2')} />
      <path d="M23 15h16a11 11 0 0 1 11 11v4a11 11 0 0 1-11 11H25.5l-6.8 5.6c-.9.7-2.1 0-1.9-1.1l.8-5.3A11 11 0 0 1 12 30v-4a11 11 0 0 1 11-11Z" fill={u('body')} />
      <path d="M16.5 24.5c.8-3.4 3.6-5.8 7-6.3" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round" />
      {[22.5, 31, 39.5].map((cx, i) => <circle key={cx} className="fi-a fi-p-dot" style={d(i * 130)} cx={cx} cy="28" r="2.7" fill={ink} opacity={i === 1 ? 1 : 0.7} />)}
      <path className="fi-a fi-p-twinkle" d={star(50.5, 12, 5.2)} fill={u('gold')} />
      <path className="fi-a fi-p-twinkle" style={d(160)} d={star(55.5, 20, 2)} fill="#fff" />
    </>
  ),

  bills: ({ u, ink, cut, clip }) => (
    <>
      <rect x="15" y="11" width="34" height="5.6" rx="2.8" fill={u('body2')} />
      <rect x="18" y="13.1" width="28" height="1.5" rx=".75" fill={SHADE} opacity=".55" />
      <g clipPath={clip}>
        <g className="fi-a fi-p-print">
          <path d="M20 14H44V47.5l-3 2-3-2-3 2-3-2-3 2-3-2-3 2-3-2Z" fill={u('body')} />
          <rect x="23.5" y="19.5" width="11" height="2" rx="1" fill={ink} opacity=".32" />
          <rect x="23.5" y="24.5" width="17" height="2" rx="1" fill={ink} opacity=".32" />
          <rect x="23.5" y="29.5" width="8" height="2" rx="1" fill={ink} opacity=".32" />
          <rect x="23.5" y="36" width="10" height="2.4" rx="1.2" fill={ink} opacity=".75" />
        </g>
      </g>
      <g className="fi-a fi-p-pop" style={d(520)}>
        <circle cx="44" cy="42" r="8" fill={u('gold')} stroke={cut} strokeWidth="2.5" />
        <path d="M45.6 36.4 40.4 43h3.7l-1.6 5.6 5.2-6.7H44Z" fill={BRONZE} />
      </g>
    </>
  ),

  rates: ({ u }) => (
    <>
      {[[16, 39, 9, 'body2'], [26.5, 34, 14, 'body2'], [37, 28, 20, 'body']].map(([x, y, h, f], i) => (
        <rect key={i} className="fi-a fi-p-grow" style={d(i * 90)} x={x} y={y} width="7.5" height={h} rx="2.2" fill={u(f as string)} />
      ))}
      <path className="fi-a fi-p-draw" style={d(260)} d="M13.5 33.5 24.5 25.5l6.5 3.5 15.5-13" fill="none" stroke={u('goldLine')} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />
      <path className="fi-a fi-p-pop" style={d(720)} d="M40.5 15.2h6.4v6.4" fill="none" stroke={u('goldLine')} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  send: ({ u }) => (
    <>
      <path className="fi-a fi-p-fade" style={d(500)} d="M25.5 41.5c-3 3.2-6.8 5.2-11.5 5.6" fill="none" stroke={u('goldLine')} strokeWidth="2" strokeLinecap="round" strokeDasharray="2.4 3.4" />
      <g className="fi-a fi-p-fly">
        <path d="M28 35 50 15 39 47.5Z" fill={u('body2')} />
        <path d="M13 29.5 50 15 28 35Z" fill={u('body')} />
        <path d="M28 35 30.4 44.6 34.4 41Z" fill={SHADE} opacity=".45" />
        <path d="M28 35 50 15" stroke="#fff" strokeOpacity=".6" strokeWidth=".8" />
        <path d="M17 29 44 18.6" stroke="#fff" strokeOpacity=".8" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </>
  ),

  nri: ({ u, ink, clip }) => (
    <>
      <circle cx="32" cy="32" r="20" fill="none" stroke={u('body')} strokeOpacity=".6" strokeWidth="1.3" strokeDasharray="1.6 3" />
      <circle cx="32" cy="32" r="13.5" fill={u('body')} />
      <g clipPath={clip}>
        <path d="M22 21.5c2.5-1.8 6-1.6 7 .6s-1.2 3.2.6 5.4-1.6 4.6-4.4 3.4-4.8-3.8-3.2-9.4ZM35.5 31.5c2.8-1 5.6.2 6 3s-1.8 5.4-4.4 5.8-3.2-5.4-1.6-8.8ZM37 19.5c2-.6 4 .4 4.4 2.2-1.6.6-3.8.2-4.4-2.2Z" fill={u('body2')} />
        <ellipse cx="32" cy="32" rx="6" ry="13.5" fill="none" stroke={ink} strokeOpacity=".3" strokeWidth="1.2" />
        <path d="M18.5 32h27M20.5 25h23M20.5 39h23" stroke={ink} strokeOpacity=".3" strokeWidth="1.2" />
        <circle cx="36" cy="36" r="13.5" fill={SHADE} opacity=".12" transform="translate(4 4)" />
      </g>
      <path d="M21.6 25a12 12 0 0 1 6.4-5.8" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.6" strokeLinecap="round" />
      <g className="fi-a fi-p-orbit">
        <circle cx="32" cy="32" r="20" fill="none" />
        <g transform="translate(31 12) scale(.72) translate(-30 -12)"><path d="M37 12c0-.8-.7-1.3-1.7-1.3h-3.2l-3.4-4.4h-1.7l1.6 4.4h-3l-1.3-1.7h-1.2l.7 3-.7 3h1.2l1.3-1.7h3l-1.6 4.4h1.7l3.4-4.4h3.2c1 0 1.7-.5 1.7-1.3Z" fill={u('gold')} /></g>
      </g>
    </>
  ),

  kisan: ({ u, ink }) => (
    <>
      <circle cx="48" cy="16.5" r="8" fill={u('gold')} opacity=".2" />
      <circle cx="48" cy="16.5" r="4.8" fill={u('gold')} />
      <path d="M11.5 49.5c3-6.5 11.5-10 20.5-10s17.5 3.5 20.5 10Z" fill={u('soil')} />
      <path d="M18 44c3.6-2.4 8.4-3.6 14-3.6" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="1.4" strokeLinecap="round" />
      <g className="fi-a fi-p-sprout">
        <path d="M32 41.5c0-5 0-9.5.4-14" fill="none" stroke={u('body')} strokeWidth="2.6" strokeLinecap="round" />
        <g className="fi-a fi-p-leaf" style={d(250, { '--o': '100% 100%', '--r': '25deg' })}>
          <path d="M31.6 34.5c-1-5.6-6.2-8.8-12.4-8.2.5 6 5.7 9.2 12.4 8.2Z" fill={u('body2')} />
          <path d="M30.5 33.5c-2.6-2.6-5.4-4-8.6-4.8" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth=".9" strokeLinecap="round" />
        </g>
        <g className="fi-a fi-p-leaf" style={d(360, { '--o': '0% 100%' })}>
          <path d="M32.4 28.8c.4-7.2 6.6-11.4 14.4-10.8-.4 7.8-6.6 11.6-14.4 10.8Z" fill={u('body')} />
          <path d="M33.8 27.6c3-3.4 6.6-5.4 10.6-6.6" fill="none" stroke={ink} strokeOpacity=".28" strokeWidth=".9" strokeLinecap="round" />
        </g>
      </g>
    </>
  ),

  student: ({ u }) => (
    <g className="fi-a fi-p-toss">
      <path d="M20.5 29.5V37c0 3.3 5.1 6 11.5 6s11.5-2.7 11.5-6v-7.5L32 35Z" fill={u('body2')} />
      <path d="M20.5 36c2.4 2.6 6.6 4 11.5 4s9.1-1.4 11.5-4V37c0 3.3-5.1 6-11.5 6s-11.5-2.7-11.5-6Z" fill={SHADE} opacity=".2" />
      <path d="M11.5 24.5v1.8L32 35.8l20.5-9.5v-1.8L32 34Z" fill={u('body2')} />
      <path d="M32 15 52.5 24.5 32 34 11.5 24.5Z" fill={u('body')} />
      <path d="M16.5 24.3 32 17.2" stroke="#fff" strokeOpacity=".9" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M32 24.5 46 29.2V38" fill="none" stroke={u('goldLine')} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="24.5" r="1.9" fill={u('gold')} />
      <path d="M44.2 37.4h3.6l.9 5.2h-5.4Z" fill={u('gold')} />
    </g>
  ),

  senior: ({ u }) => (
    <>
      <path className="fi-a fi-p-beat" d="M32 46.5C19.5 39 13.5 32 13.5 24.8c0-5.4 3.9-9.3 9-9.3 4 0 7.3 2.3 9.5 5.6 2.2-3.3 5.5-5.6 9.5-5.6 5.1 0 9 3.9 9 9.3 0 7.2-6 14.2-18.5 21.7Z" fill={u('body')} />
      <path d="M32 46.5c9-5.4 14.6-10.6 17-16" fill="none" stroke={SHADE} strokeOpacity=".1" strokeWidth="3" strokeLinecap="round" />
      <path className="fi-a fi-p-draw" style={d(120)} d="M10.5 31.5h10l2.5-4.6 4 9.6 3.6-12.2 3.5 11.2 2.5-4H53.5" fill="none" stroke={SHADE} strokeOpacity=".3" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />
      <path className="fi-a fi-p-draw" style={d(120)} d="M10.5 31.5h10l2.5-4.6 4 9.6 3.6-12.2 3.5 11.2 2.5-4H53.5" fill="none" stroke={u('goldLine')} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />
    </>
  ),

  women: ({ u }) => (
    <>
      <path className="fi-a fi-p-twinkle" d={star(29, 34, 15.5)} fill={u('gold')} />
      <path d={star(29, 34, 6.5, 0.28)} fill="#fff" opacity=".5" />
      <path className="fi-a fi-p-twinkle" style={d(150)} d={star(46, 17.5, 7.5)} fill={u('body')} />
      <path className="fi-a fi-p-twinkle" style={d(300)} d={star(47.5, 42, 4.2)} fill={u('body2')} />
      <circle className="fi-a fi-p-pop" style={d(420)} cx="17.5" cy="17" r="2" fill={u('body')} />
    </>
  ),

  business: ({ u, ink, cut }) => (
    <>
      <g className="fi-a fi-p-bob">
        <path d="M25.5 22.5v-3.4a2.8 2.8 0 0 1 2.8-2.8h7.4a2.8 2.8 0 0 1 2.8 2.8v3.4" fill="none" stroke={u('body2')} strokeWidth="2.6" />
        <rect x="13.5" y="22" width="37" height="26" rx="5.5" fill={u('body')} />
        <path d="M13.5 32.5h37" stroke={ink} strokeOpacity=".2" strokeWidth="1.4" />
        <rect x="13.5" y="40" width="37" height="8" rx="4" fill={SHADE} opacity=".08" />
        <rect x="28.3" y="29.8" width="7.4" height="6.2" rx="1.8" fill={u('body2')} />
      </g>
      <g className="fi-a fi-p-pop" style={d(250)}>
        <circle cx="48" cy="19" r="7.8" fill={u('gold')} stroke={cut} strokeWidth="2.5" />
        <g className="fi-a fi-p-arrow" style={d(500)}>
          <path d="M45 22 51 16M46.4 16H51v4.6" fill="none" stroke={BRONZE} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </>
  ),

  rewards: ({ u }) => (
    <>
      <rect x="17" y="32" width="30" height="16.5" rx="3" fill={u('body2')} />
      <rect x="17" y="32" width="15" height="16.5" rx="3" fill={u('body')} opacity=".55" />
      <rect x="29.5" y="32" width="5" height="16.5" fill={u('gold')} />
      <rect x="17" y="32" width="30" height="2.6" fill={SHADE} opacity=".2" />
      <g className="fi-a fi-p-lid">
        <rect x="14.5" y="25" width="35" height="8" rx="2.6" fill={u('body')} />
        <rect x="29.5" y="25" width="5" height="8" fill={u('gold')} />
        <path d="M32 25c-2.5-5.5-9.5-7.5-10.5-3.5-.7 2.8 4.5 4 10.5 3.5ZM32 25c2.5-5.5 9.5-7.5 10.5-3.5.7 2.8-4.5 4-10.5 3.5Z" fill={u('gold')} />
        <circle cx="32" cy="24.6" r="1.9" fill={u('goldSide')} />
      </g>
      <path className="fi-a fi-p-pop" style={d(300)} d={star(17.5, 16, 2.8)} fill="#fff" />
      <path className="fi-a fi-p-pop" style={d(380)} d={star(47.5, 14, 3.6)} fill={u('body')} />
    </>
  ),

  payee: ({ u, cut }) => (
    <>
      <g className="fi-a fi-p-bob">
        <path d="M13.5 47.5c0-8.6 6.4-14.5 14.5-14.5s14.5 5.9 14.5 14.5a2 2 0 0 1-2 2h-25a2 2 0 0 1-2-2Z" fill={u('body2')} />
        <path d="M13.5 47.5c0-8.6 6.4-14.5 14.5-14.5-5 2.6-8 8.6-8 16.5h-4.5a2 2 0 0 1-2-2Z" fill="#fff" opacity=".3" />
        <circle cx="28" cy="22.5" r="8" fill={u('body')} />
        <path d="M22.6 20.8c.6-2.6 2.6-4.4 5.2-4.8" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="fi-a fi-p-pop" style={d(260)}>
        <circle cx="45" cy="39.5" r="8" fill={u('gold')} stroke={cut} strokeWidth="2.5" />
        <path d="M45 35.6v7.8M41.1 39.5h7.8" stroke={BRONZE} strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </>
  ),

  statement: ({ u, ink }) => (
    <>
      <g transform="rotate(8 34 30)">
        <rect x="22" y="12" width="25" height="33" rx="3.8" fill={u('body2')} />
      </g>
      <g className="fi-a fi-p-lift">
        <rect x="16.5" y="16.6" width="26" height="34" rx="3.8" fill={SHADE} opacity=".35" />
        <rect x="16.5" y="15" width="26" height="34" rx="3.8" fill={u('body')} />
        {[[21, 8, 2.4, 0.75], [21, 16, 1.9, 0.32], [21, 13, 1.9, 0.32], [21, 16, 1.9, 0.32]].map(([x, w, h, o], i) => (
          <rect key={i} className="fi-a fi-p-write" style={d(200 + i * 110)} x={x} y={20.5 + i * 5.2 + (i ? 1.5 : 0)} width={w} height={h} rx={h / 2} fill={ink} opacity={o} />
        ))}
        <rect className="fi-a fi-p-write" style={d(640)} x="21" y="41.5" width="9" height="3.2" rx="1.6" fill={u('gold')} />
        <path d="M33.5 44.5 36 42l1.8 1.4 2.6-3" fill="none" stroke={ink} strokeOpacity=".7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  ),
};

/** Icons that need a clip path (id `<uid>clip`): its shape per icon. */
const CLIPS: Partial<Record<FeatureIconName, React.ReactNode>> = {
  bills: <rect x="0" y="14" width="64" height="50" />,
  nri: <circle cx="32" cy="32" r="13.5" />,
};

export const FeatureIcon: React.FC<FeatureIconProps> = ({ name, size = 56, variant = 'tile', loop = false, className, title }) => {
  const uid = `fi${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ref = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let timer = 0;
    let visible = false;
    let played = false;
    // Replay-able: remove, reflow, re-add; drop the class after the longest animation so hover can replay.
    const play = () => {
      el.classList.remove('fi-in');
      void el.getBoundingClientRect();
      el.classList.add('fi-in');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove('fi-in'), 1700);
    };
    const io = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible && !played) {
        played = true;
        play();
        if (!loop) io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    const interval = loop ? window.setInterval(() => visible && play(), 4000) : 0;
    return () => { io.disconnect(); window.clearTimeout(timer); window.clearInterval(interval); };
  }, [loop]);

  const tile = variant === 'tile';
  const u = (k: string) => `url(#${uid}${k})`;
  const ctx: Ctx = { u, ink: INK, cut: tile ? u('bg') : 'none', clip: `url(#${uid}clip)` };
  const shadow = SHADOWS[name] === undefined ? [32, 50.5, 15] : SHADOWS[name];
  // Brushed platinum: a second highlight band mid-way reads as machined metal. Bare runs a step darker to hold on light pages.
  const body: [number, string][] = tile
    ? [[0, '#f6f7f9'], [0.38, '#cfd2d8'], [0.55, '#e6e8ec'], [0.8, '#a9adb5'], [1, '#8a8e97']]
    : [[0, '#eceef1'], [0.38, '#b9bdc4'], [0.55, '#d3d6db'], [0.8, '#8d919a'], [1, '#6a6e77']];
  const body2: [number, string][] = tile ? [[0, '#b8bcc4'], [1, '#5d6169']] : [[0, '#a3a7af'], [1, '#4b4e55']];
  const lin = (id: string, stops: [number, string, number?][], x2 = 0.8, y2 = 1) => (
    <linearGradient id={uid + id} x1="0" y1="0" x2={x2} y2={y2}>
      {stops.map(([o, c, a = 1]) => <stop key={o} offset={o} stopColor={c} stopOpacity={a} />)}
    </linearGradient>
  );

  return (
    <svg
      ref={ref}
      className={['fi', `fi--${variant}`, loop && 'fi-loop', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={tile ? '0 0 64 64' : '5 5 54 54'}
      fill="none"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: 'false' })}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${uid}bg`} gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="60" y2="64">
          <stop offset="0" stopColor="#2c2d32" />
          <stop offset=".55" stopColor="#1a1b1f" />
          <stop offset="1" stopColor="#111215" />
        </linearGradient>
        <radialGradient id={`${uid}glow`} cx=".2" cy=".06" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".11" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {lin('gloss', [[0, '#fff', 0.075], [1, '#fff', 0]], 0, 1)}
        {lin('rim', [[0, '#d9dce2', 0.85], [0.18, '#d9dce2', 0.12], [0.7, '#000', 0.1], [1, '#000', 0.55]], 0, 1)}
        {lin('body', body)}
        {lin('body2', body2)}
        {lin('enamel', [[0, '#2e3035'], [1, '#0d0e10']], 0.4, 1)}
        {lin('gold', [[0, '#f3d9a0'], [0.5, '#d4a24c'], [1, '#9c6f25']], 0.35, 1)}
        {lin('goldSide', [[0, '#9c6f25'], [1, '#5e4115']], 0, 1)}
        <linearGradient id={`${uid}goldLine`} gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="54" y2="54">
          <stop offset="0" stopColor="#f3d9a0" />
          <stop offset=".5" stopColor="#d4a24c" />
          <stop offset="1" stopColor="#b3833a" />
        </linearGradient>
        {lin('soil', [[0, '#6b6f78'], [1, '#2a2c31']], 0, 1)}
        {lin('laser', [[0, '#fff', 0], [0.5, '#fff'], [1, '#fff', 0]], 1, 0)}
        {lin('laserGlow', [[0, '#fff', 0], [1, '#fff', 0.35]], 0, 1)}
        <radialGradient id={`${uid}shadow`}>
          <stop offset="0" stopColor="#000" stopOpacity={tile ? 0.6 : 0.25} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {!tile && (
          // Hairline graphite edge so the platinum silhouette survives on light pages (invisible on dark ones).
          <filter id={`${uid}edge`} x="-15%" y="-15%" width="130%" height="130%">
            <feComponentTransfer in="SourceAlpha" result="solid"><feFuncA type="discrete" tableValues="0 1" /></feComponentTransfer>
            <feMorphology in="solid" operator="dilate" radius=".75" result="grow" />
            <feFlood floodColor="#2a2c31" floodOpacity=".85" />
            <feComposite in2="grow" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
        {CLIPS[name] && <clipPath id={`${uid}clip`}>{CLIPS[name]}</clipPath>}
      </defs>
      {tile && (
        <>
          <rect width="64" height="64" rx="18" fill={u('bg')} />
          <rect width="64" height="64" rx="18" fill={u('glow')} />
          <path d="M0 18A18 18 0 0 1 18 0h28a18 18 0 0 1 18 18v2.5c-9 5-20.5 7.5-32 7.5S9 25.5 0 20.5Z" fill={u('gloss')} />
          <rect x=".5" y=".5" width="63" height="63" rx="17.5" stroke={u('rim')} />
          <rect x="1.9" y="1.9" width="60.2" height="60.2" rx="16.2" stroke="#000" strokeOpacity=".35" strokeWidth=".8" />
        </>
      )}
      {shadow && <ellipse cx={shadow[0]} cy={shadow[1]} rx={shadow[2]} ry={shadow[2] * 0.2} fill={u('shadow')} />}
      <g filter={tile ? undefined : u('edge')}>
        <g className="fi-art">{ART[name](ctx)}</g>
      </g>
    </svg>
  );
};
