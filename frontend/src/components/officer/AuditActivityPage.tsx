import React, { useState } from 'react';
import { formatDateTime, formatTime, humanizeCode } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { AnimatePresence, motion } from '../common/Animate';
import { Empty, Paged, Panel, Tag, rowMotion } from './StaffKit';

interface AuditActivityPageProps {
  onExportAudit?: () => void;
}

const EVENT: Record<string, string> = {
  RECONCILIATION_RUN: 'Reconciliation with core banking', AGENT_TOOL_COMPLETED: 'Mitra used a tool', AGENT_TOOL_ALLOWED: 'Mitra was allowed a tool',
  AGENT_TOOL_DENIED: 'Mitra was refused a tool', LLM_BOUNDARY_WITHHELD: 'Private data kept from the model', INTENT_BOUND: 'Customer intent recognised',
  SENTINEL_DECISION: 'Sentinel payment check', CARD_FROZEN: 'Card frozen', PAYMENT_PROPOSED: 'Payment proposed', CONSENT_CAPTURED: 'Consent recorded',
  COPILOT_TURN: 'Officer copilot answered', PROMPT_VERSION_APPROVED: 'Prompt version approved',
};
const SEVERITY: Record<string, ['danger' | 'warning' | 'neutral', string]> = {
  CRITICAL: ['danger', 'Critical'], ERROR: ['danger', 'Error'], WARNING: ['warning', 'Warning'], INFO: ['neutral', 'Info'] };
const ATTENTION = ['CRITICAL', 'ERROR', 'WARNING'];
/** Codes inside sentences become words: "get_customer_summary" -> "Get customer summary", "READ_ACCOUNTS" -> "Read accounts". */
const readable = (s: string) => s.replace(/\b[a-z0-9]+(?:_[a-z0-9]+)+\b|\b[A-Z]{4,}(?:_[A-Z0-9]+)*\b|\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g, m => `“${humanizeCode(m)}”`);
const nameOf = (e: any) => EVENT[e.event_type] || humanizeCode(e.event_type || e.action) || 'Event';
const day = (iso?: string) => (iso || '').slice(0, 10);

type Group = { key: string; first: any; count: number; earliest?: string };

export const AuditActivityPage: React.FC<AuditActivityPageProps> = ({ onExportAudit }) => {
  const { events } = useBanking();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const all = events || [];
  const q = query.trim().toLowerCase();
  const shown = all.filter((e: any) => (filter === 'all' || (filter === 'attention' ? ATTENTION.includes(e.severity) : !ATTENTION.includes(e.severity)))
    && (!q || `${nameOf(e)} ${e.summary || ''} ${e.event_type || ''} ${e.actor || ''}`.toLowerCase().includes(q)));

  // The same event on the same day collapses into one row ("Reconciliation · 33 times"); newest first, as the events arrive.
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  for (const e of shown as any[]) {
    const key = [day(e.created_at), e.event_type, e.summary, e.severity].join('|');
    const g = index.get(key);
    if (g) { g.count += 1; g.earliest = e.created_at; } else { const n = { key, first: e, count: 1 }; index.set(key, n); groups.push(n); }
  }

  const exportCsv = () => {
    if (onExportAudit) return onExportAudit();
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['Time', 'Event', 'Severity', 'Actor', 'Summary', 'Record'].join(','),
      ...shown.map((e: any) => [e.created_at, nameOf(e), e.severity, e.actor, e.summary, e.id].map(cell).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `kosh-security-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const attention = all.filter((e: any) => ATTENTION.includes(e.severity)).length;
  return (
    <div className="k-page-stack st-page">
      <PageHeader title="Security activity"
        subtitle="Sign-ins, Sentinel payment checks, Mitra's tool use and case activity, newest first. Repeats on the same day are grouped."
        actions={<button type="button" className="k-btn outline sm" onClick={exportCsv} disabled={!shown.length}><Icon name="download" />Export CSV</button>} />
      <Panel title="Recent events" count={groups.length}
        sub={`${all.length} events, grouped into ${groups.length} lines${attention ? ` · ${attention} need a look (warning or critical)` : ''}`}
        actions={<FilterTabs name="audit" label="Filter by severity" value={filter} onChange={setFilter} tabs={[
          { id: 'all', label: 'All', count: all.length }, { id: 'attention', label: 'Warnings and critical', count: attention },
          { id: 'info', label: 'Information', count: all.length - attention }]} />}>
        <div className="st-toolbar">
          <label className="st-search"><Icon name="search" /><span className="sr-only">Search events</span>
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events, e.g. Sentinel, card, consent" /></label>
        </div>
        {groups.length ? <Paged rows={groups} reset={`${filter}|${q}`}>{shown => (
          <div className="table-scroll"><table className="table st-cards">
            <thead><tr><th>When</th><th>Event</th><th>Severity</th><th className="num">Times</th></tr></thead>
            <tbody><AnimatePresence initial={false}>{shown.map((g, i) => {
              const e = g.first; const sev = SEVERITY[e.severity] || ['neutral', humanizeCode(e.severity) || 'Info'];
              return (
                <motion.tr key={g.key} className={`st-row-${sev[0]}`} {...rowMotion(i % 20)}>
                  <td data-label="When" className="st-nowrap">{formatDateTime(e.created_at)}
                    {g.count > 1 && g.earliest && formatTime(g.earliest) !== formatTime(e.created_at) && <span className="st-sub">first at {formatTime(g.earliest)}</span>}</td>
                  <td className="st-main"><strong>{nameOf(e)}</strong>
                    {(e.summary || e.resource) && String(e.summary || e.resource).toLowerCase() !== nameOf(e).toLowerCase() && <span className="st-sub">{readable(e.summary || e.resource)}</span>}
                    {e.details?.reason_codes?.length ? <span className="st-sub">Reasons: {e.details.reason_codes.map((r: string) => humanizeCode(r)).join(', ')}</span> : null}</td>
                  <td className="st-status"><Tag tone={sev[0]}>{sev[0] !== 'neutral' && <Icon name="alert" />}{sev[1]}</Tag></td>
                  <td data-label="Times" className="num">{g.count > 1 ? <strong>{g.count}×</strong> : 1}</td>
                </motion.tr>);
            })}</AnimatePresence></tbody>
          </table></div>)}</Paged>
        : <Empty icon="security" title={all.length ? 'No event matches' : 'No activity to show'}>
          {all.length ? 'Try another word or filter.' : 'Security decisions will be recorded here.'}</Empty>}
      </Panel>
    </div>
  );
};
