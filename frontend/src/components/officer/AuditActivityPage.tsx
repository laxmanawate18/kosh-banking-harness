import React from 'react';
import { formatDate } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { useI18n } from '../../i18n';

interface AuditActivityPageProps {
  onExportAudit?: () => void;
}

export const AuditActivityPage: React.FC<AuditActivityPageProps> = ({ onExportAudit }) => {
  const { events } = useBanking();
  const { t } = useI18n();

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('The record behind every action.')}</h1>
          <p>{t('Authentication, policy decisions and case activity.')}</p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button"
            onClick={() => onExportAudit?.()}
          >
            {t('Export audit')}
          </button>
        </div>
      </header>

      <section className="panel">
        {events && events.length > 0 ? (
          events.slice(0, 60).map((e, idx) => (
            <article key={e.id || idx} className="audit-item">
              <span
                className={`event-dot ${
                  ['CRITICAL', 'ERROR'].includes(e.severity || '')
                    ? 'danger'
                    : e.severity === 'WARNING'
                    ? 'warning'
                    : ''
                }`}
              />
              <div>
                <h3>{(e.event_type || e.action || '').replaceAll('_', ' ').toLowerCase()}</h3>
                <p>{e.summary || e.resource || ''}</p>
                {e.details?.reason_codes?.length ? (
                  <details>
                    <summary>{t('Policy reasons')}</summary>
                    {e.details.reason_codes.map((r: string, rIdx: number) => (
                      <p key={rIdx}>{r.replaceAll('_', ' ').toLowerCase()}</p>
                    ))}
                  </details>
                ) : null}
              </div>
              <time>
                {formatDate(e.created_at)}
                <br />
                {formatTime(e.created_at)}
              </time>
            </article>
          ))
        ) : (
          <div className="empty-panel">
            <div className="empty-icon">
              <Icon name="security" />
            </div>
            <h3>{t('No activity to show')}</h3>
            <p>{t('Security decisions will be recorded here.')}</p>
          </div>
        )}
      </section>
    </>
  );
};
