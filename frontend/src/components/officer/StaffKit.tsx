import React, { useRef, useState, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { ActiveIndicator, AnimatedNumber, DUR, EASE, motion } from '../common/Animate';
import { humanizeCode } from '../common/Formatters';

/** Building blocks shared by the officer console and the Admin Panel (styles in staff.css). */

type Tone = 'warn' | 'danger' | 'ok';

/** One KPI: label, a counting figure, one caption. Tone (with an icon) only when the figure is not zero. As a button it filters the page. */
export const Kpi: React.FC<{
  label: string; value: number | null | undefined; format?: (v: number) => string; caption?: ReactNode;
  tone?: Tone; onClick?: () => void; pressed?: boolean; group?: string;
}> = ({ label, value, format, caption, tone, onClick, pressed, group = 'kpi' }) => {
  const toned = tone && value ? tone : undefined;
  const body = (
    <>
      {pressed && <ActiveIndicator id={`st-kpi-${group}`} className="st-kpi-pressed" />}
      <span className="st-kpi-label">{label}</span>
      <strong className="st-kpi-value">{value == null ? '—' : <AnimatedNumber value={value} format={format} />}</strong>
      {caption && <span className="st-kpi-caption">{toned && <Icon name={toned === 'ok' ? 'check' : 'alert'} />}{caption}</span>}
    </>
  );
  const cls = `st-kpi ${toned || ''} ${onClick ? 'clickable' : ''}`;
  return onClick
    ? <button type="button" className={cls} aria-pressed={!!pressed} onClick={onClick}>{body}</button>
    : <div className={cls}>{body}</div>;
};

/** The one line that says what needs a decision now (or that nothing does). */
export const Attention: React.FC<{ tone?: Tone; title: ReactNode; children?: ReactNode; actions?: ReactNode }> = (
  { tone = 'warn', title, children, actions }) => (
  <div className={`st-attention ${tone}`} role="status">
    <Icon name={tone === 'ok' ? 'check' : 'alert'} />
    <div className="st-attention-text"><strong>{title}</strong>{children && <span>{children}</span>}</div>
    {actions && <div className="st-attention-actions">{actions}</div>}
  </div>
);

/** A .panel with its title row; children go below (a .panel-body, a .table-scroll or an .empty). */
export const Panel: React.FC<{ title: ReactNode; count?: number; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; label?: string }> = (
  { title, count, sub, actions, children, className = '', label }) => (
  <section className={`panel st-panel ${className}`} aria-label={label}>
    <div className="panel-head">
      <div className="st-panel-title">
        <h2>{title}{typeof count === 'number' && <span className="k-count"><AnimatedNumber value={count} /></span>}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="st-panel-actions">{actions}</div>}
    </div>
    {children}
  </section>
);

export const Empty: React.FC<{ icon?: string; title: string; children?: ReactNode }> = ({ icon = 'check', title, children }) => (
  <div className="empty"><Icon name={icon} /><h3>{title}</h3>{children && <p>{children}</p>}</div>
);

/** Table rows (or cards) rise in on first load, 35ms apart, capped so long lists never wait; removed rows fade out. */
export const rowMotion = (i: number) => ({
  layout: 'position' as const,
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE, delay: Math.min(i, 10) * 0.035 } },
  exit: { opacity: 0, x: -12, transition: { duration: DUR.fast } },
});

/**
 * A proportional bar behind a figure (share of the largest row). Decorative: the figure carries the meaning.
 * Grows from zero the first time it scrolls into view and glides to a new value when the data changes (transform only).
 */
export const Bar: React.FC<{ value: number; max: number; children: ReactNode }> = ({ value, max, children }) => {
  const track = useRef<HTMLSpanElement>(null);
  const seen = useInView(track, { once: true });  // the track, not the bar: a bar at scale 0 has no area to be seen
  const reduce = useReducedMotion();
  const share = max && value ? Math.max(0.02, value / max) : 0;
  return (
    <span className="st-bar-cell">
      <span className="st-bar" aria-hidden="true" ref={track}>
        <motion.i initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: seen || reduce ? share : 0 }} transition={{ duration: 0.7, ease: EASE }} /></span>
      <span>{children}</span>
    </span>
  );
};

/** Long lists show 20 rows, then "Show 20 more" (the new rows rise in). A new `reset` value (the filter) starts from the top. */
export function Paged<T>({ rows, reset, children }: { rows: T[]; reset?: unknown; children: (shown: T[]) => ReactNode }) {
  const [limit, setLimit] = useState(20);
  const [was, setWas] = useState(reset);
  if (was !== reset) { setWas(reset); setLimit(20); }
  const rest = rows.length - limit;
  return (
    <>
      {children(rows.slice(0, limit))}
      {rest > 0 && <div className="st-more">
        <span aria-live="polite">Showing {limit} of {rows.length}</span>
        <button type="button" className="k-btn outline sm" onClick={() => setLimit(l => l + 20)}>Show {Math.min(20, rest)} more</button>
      </div>}
    </>
  );
}

/** A badge with our own words: Badge re-cases plain strings ("In Kosh" -> "In kosh"), a fragment is shown as written. */
export const Tag: React.FC<{ tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'; children: ReactNode }> = ({ tone, children }) =>
  <Badge variant={tone}><>{children}</></Badge>;

/** Words for the codes staff see most. */
export const CHANNEL: Record<string, string> = {
  CUSTOMER: 'Customer chat', VISITOR: 'Website visitors', MCP: 'Outside AI agents', OFFICER: 'Officer copilot',
  MITRA: 'Mitra chat', DASHBOARD: 'Dashboard',
};
export const channelName = (c?: string | null) => (c ? CHANNEL[c.toUpperCase()] || humanizeCode(c) : '—');
export const processName = (id?: string | null) => (!id || id === 'none' ? 'No process matched' : humanizeCode(id.replace(/^proc\./, '')));
/** "AntigravityExecutionError" -> "Antigravity execution error"; codes -> words. */
export const words = (s: string) => humanizeCode(/[a-z][A-Z]/.test(s) ? s.replace(/([a-z])([A-Z])/g, '$1 $2') : s);
export const domainName = (d: string) => humanizeCode(d).replace(/\bai\b/g, 'AI');
export const seconds = (ms?: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}\u00a0s`);
export const count = (n?: number | null) => (n == null ? '—' : n.toLocaleString('en-IN'));
export const errorText = (e: any, fallback = 'The action failed') => (typeof e?.message === 'string' && e.message) || fallback;
