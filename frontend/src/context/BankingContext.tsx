import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type {
  PortalOverview,
  Challenge,
  AuditEvent,
  Account,
  Transaction,
  Beneficiary,
  Bill,
  Card,
  CustomerProfile,
  CustomerKYC,
  ServiceRequestItem,
} from '../types/banking';
import * as bankingService from '../services/banking';
import { startWorkflow as startWorkflowApi } from '../services/workflows';
import { useAuth } from './AuthContext';

interface BankingContextValue {
  overview: PortalOverview | null;
  accounts: Account[];
  beneficiaries: Beneficiary[];
  profile: CustomerProfile | null;
  kyc: CustomerKYC | null;
  serviceRequests: ServiceRequestItem[];
  events: AuditEvent[];
  isLoading: boolean;
  activeChallenge: Challenge | null;
  setActiveChallenge: (c: Challenge | null) => void;
  activeWorkflowId: string | null;
  setActiveWorkflowId: (id: string | null) => void;
  openWorkflow: (id: string) => void;
  startWorkflowById: (skillId: string) => Promise<void>;
  refreshOverview: () => Promise<void>;
  transferMoney: (payload: { source_account_id: string; beneficiary_id?: string; amount_minor: number; note?: string }) => Promise<any>;
  addBeneficiary: (payload: { name: string; account_number: string; ifsc_code?: string; bank_name?: string; nickname?: string; transfer_limit_paise?: number }) => Promise<any>;
  payBill: (billId: string, sourceAccountId?: string) => Promise<any>;
  toggleCardFreeze: (cardId: string, freeze: boolean) => Promise<void>;
  verifyChallenge: () => Promise<any>;
}


/** The server answers a refused payment with success:false, not with an error status. Turn it into an error so no page reports it as done. */
const refusedAsError = <T,>(res: T): T => {
  const r = res as any;
  if (r && r.success === false && !r.challenge) {
    const said = r.sentinel?.customer_message || r.presentation?.message || r.error || 'This was not completed. Nothing was changed.';
    // The message may ask the customer to quote the reference, so show it.
    throw new Error(r.sentinel?.reference && /reference/i.test(said) ? `${said} Reference: ${r.sentinel.reference}` : said);
  }
  return res;
};

const BankingContext = createContext<BankingContextValue | undefined>(undefined);

