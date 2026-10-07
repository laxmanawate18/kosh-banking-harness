import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { Stagger } from '../common/Animate';
import { formatDate } from '../common/Formatters';
import { serviceLabel } from '../app/serviceCatalogue';
import { useI18n } from '../../i18n';

interface RequestsPageProps {
  onNavigate?: (route: string) => void;
}

/** Statuses where the bank (or the customer) still has something to do. */
export const ACTIVE_STATUSES = ['NEW', 'DUE', 'PENDING', 'PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED', 'IN_REVIEW', 'SUBMITTED', 'SUBMITTED_FOR_REVIEW', 'IN_PROGRESS'];

/** One request as a row: plain service name, date and reference, status, details. Used by My requests and Deposits. */
export const RequestCard: React.FC<{ request: any; onOpen: (r: any) => void }> = ({ request: r, onOpen }) => {
  const { t } = useI18n();
  return (
    <Stagger.Item as="article" className="request-card">
      <div>
        <h3>{serviceLabel(t, r.service_id, r.service_name || r.request_type)}</h3>
        <p>{t('Submitted {date}', { date: formatDate(r.created_at) })} · {t('Ref.')} {r.id}</p>
      </div>
      <div className="request-actions">
        <Badge status={r.status || 'PENDING_APPROVAL'} />
        <button type="button" className="k-btn outline sm" onClick={() => onOpen(r)}>{t('View details')}</button>
      </div>
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
