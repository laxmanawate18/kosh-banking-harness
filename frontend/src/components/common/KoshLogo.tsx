import React, { useId } from 'react';
import { useI18n } from '../../i18n';

const PETALS = [
  { r: 0, s: 1 },
  { r: -36, s: 0.9 },
  { r: 36, s: 0.9 },
  { r: -72, s: 0.72 },
  { r: 72, s: 0.72 },
];

/** Black-and-platinum lotus seal: graphite disc, platinum rim, one hairline gold thread. */
export const LotusMark: React.FC<{ size?: number; className?: string }> = ({ size = 40, className }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id={`d${id}`} cx=".36" cy=".28" r=".8">
          <stop offset="0" stopColor="#2b2c31" />
          <stop offset="1" stopColor="#0c0d0f" />
        </radialGradient>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2=".4" y2="1">
          <stop offset="0" stopColor="#f6f7f9" />
          <stop offset=".5" stopColor="#8a8e97" />
          <stop offset="1" stopColor="#d9dce2" />
        </linearGradient>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2=".3" y2="1">
          <stop offset="0" stopColor="#f6f7f9" />
          <stop offset=".55" stopColor="#c9cdd4" />
          <stop offset="1" stopColor="#7d818a" />
        </linearGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2=".3" y2="1">
          <stop offset="0" stopColor="#f3d9a0" />
          <stop offset=".5" stopColor="#d4a24c" />
          <stop offset="1" stopColor="#9c6f25" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23.2" fill={`url(#d${id})`} stroke={`url(#r${id})`} strokeWidth="1.1" />
      <circle cx="24" cy="24" r="20.4" fill="none" stroke={`url(#g${id})`} strokeWidth=".7" />
      {PETALS.map(({ r, s }) => (
        <path
          key={r}
          d="M24 11C30.5 18 30.5 28 24 35C17.5 28 17.5 18 24 11Z"
          fill={`url(#p${id})`}
          stroke="#0c0d0f"
          strokeWidth=".9"
          transform={`rotate(${r} 24 35) translate(24 35) scale(${s}) translate(-24 -35)`}
        />
      ))}
      <path d="M13 37.5Q24 42.5 35 37.5" fill="none" stroke={`url(#p${id})`} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
};

/** Line-art rangoli used as the brand's decorative motif (stroke/fill come from CSS). */
export const Rangoli: React.FC<{ className?: string; rings?: number }> = ({ className, rings = 16 }) => (
  <svg className={className} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
    {Array.from({ length: rings }, (_, i) => (
      <ellipse key={i} cx="200" cy="200" rx="190" ry="62" transform={`rotate(${(i * 180) / rings} 200 200)`} />
    ))}
    <circle cx="200" cy="200" r="46" />
  </svg>
);

interface KoshLogoProps {
  size?: number;
  tone?: 'light' | 'dark';
  tagline?: boolean;
}

export const KoshLogo: React.FC<KoshLogoProps> = ({ size = 40, tone = 'dark', tagline = false }) => {
  const { t } = useI18n();
  return (
    <span className={`k-logo ${tone}`}>
      <LotusMark size={size} />
      <span className="k-logo-text">
        <span className="k-logo-word">
          kosh<span className="k-logo-dev" lang="hi">कोष</span>
        </span>
        {tagline && <small>{t('Bharosa, har kadam.')}</small>}
      </span>
    </span>
  );
};
