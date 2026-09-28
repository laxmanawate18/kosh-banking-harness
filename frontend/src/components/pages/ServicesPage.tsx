import React, { useState, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { apiGet } from '../../services/api';
import { useChat } from '../../context/ChatContext';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';

interface ServiceItem {
  id: string;
  name: string;
  auth_level?: string;
  mode?: string;
  phase?: string;
}

type T = (key: string) => string;

const serviceCopy = (t: T): Record<string, string> => ({
  'P1-04': t('Order a cheque book for your selected account.'),
  'P1-05': t('Submit a stop-payment request for a cheque.'),
  'P1-08': t('Request a replacement for a lost or damaged card.'),
  'P1-11': t('Keep your contact information current.'),
  'P1-12': t('Update your registered residential address.'),
  'P1-14': t('Add or change your account nominee.'),
  'P1-19': t('Apply to open a fixed deposit.'),
  'P1-20': t('Apply for a recurring monthly deposit.'),
  'P1-23': t('Choose a branch, date and preferred time.'),
  'P2-14': t('Raise a concern for review by your banking team.'),
});

const defaultServices: ServiceItem[] = [
  { id: 'P1-01', name: 'Balance enquiry', auth_level: 'L1', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-02', name: 'Mini statement', auth_level: 'L1', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-03', name: 'Account statement request', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-04', name: 'Cheque book request', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-05', name: 'Stop cheque', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-06', name: 'Cheque status enquiry', auth_level: 'L1', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-07', name: 'Debit card block', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-08', name: 'Debit card reissue', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-09', name: 'Debit card PIN regeneration', auth_level: 'L3', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-10', name: 'Card transaction controls', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-11', name: 'Contact detail update', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-12', name: 'Address update', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-13', name: 'Nominee enquiry', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-14', name: 'Nominee update', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-15', name: 'PAN update', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-16', name: 'KYC status enquiry', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-17', name: 'KYC document submission', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-18', name: 'Fixed deposit enquiry', auth_level: 'L1', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-19', name: 'Fixed deposit opening', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-20', name: 'Recurring deposit opening', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P1' },
  { id: 'P1-21', name: 'TDS certificate request', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-22', name: 'Interest certificate request', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-23', name: 'Branch appointment', auth_level: 'L1', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P1-24', name: 'Service request status', auth_level: 'L1', mode: 'AUTONOMOUS', phase: 'P1' },
  { id: 'P2-01', name: 'Account closure', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-02', name: 'Joint holder addition', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-03', name: 'Joint holder removal', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-04', name: 'Mode of operation change', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-05', name: 'Signature update', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-06', name: 'Inoperative account activation', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-07', name: 'Minor-to-major conversion', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-08', name: 'Deceased claim initiation', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-09', name: 'Lien removal request', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-10', name: 'Standing instruction setup', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-11', name: 'Standing instruction cancellation', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-12', name: 'Safe deposit locker enquiry', auth_level: 'L2', mode: 'AUTONOMOUS', phase: 'P2' },
  { id: 'P2-13', name: 'Safe deposit locker request', auth_level: 'L3', mode: 'HUMAN_APPROVAL', phase: 'P2' },
  { id: 'P2-14', name: 'Complex grievance escalation', auth_level: 'L2', mode: 'HUMAN_APPROVAL', phase: 'P2' },
];

const aiWorkflows = (t: T) => [
  {
    id: 'account_opening',
    name: t('Open a new savings account'),
    description: t('Open a savings account with automated CBS entry after officer verification.'),
    level: 'L3',
    note: t('Identity check before submission'),
    prompt: 'I want to open a new savings account with automated CBS entry.',
  },
  {
    id: 'kyc',
    name: t('Periodic KYC verification'),
    description: t('Submit Aadhaar, passport or PAN card for automated compliance verification.'),
    level: 'L3',
    note: t('Identity check before submission'),
    prompt: 'I would like to complete my pending KYC verification.',
  },
  {
    id: 'address_update',
    name: t('Address change'),
    description: t('Provide a utility bill or rental agreement to update your residential address.'),
    level: 'L3',
    note: t('Identity check before submission'),
    prompt: 'I want to update my registered residential address.',
  },
  {
    id: 'deposit',
    name: t('Fixed deposit booking'),
    description: t('Guided deposit application with custom tenure and interest payouts.'),
    level: 'L3',
    note: t('Review before submission'),
    prompt: 'I want to apply to open a new Fixed Deposit.',
  },
  {
    id: 'cheque_book',
    name: t('Cheque book dispatch'),
    description: t('Order a 25 or 50 leaf CTS-compliant cheque book for home delivery.'),
    level: 'L2',
    note: t('Review before submission'),
    prompt: 'I would like to request a new cheque book.',
  },
  {
    id: 'statement',
    name: t('Account statement download'),
    description: t('Select an account and dates for an immediate statement download.'),
    level: 'L2',
    note: t('Immediate CSV download'),
    prompt: 'Please generate my recent account statement.',
  },
];


interface ServicesPageProps {
  onOpenService?: (serviceId: string) => void;
  onStartWorkflow?: (workflowId: string) => void;
}

export const ServicesPage: React.FC<ServicesPageProps> = ({
  onOpenService,
  onStartWorkflow,
}) => {
  const [filter, setFilter] = useState<'all' | 'AI' | 'P1' | 'P2'>('all');
  const [services, setServices] = useState<ServiceItem[]>(defaultServices);
  const { sendMessage } = useChat();
  const { t } = useI18n();

  useEffect(() => {
    apiGet<{ services: ServiceItem[] }>('/api/services')
      .then((res) => {
        if (res?.services && res.services.length > 0) {
          setServices(res.services);
        }
      })
      .catch(() => {});
  }, []);

  const filteredServices = services.filter((s) => filter === 'all' || s.phase === filter);

  const getIconName = (s: ServiceItem) => {
    if (s.id === 'P1-23') return 'calendar';
    const lower = s.name.toLowerCase();
    if (lower.includes('card')) return 'cards';
    if (lower.includes('deposit')) return 'deposits';
    return 'requests';
  };

  const { startWorkflowById } = useBanking();

  const handleStartWorkflow = (wf: { id: string }) => {
    startWorkflowById(wf.id);
  };


  const handleStartService = (s: ServiceItem) => {
    if (onOpenService) {
      onOpenService(s.id);
    }
    setTimeout(() => {
      sendMessage(`I would like to request: ${s.name}`);
    }, 200);
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('A branch, wherever you are.')}</h1>
          <p>{t('Everyday account services and specialist support.')}</p>
        </div>
      </header>

      <div className="filters">
        {[
          ['all', t('All services')],
          ['AI', t('Mitra')],
          ['P1', t('Everyday banking')],
          ['P2', t('Specialist support')],
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

      {filter === 'AI' ? (
        <>
          <p className="form-hint" style={{ marginBottom: '14px' }}>
            {t('Document-assisted forms and guided services. Mitra prepares the details. You review and authorize the request.')}
          </p>
          <div className="three-grid">
            {aiWorkflows(t).map((wf) => (
              <article key={wf.id} className="service-tile">
                <Badge variant="neutral">{t('Mitra')}</Badge>
                <h3>{wf.name}</h3>
                <p>{wf.description}</p>
                <footer>
                  <span className="wf-service-note" style={{ fontSize: '13px', color: 'var(--muted)' }}>{wf.note}</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => handleStartWorkflow(wf)}
                  >
                    {t('Get started')} <Icon name="arrow-right" />
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="three-grid">
          {filteredServices.map((s) => (
            <article key={s.id} className="service-tile">
              <span className="quick-icon">
                <Icon name={getIconName(s)} />
              </span>
              <h3>{s.name}</h3>
              <p>
                {serviceCopy(t)[s.id] ||
                  t('Submit your details and track your request through digital banking.')}
              </p>
              <footer>
                <Badge variant="neutral">
                  {s.mode === 'HUMAN_APPROVAL' ? t('Officer review') : t('Banking service')}
                </Badge>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => handleStartService(s)}
                >
                  {t('Get started')} <Icon name="arrow-right" />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
};