export const BankingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { auth, user } = useAuth();
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [serviceRequests] = useState<ServiceRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);

  const openWorkflow = useCallback((id: string) => {
    setActiveWorkflowId(id);
  }, []);

  const startWorkflowById = useCallback(async (skillId: string) => {
    try {
      const wf = await startWorkflowApi(skillId);
      if (wf && wf.id) {
        setActiveWorkflowId(wf.id);
      }
    } catch (e) {
      console.error('Could not start workflow', e);
    }
  }, []);


  const normalizeOverview = (data: any): PortalOverview => {
    if (!data) return data;
    const accounts: Account[] = (data.accounts || []).map((a: any) => ({
      ...a,
      name: String(a.name ?? a.account_name ?? ''),
      account_name: String(a.account_name ?? a.name ?? ''),
      balance_paise: a.balance_paise ?? a.available_balance_minor ?? 0,
      account_type: a.account_type ?? a.type ?? 'SAVINGS',
      account_number: a.account_number ?? a.account_number_masked ?? '10920000001',
    }));

    const transactions: Transaction[] = (data.transactions || []).map((t: any) => ({
      ...t,
      description: String(t.description ?? ''),
      counterparty: String(t.counterparty ?? ''),
      amount_paise: t.amount_paise ?? t.amount_minor ?? 0,
      type: t.type ?? t.direction ?? 'DEBIT',
      reference_number: t.reference_number ?? t.reference ?? t.id,
      created_at: t.created_at ?? t.posted_at ?? new Date().toISOString(),
    }));

    const bills: Bill[] = (data.bills || []).map((b: any) => ({
      ...b,
      amount_paise: b.amount_paise ?? b.amount_minor ?? 0,
      category: b.category ?? 'Utility',
      status: b.status ?? 'PENDING',
    }));

    const cards: Card[] = (data.cards || []).map((c: any) => ({
      ...c,
      card_number: c.card_number ?? c.card_number_masked ?? '•••• •••• •••• 9821',
      card_type: String(c.card_type ?? 'KOSH PLATINUM DEBIT'),
      cardholder_name: c.cardholder_name ?? data.customer?.full_name ?? 'VALUED CUSTOMER',
      daily_limit_paise: c.daily_limit_paise ?? c.daily_limit_minor ?? 20000000,
      is_frozen: c.is_frozen ?? (c.status === 'FROZEN'),
      status: c.status ?? (c.is_frozen ? 'FROZEN' : 'ACTIVE'),
    }));

    const beneficiaries: Beneficiary[] = (data.beneficiaries || []).map((b: any) => ({
      ...b,
      account_number: b.account_number ?? b.account_number_masked ?? '10920000002',
      ifsc_code: b.ifsc_code ?? b.ifsc ?? 'SNTL0001092',
    }));

    const customer = data.customer ? {
      ...data.customer,
      email: String(data.customer.email ?? ''),
    } : data.customer;

    return {
      ...data,
      customer,
      accounts,
      transactions,
      bills,
      cards,
      beneficiaries,
      security_alerts: (data.security_alerts || []).map((alert: any) => ({
        ...alert,
        title: String(alert.title ?? ''),
        description: String(alert.description ?? ''),
      })),
      total_available_minor: data.total_available_minor ?? accounts.reduce((s, a) => s + a.balance_paise, 0),
    };
  };

  const refreshOverview = useCallback(async () => {
    if (!auth && !user) return;
    setIsLoading(true);
    try {
      if (user?.role === 'ADMIN') {
        // The Admin Panel loads its own data; an admin has no banking overview.
      } else if (user?.role === 'OFFICER') {
        const ops = await bankingService.fetchOperationsQueue().catch(() => null);
        if (ops) {
          const reqs = (ops as any).requests || (ops as any).cases || [];
          setOverview({
            requests: reqs,
            operations: reqs,
          } as any);
          setEvents((((ops as any).events || []) as AuditEvent[]));
        }
      } else {
        const [ovData, evData] = await Promise.all([
          bankingService.fetchOverview().catch(() => null),
          bankingService.fetchEvents().catch(() => ({ events: [] })),
        ]);
        if (ovData) {
          setOverview(normalizeOverview(ovData));
        }
        setEvents(((evData?.events || []) as AuditEvent[]));
      }
    } catch (e) {
      console.error('Failed to load banking overview:', e);
    } finally {
      setIsLoading(false);
    }
  }, [auth, user]);

  useEffect(() => {
    if (auth || user) {
      refreshOverview();
    } else {
      setOverview(null);
      setEvents([]);
    }
  }, [auth, user, refreshOverview]);

  const transferMoney = async (payload: { source_account_id: string; beneficiary_id?: string; amount_minor: number; note?: string }) => {
    const res = refusedAsError(await bankingService.transferMoney(payload));
    if (res?.challenge) {
      setActiveChallenge(res.challenge);
    } else {
      await refreshOverview();
    }
    return res;
  };

  const addBeneficiary = async (payload: { name: string; account_number: string; ifsc_code?: string; bank_name?: string; nickname?: string; transfer_limit_paise?: number }) => {
    const res = await bankingService.addBeneficiary({
      name: payload.name,
      account_number: payload.account_number,
      ifsc: payload.ifsc_code || 'SNTL0001092',
      bank_name: payload.bank_name || 'Kosh Bank',
      nickname: payload.nickname,
    });
    await refreshOverview();
    return res;
  };

  const payBill = async (billId: string, sourceAccountId?: string) => {
    const accId = sourceAccountId || overview?.accounts[0]?.id || '';
    const res = refusedAsError(await bankingService.payBill({ bill_id: billId, source_account_id: accId }));
    if (res?.challenge) {
      setActiveChallenge(res.challenge);
    } else {
      await refreshOverview();
    }
    return res;
  };

  const toggleCardFreeze = async (cardId: string, freeze: boolean) => {
    const nextStatus = freeze ? 'FROZEN' : 'ACTIVE';
    refusedAsError(await bankingService.setCardStatus(cardId, nextStatus));
    await refreshOverview();
  };

  const verifyChallenge = async () => {
    if (!activeChallenge) throw new Error('No active challenge');
    const res = await bankingService.verifyChallenge(activeChallenge.id, {
      transaction_digest: activeChallenge.transaction_digest || '',
    });
    if (res.success || res.status === 'SUCCESS' || res.status === 'APPROVED') {
      // The dialog closes itself after it has shown the receipt; clearing the challenge here would remove it first.
      await refreshOverview();
    }
    return res;
  };

  return (
    <BankingContext.Provider
      value={{
        overview,
        accounts: overview?.accounts || [],
        beneficiaries: overview?.beneficiaries || [],
        profile: overview?.customer || null,
        kyc: overview?.customer?.kyc || null,
        serviceRequests,
        events,
        isLoading,
        activeChallenge,
        setActiveChallenge,
        activeWorkflowId,
        setActiveWorkflowId,
        openWorkflow,
        startWorkflowById,
        refreshOverview,
        transferMoney,
        addBeneficiary,
        payBill,
        toggleCardFreeze,
        verifyChallenge,
      }}
    >
      {children}
    </BankingContext.Provider>
  );
};
export const useBanking = () => {
  const context = useContext(BankingContext);
  if (!context) throw new Error('useBanking must be used within a BankingProvider');
  return context;
};
