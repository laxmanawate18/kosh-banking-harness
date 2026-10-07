import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { Stagger, motion } from '../common/Animate';
import { formatDate, humanizeCode } from '../common/Formatters';
import { useReducedMotion } from 'framer-motion';
import { serviceLabel } from '../app/serviceCatalogue';
import { useI18n } from '../../i18n';

interface RequestsPageProps {
  onNavigate?: (route: string) => void;
}

/** Statuses where the bank (or the customer) still has something to do. */
export const ACTIVE_STATUSES = ['NEW', 'DUE', 'PENDING', 'PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED', 'IN_REVIEW', 'SUBMITTED', 'SUBMITTED_FOR_REVIEW', 'IN_PROGRESS', 'QUEUED_FOR_CBS', 'RPA_EXECUTING', 'RPA_FAILED'];

/** Approved account openings are then keyed into the core banking system by a robot. */
const SETUP = ['QUEUED_FOR_CBS', 'RPA_EXECUTING', 'RPA_FAILED'];
const FINAL: Record<string, string> = { APPROVED: 'Approved', COMPLETED: 'Completed', REJECTED: 'Not approved', CANCELLED: 'Cancelled' };
type Step = { label: string; state: 'done' | 'current' | 'todo'; at?: string; tone?: 'warn' | 'danger' | 'muted' };

/**
 * A request's progress from what the bank returns: status, mode, created_at and updated_at. There is no per-step history,
 * so only the submission, the latest change and the close carry dates; steps in between are shown without one.
 */
function stepsFor(r: any): Step[] {
  const s: string = r.status || 'PENDING_APPROVAL';
  const active = ACTIVE_STATUSES.includes(s);
  const changed = r.updated_at && r.updated_at !== r.created_at ? r.updated_at : undefined;
  const steps: Step[] = [{ label: 'Submitted', state: 'done', at: r.created_at }];
  if (s !== 'CANCELLED') {
    const reviewing = active && !SETUP.includes(s);
    steps.push({
      label: s === 'MORE_INFO_REQUIRED' ? 'The bank needs more information' : s === 'ESCALATED' ? 'With a senior officer' : r.mode === 'HUMAN_APPROVAL' ? 'Bank review' : 'Processing',
      state: reviewing ? 'current' : 'done', at: reviewing ? changed : undefined, tone: s === 'MORE_INFO_REQUIRED' ? 'warn' : undefined,
    });
    if ((r.service_id === 'P1-25' || SETUP.includes(s)) && s !== 'REJECTED') {
      const now = SETUP.includes(s);
      steps.push({ label: 'Account set-up', state: now ? 'current' : active ? 'todo' : 'done', at: now ? changed : undefined, tone: s === 'RPA_FAILED' ? 'warn' : undefined });
    }
  }
  steps.push(active
    ? { label: SETUP.includes(s) ? 'Completed' : 'Decision', state: 'todo' }
    : { label: FINAL[s] || humanizeCode(s), state: 'done', at: r.updated_at, tone: s === 'REJECTED' ? 'danger' : s === 'CANCELLED' ? 'muted' : undefined });
  return steps;
}

