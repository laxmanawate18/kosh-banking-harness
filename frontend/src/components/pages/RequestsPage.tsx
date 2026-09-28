import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { useI18n } from '../../i18n';

interface RequestsPageProps {
  onNavigate?: (route: string) => void;
  onViewRequest?: (requestId: string) => void;
}

const activeStatuses = [
  'NEW',
  'DUE',
  'PENDING',
  'PENDING_APPROVAL',
  'MORE_INFO_REQUIRED',
  'ESCALATED',
  'IN_REVIEW',
  'SUBMITTED',
];

export const RequestsPage: React.FC<RequestsPageProps> = ({
  onNavigate,
  onViewRequest,
}) => {
  const { overview, serviceRequests } = useBanking();
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  const allRequests = overview?.requests || serviceRequests || [];

  let filtered = allRequests;
  if (filter === 'open') {
    filtered = filtered.filter((r) => activeStatuses.includes(r.status));
  } else if (filter === 'closed') {
    filtered = filtered.filter((r) => !activeStatuses.includes(r.status));
  }

  const getBadgeVariant = (status: string) => {
    const danger = ['DENY', 'DENIED', 'REJECTED', 'BLOCKED_MULE', 'LOCKED'].includes(status);
    const warning = ['PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED', 'CHALLENGE', 'CHALLENGE_REQUIRED', 'FROZEN', 'NEW', 'DUE', 'IN_REVIEW', 'PENDING'].includes(status);
    if (danger) return 'danger';
    if (warning) return 'warning';
    if (['CANCELLED', 'SUBMITTED'].includes(status)) return 'neutral';
    return 'success';
  };

  const handleOpenDetail = (r: any) => {
    if (onViewRequest) {
      onViewRequest(r.id);
    } else {
      setSelectedReq(r);
    }
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('Your requests')}</h1>
          <p>{t('Stay up to date, from submission to a decision.')}</p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => onNavigate?.('services')}
          >
            {t('New request')}
          </button>
        </div>
      </header>

      <div className="filters">
        {[
          ['all', t('All requests')],
          ['open', t('In progress')],
          ['closed', t('Decided & cancelled')],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`filter ${filter === id ? 'active' : ''}`}
            onClick={() => setFilter(id as any)}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length ? (
        <div className="request-list">
          {filtered.map((r) => (
            <article key={r.id} className="request-card">
              <div>
                <h3>{r.service_name || r.request_type || t('Service request')}</h3>
                <p>
                  {r.id} ·{' '}
                  {new Date(r.created_at || Date.now()).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="request-actions">
                <Badge variant={getBadgeVariant(r.status)}>{r.status}</Badge>
                <button
                  type="button"
                  className="button"
                  onClick={() => handleOpenDetail(r)}
                >
                  {t('View details')}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="requests" />
          <h3>{t('Nothing to track just yet')}</h3>
          <p>{t('New requests and their progress will appear here.')}</p>
          <button
            type="button"
            className="button"
            onClick={() => onNavigate?.('services')}
          >
            {t('Explore services')}
          </button>
        </div>
      )}

      {selectedReq && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedReq(null)}
          title={t('Service request details')}
          subtitle={t('Reference {id}', { id: selectedReq.id })}
        >
          <div className="info-row">
            <span>{t('Service')}</span>
            <strong>{selectedReq.service_name || selectedReq.request_type || t('Banking service request')}</strong>
          </div>
          <div className="info-row">
            <span>{t('Status')}</span>
            <Badge variant={getBadgeVariant(selectedReq.status)}>{selectedReq.status}</Badge>
          </div>
          <div className="info-row">
            <span>{t('Submitted on')}</span>
            <strong>{new Date(selectedReq.created_at || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          </div>
          {selectedReq.channel && (
            <div className="info-row">
              <span>{t('Channel')}</span>
              <strong>{selectedReq.channel}</strong>
            </div>
          )}
          {selectedReq.decision_notes && (
            <div className="info-row">
              <span>{t('Decision notes')}</span>
              <strong>{selectedReq.decision_notes}</strong>
            </div>
          )}
          <div className="dialog-footer" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="button primary wide"
              onClick={() => setSelectedReq(null)}
            >
              {t('Done')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};
