import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BankingProvider, useBanking } from './context/BankingContext';
import { ChatProvider, useChat } from './context/ChatContext';
import { useI18n } from './i18n';
import { AuthScreen } from './components/auth/AuthScreen';
import { AppShell } from './components/layout/AppShell';
import { PaymentChallengeModal } from './components/overview/PaymentChallengeModal';
import { LotusMark } from './components/common/KoshLogo';
import { OverviewPage } from './components/overview/OverviewPage';
import { NotFound } from './components/site/InfoPages';

// Route-level code splitting: each page (and the heavy workflow dialog) loads on first visit.
const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType<any>>>, key: K) =>
  lazy(() => loader().then(m => ({ default: m[key] })));
const AIBankerPage = named(() => import('./components/pages/AIBankerPage'), 'AIBankerPage');
const AccountsPage = named(() => import('./components/pages/AccountsPage'), 'AccountsPage');
const TransactionsPage = named(() => import('./components/pages/TransactionsPage'), 'TransactionsPage');
const UpiPage = named(() => import('./components/pages/UpiPage'), 'UpiPage');
const PaymentsPage = named(() => import('./components/pages/PaymentsPage'), 'PaymentsPage');
const BeneficiariesPage = named(() => import('./components/pages/BeneficiariesPage'), 'BeneficiariesPage');
const BillsPage = named(() => import('./components/pages/BillsPage'), 'BillsPage');
const CardsPage = named(() => import('./components/pages/CardsPage'), 'CardsPage');
const DepositsPage = named(() => import('./components/pages/DepositsPage'), 'DepositsPage');
const ServicesPage = named(() => import('./components/pages/ServicesPage'), 'ServicesPage');
const RequestsPage = named(() => import('./components/pages/RequestsPage'), 'RequestsPage');
const SecurityPage = named(() => import('./components/pages/SecurityPage'), 'SecurityPage');
const SettingsPage = named(() => import('./components/pages/SettingsPage'), 'SettingsPage');
const OperationsPage = named(() => import('./components/officer/OperationsPage'), 'OperationsPage');
const AuditActivityPage = named(() => import('./components/officer/AuditActivityPage'), 'AuditActivityPage');
const WorkflowModal = named(() => import('./components/workflows/WorkflowModal'), 'WorkflowModal');
const AssistantDrawerLazy = named(() => import('./components/chat/AssistantDrawer'), 'AssistantDrawer');

/** The chat drawer (markdown renderer included) downloads the first time someone opens Mitra. */
const AssistantDrawer: React.FC = () => {
  const { isOpen } = useChat();
  const [wanted, setWanted] = useState(isOpen);
  useEffect(() => { if (isOpen) setWanted(true); }, [isOpen]);
  return wanted ? <Suspense fallback={null}><AssistantDrawerLazy /></Suspense> : null;
};

const CUSTOMER_ROUTES = ['overview', 'ai-banker', 'accounts', 'transactions', 'upi', 'payments', 'beneficiaries', 'bills', 'cards', 'deposits', 'services', 'requests', 'security', 'settings'];
const OFFICER_ROUTES = ['operations', 'leads', 'history', 'audit'];