/** Vertical tracker: done steps draw a check, the current one pulses gently, the rest wait. */
const Track: React.FC<{ request: any }> = ({ request }) => {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const state = { done: t('Done'), current: t('In progress'), todo: t('Not yet') };
  return (
    <ol className="c-track" aria-label={t('Progress')}>
      {stepsFor(request).map((step, i) => (
        <li key={step.label} className={`c-track-step ${step.state} ${step.tone || ''}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="c-track-node" aria-hidden="true">
            {step.state === 'done' && (
              <svg viewBox="0 0 16 16"><motion.path d={step.tone === 'danger' ? 'M5 5l6 6M11 5l-6 6' : 'M4 8.5l2.6 2.6L12 5.5'} initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.15 + i * 0.12 }} /></svg>
            )}
          </span>
          <span className="c-track-text">
            <strong>{t(step.label)}</strong><span className="sr-only">, {state[step.state]}</span>
            {step.at && <time dateTime={step.at}>{step.state === 'current' ? t('Updated {date}', { date: formatDate(step.at) }) : formatDate(step.at)}</time>}
          </span>
        </li>
      ))}
    </ol>
  );
};

/** One request as a row: plain service name, date and reference, status, details. Used by My requests and Deposits. */
export const RequestCard: React.FC<{ request: any; onOpen: (r: any) => void }> = ({ request: r, onOpen }) => {
  const { t } = useI18n();
  return (
    <Stagger.Item as="article" className="request-card c-request">
      <div className="c-request-top">
        <div>
          <h3>{serviceLabel(t, r.service_id, r.service_name || r.request_type)}</h3>
          <p>{t('Ref.')} {r.id}</p>
        </div>
        <div className="request-actions">
          <Badge status={r.status || 'PENDING_APPROVAL'} />
          <button type="button" className="k-btn outline sm" onClick={() => onOpen(r)}>{t('View details')}</button>
        </div>
      </div>
      <Track request={r} />
    </Stagger.Item>
  );
};

export const RequestDetailModal: React.FC<{ request: any; onClose: () => void }> = ({ request: r, onClose }) => {
  const { t } = useI18n();
  const active = ACTIVE_STATUSES.includes(r.status);
  return (
    <Modal isOpen onClose={onClose} title={serviceLabel(t, r.service_id, r.service_name || r.request_type)} subtitle={t('Reference {id}', { id: r.id })}>
      <div className="info-row"><span>{t('Status')}</span><Badge status={r.status || 'PENDING_APPROVAL'} /></div>
      <div className="info-row"><span>{t('Submitted on')}</span><strong>{formatDate(r.created_at)}</strong></div>
      {r.updated_at && r.updated_at !== r.created_at && <div className="info-row"><span>{t('Last update')}</span><strong>{formatDate(r.updated_at)}</strong></div>}
      {(r.resolution_reason || r.decision_notes) && <div className="info-row"><span>{t('Note from the bank')}</span><strong>{r.resolution_reason || r.decision_notes}</strong></div>}
      <div className="k-note c-mt">
        <Icon name={active ? 'clock' : 'check'} />
        <span>{active ? t('The bank is working on this. We will notify you when it is decided.') : t('This request is closed. Nothing more is needed from you.')}</span>
      </div>
      <div className="k-dialog-actions">
        <button type="button" className="k-btn primary wide" onClick={onClose}>{t('Done')}</button>
      </div>
    </Modal>
  );
};

export const RequestsPage: React.FC<RequestsPageProps> = ({ onNavigate }) => {
  const { overview, serviceRequests } = useBanking();
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<any | null>(null);

  const all: any[] = [...(overview?.requests || serviceRequests || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const open = all.filter(r => ACTIVE_STATUSES.includes(r.status));
  const closed = all.filter(r => !ACTIVE_STATUSES.includes(r.status));
  const shown = filter === 'open' ? open : filter === 'closed' ? closed : all;

  return (
    <>
      <PageHeader title={t('My requests')} subtitle={t('Stay up to date, from submission to a decision.')}
        actions={<button type="button" className="k-btn primary" onClick={() => onNavigate?.('services')}><Icon name="services" />{t('New request')}</button>} />
      <div className="k-page-stack">
        <FilterTabs label={t('Filter requests')} name="requests" value={filter} onChange={setFilter} tabs={[
          { id: 'all', label: t('All'), count: all.length },
          { id: 'open', label: t('In progress'), count: open.length },
          { id: 'closed', label: t('Done'), count: closed.length },
        ]} />

        {shown.length ? (
          <Stagger key={filter} className="request-list">
            {shown.map(r => <RequestCard key={r.id} request={r} onOpen={setSelected} />)}
          </Stagger>
        ) : (
          <div className="k-card empty">
            <Icon name="requests" />
            <h3>{filter === 'open' ? t('Nothing in progress') : t('Nothing to track just yet')}</h3>
            <p>{t('New requests and their progress will appear here.')}</p>
            <button type="button" className="k-btn outline" onClick={() => onNavigate?.('services')}>{t('Explore services')}</button>
          </div>
        )}
      </div>

      {selected && <RequestDetailModal request={selected} onClose={() => setSelected(null)} />}
    </>
  );
};
