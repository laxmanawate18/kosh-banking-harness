import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import { PageHeader } from '../common/PageHeader';
import { ServiceTabs } from '../common/SectionTabs';
import { FilterTabs } from '../common/FilterTabs';
import { Stagger } from '../common/Animate';
import { humanizeCode } from '../common/Formatters';
import { CATALOGUE, SECTIONS, type Info, type Section } from '../app/serviceCatalogue';
import { apiGet } from '../../services/api';
import { useChat } from '../../context/ChatContext';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';

interface ServiceItem { id: string; name: string; mode?: string }

// Shown before the catalogue loads (and if it cannot).
const DEFAULT_IDS = ['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05', 'P1-06', 'P1-07', 'P1-08', 'P1-09', 'P1-10', 'P1-11', 'P1-12', 'P1-13',
  'P1-14', 'P1-15', 'P1-16', 'P1-17', 'P1-18', 'P1-19', 'P1-20', 'P1-21', 'P1-22', 'P1-23', 'P1-24', 'P2-01', 'P2-02', 'P2-03', 'P2-04',
  'P2-05', 'P2-06', 'P2-07', 'P2-08', 'P2-09', 'P2-10', 'P2-11', 'P2-12', 'P2-13', 'P2-14'].map(id => ({ id, name: id }));

// What most customers come for; the full catalogue stays one tab away.
const POPULAR_IDS = ['P1-25', 'P1-03', 'P1-04', 'P1-07', 'P1-09', 'P1-17', 'P1-23', 'P1-24', 'P1-19'];

interface ServicesPageProps {
  onOpenService?: (serviceId: string) => void;
  onStartWorkflow?: (workflowId: string) => void;
}

export const ServicesPage: React.FC<ServicesPageProps> = ({ onOpenService }) => {
  const { t } = useI18n();
  const { sendMessage } = useChat();
  const { startWorkflowById } = useBanking();
  const [services, setServices] = useState<ServiceItem[]>(DEFAULT_IDS);
  const [section, setSection] = useState<'popular' | 'all' | Section>('popular');
  const [query, setQuery] = useState('');

  useEffect(() => {
    apiGet<{ services: ServiceItem[] }>('/api/services')
      .then(res => { if (res?.services?.length) setServices(res.services); })
      .catch(() => {});
  }, []);

  const catalogue = CATALOGUE(t);
  const q = query.trim().toLowerCase();
  const items = services
    .map(s => ({ ...s, ...(catalogue[s.id] || { section: 'help' as Section, icon: 'services', title: humanizeCode(s.name), body: t('Mitra takes your details and tracks the request for you.') }) }))
    .filter(s => !q || `${s.title} ${s.body} ${s.name}`.toLowerCase().includes(q));
  const sections = SECTIONS(t).filter(([id]) => items.some(s => s.section === id));
  const popular = POPULAR_IDS.map(id => items.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  const showPopular = section === 'popular' && !q;  // a search always looks through everything
  const visible = showPopular ? [] : section === 'all' || section === 'popular' ? sections : sections.filter(([id]) => id === section);

  const ask = (s: ServiceItem & Info) => {
    onOpenService?.(s.id);
    setTimeout(() => sendMessage(t('I would like to: {service}', { service: s.title })), 200);
  };

  const renderTile = (s: typeof items[number]) => {
    const inner = (
      <>
        <span className="quick-icon"><Icon name={s.icon} /></span>
        <span className="c-tile-text">
          <strong>{s.title}</strong>
          <small>{s.body}</small>
          {s.workflow
            ? <span className="c-tag guided"><Icon name="sparkles" />{t('Guided form')}</span>
            : s.route ? null : <span className="c-tag"><Icon name="ai-banker" />{t('With Mitra')}</span>}
        </span>
        <Icon name="arrow-right" className="icon k-go" />
      </>
    );
    return s.route
      ? <Stagger.Item as="a" key={s.id} href={`#${s.route}`} className="k-quick-tile c-service" whileTap={{ scale: 0.98 }}>{inner}</Stagger.Item>
      : <Stagger.Item as="button" key={s.id} type="button" className="k-quick-tile c-service" whileTap={{ scale: 0.98 }}
          onClick={() => (s.workflow ? startWorkflowById(s.workflow) : ask(s))}>{inner}</Stagger.Item>;
  };

  return (
    <>
      <ServiceTabs active="services" />
      <PageHeader title={t('Services')} subtitle={t('Everyday banking requests, without a branch visit.')} />
      <div className="k-page-stack">
        <div className="c-services-tools">
          <label className="c-search">
            <Icon name="search" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search services, for example “cheque”')} aria-label={t('Search services')} />
          </label>
          <FilterTabs label={t('Service groups')} name="services" value={section} onChange={id => setSection(id as typeof section)} tabs={[
            { id: 'popular', label: t('Popular'), count: popular.length },
            { id: 'all', label: t('All'), count: items.length },
            ...SECTIONS(t).map(([id, label]) => ({ id, label, count: items.filter(s => s.section === id).length })),
          ]} />
        </div>

        <p className="c-legend">
          <span className="c-tag guided"><Icon name="sparkles" />{t('Guided form')}</span>
          {t('Mitra fills the form from your documents; you check it before it is sent.')}
        </p>

        {showPopular && (
          <section aria-labelledby="svc-popular">
            <div className="c-section-head"><h2 id="svc-popular">{t('Most used')}</h2></div>
            <Stagger className="c-tile-grid">{popular.map(renderTile)}</Stagger>
          </section>
        )}

        {!showPopular && visible.length === 0 && (
          <div className="k-card empty"><Icon name="search" /><h3>{t('No services match “{q}”', { q: query })}</h3><p>{t('Try another word, or ask Mitra.')}</p></div>
        )}

        {visible.map(([id, label]) => (
          <section key={`${id}-${section}`} aria-labelledby={`svc-${id}`}>
            <div className="c-section-head"><h2 id={`svc-${id}`}>{label}</h2></div>
            <Stagger className="c-tile-grid">
              {items.filter(s => s.section === id).map(renderTile)}
            </Stagger>
          </section>
        ))}
      </div>
    </>
  );
};