const routeFromHash = (isOfficer: boolean): string => {
  const hash = window.location.hash.replace(/^#/, '').trim();
  const home = isOfficer ? 'operations' : 'overview';
  // Empty hash or a public-site path (#/rates…) lands on home after login.
  if (!hash || hash.startsWith('/')) return home;
  const allowed = isOfficer ? OFFICER_ROUTES : CUSTOMER_ROUTES;
  if (allowed.includes(hash)) return hash;
  return (isOfficer ? CUSTOMER_ROUTES : OFFICER_ROUTES).includes(hash) ? home : 'not-found';
};

const PageLoading: React.FC = () => {
  const { t } = useI18n();
  return <div className="k-loading"><LotusMark size={48} className="k-spin-slow" /><span>{t('Loading…')}</span></div>;
};

const AuthenticatedWorkspace: React.FC = () => {
  const { user } = useAuth();
  const isOfficer = user?.role === 'OFFICER';
  const [activeRoute, setActiveRoute] = useState<string>(() => routeFromHash(isOfficer));
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('');
  const { activeChallenge, setActiveChallenge, activeWorkflowId, setActiveWorkflowId } = useBanking();

  const go = (route: string) => {
    setActiveRoute(route);
    if (window.location.hash !== `#${route}`) window.location.hash = `#${route}`;
  };

  useEffect(() => {
    const onHash = () => setActiveRoute(routeFromHash(isOfficer));
    window.addEventListener('hashchange', onHash);
    if (window.location.hash !== `#${activeRoute}` && activeRoute !== 'not-found') window.location.hash = `#${activeRoute}`;
    return () => window.removeEventListener('hashchange', onHash);
  }, [isOfficer]);

  const sendTo = (beneId: string) => { setSelectedBeneficiaryId(beneId); go('payments'); };

  const page = (() => {
    switch (activeRoute) {
      case 'overview': return <OverviewPage onNavigate={go} />;
      case 'ai-banker': return <AIBankerPage />;
      case 'accounts': return <AccountsPage onNavigate={go} />;
      case 'transactions': return <TransactionsPage />;
      case 'upi': return <UpiPage onNavigate={go} onSendMoney={sendTo} />;
      case 'payments': return <PaymentsPage initialBeneficiaryId={selectedBeneficiaryId} onStartKyc={() => go('ai-banker')} />;
      case 'beneficiaries': return <BeneficiariesPage onNavigate={go} onSendMoney={sendTo} />;
      case 'bills': return <BillsPage />;
      case 'cards': return <CardsPage onNavigate={go} onOpenService={() => go('services')} />;
      case 'deposits': return <DepositsPage onNavigate={go} onOpenService={() => go('services')} onViewRequest={() => go('requests')} />;
      case 'services': return <ServicesPage onOpenService={() => go('ai-banker')} onStartWorkflow={() => go('ai-banker')} />;
      case 'requests': return <RequestsPage onNavigate={go} />;
      case 'security': return <SecurityPage onNavigate={go} onExportAudit={() => window.print()} />;
      case 'settings': return <SettingsPage onOpenService={() => go('services')} onStartKyc={() => go('ai-banker')} onBookAppointment={() => go('services')} />;
      case 'operations': return <OperationsPage isHistory={false} />;
      case 'leads': return <OperationsPage isHistory={false} initialFilter="leads" />;
      case 'history': return <OperationsPage isHistory={true} />;
      case 'audit': return <AuditActivityPage />;
      default: return <NotFound home={isOfficer ? '#operations' : '#overview'} />;
    }
  })();

  return (
    <AppShell activeRoute={activeRoute} onRouteChange={go}>
      <Suspense fallback={<PageLoading />}>{page}</Suspense>
      <AssistantDrawer />
      <PaymentChallengeModal challenge={activeChallenge} onClose={() => setActiveChallenge(null)} />
      {activeWorkflowId && (
        <Suspense fallback={null}>
          <WorkflowModal workflowId={activeWorkflowId} onClose={() => setActiveWorkflowId(null)} />
        </Suspense>
      )}
    </AppShell>
  );
};

const MainAppRouter: React.FC = () => {
  const { t } = useI18n();
  const { isAuthenticated, isLoading } = useAuth();
  const { setIsOpen } = useChat();

  if (isLoading) {
    return <div className="k-loading full"><LotusMark size={64} className="k-spin-slow" /><span>{t('Opening your Kosh securely…')}</span></div>;
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthScreen />
        <button type="button" className="k-fab" onClick={() => setIsOpen(true)}><LotusMark size={30} /><span>{t('Ask Mitra')}</span></button>
        <AssistantDrawer />
      </>
    );
  }

  return <AuthenticatedWorkspace />;
};

export default function App() {
  return (
    <AuthProvider>
      <BankingProvider>
        <ChatProvider>
          <MainAppRouter />
        </ChatProvider>
      </BankingProvider>
    </AuthProvider>
  );
}
