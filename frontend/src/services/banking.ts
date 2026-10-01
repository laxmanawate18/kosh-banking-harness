import { get, post, patch, del } from './api';
import type { PortalOverview, AuditEvent } from '../types/banking';

export async function fetchOverview(): Promise<PortalOverview> {
  return get<PortalOverview>('/api/portal/overview');
}

export async function fetchEvents(): Promise<{ events: AuditEvent[] }> {
  return get<{ events: AuditEvent[] }>('/api/portal/events');
}

export async function transferMoney(payload: {
  source_account_id: string;
  beneficiary_id?: string;
  amount_minor: number;
  note?: string;
  request_key?: string;
}): Promise<any> {
  const requestKey = payload.request_key || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  return post('/api/portal/payments', {
    request_key: requestKey,
    action: 'TRANSFER',
    source_account_id: payload.source_account_id,
    beneficiary_id: payload.beneficiary_id,
    amount_minor: payload.amount_minor,
    note: payload.note || '',
  });
}

export async function addBeneficiary(payload: {
  name?: string;
  display_name?: string;
  upi_id?: string;
  account_number?: string;
  ifsc?: string;
  ifsc_code?: string;
  bank_name?: string;
  nickname?: string;
  transfer_limit_paise?: number;
}): Promise<any> {
  const displayName = (payload.display_name || payload.name || '').trim();
  let upiId = (payload.upi_id || payload.nickname || '').trim();
  if (!upiId || !upiId.includes('@')) {
    const slug = (displayName || 'user').toLowerCase().replace(/[^a-z0-9]/g, '') || 'payee';
    upiId = `${slug}@koshbank`;
  }
  return post('/api/portal/beneficiaries', {
    display_name: displayName,
    upi_id: upiId,
  });
}

export async function payBill(payload: {
  bill_id: string;
  source_account_id: string;
  note?: string;
  request_key?: string;
}): Promise<any> {
  const requestKey = payload.request_key || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  return post('/api/portal/payments', {
    request_key: requestKey,
    action: 'PAY_BILL',
    bill_id: payload.bill_id,
    source_account_id: payload.source_account_id,
    note: payload.note || '',
  });
}

export async function freezeCard(cardId: string, note?: string): Promise<any> {
  const requestKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return post('/api/portal/payments', {
    request_key: requestKey,
    action: 'FREEZE_CARD',
    card_id: cardId,
    note: note || 'Customer requested card protection',
  });
}

export async function setCardStatus(cardId: string, status: 'ACTIVE' | 'FROZEN', note?: string): Promise<any> {
  if (status === 'FROZEN') {
    return freezeCard(cardId, note);
  }
  return { status: 'ACTIVE' };
}

export async function verifyChallenge(challengeId: string, payload: {
  transaction_digest: string;
}): Promise<any> {
  return post(`/api/challenges/${encodeURIComponent(challengeId)}/verify`, payload);
}

export async function submitServiceRequest(payload: {
  service_id: string;
  data: Record<string, any>;
}): Promise<{ id: string; status: string }> {
  return post('/api/portal/service-requests', {
    service_id: payload.service_id,
    data: { ...payload.data, channel: 'DIGITAL_BANKING' },
  });
}

export async function fetchOperationsQueue(): Promise<{ cases: any[] }> {
  return get('/api/portal/operations');
}

export async function recordOfficerDecision(caseId: string, payload: {
  action: 'APPROVE' | 'REJECT';
  reason: string;
  override_justification?: string;
  verification_checks?: string[];
  verification_reference?: string;
}): Promise<any> {
  return post(`/api/officer/requests/${encodeURIComponent(caseId)}/decision`, payload);
}

export async function fetchOfficerRpaStatus(caseId: string): Promise<any> {
  return get(`/api/officer/requests/${encodeURIComponent(caseId)}/rpa`);
}

export async function fetchOfficerLeads(): Promise<{ leads: any[] }> {
  return get('/api/officer/leads');
}

export async function updateOfficerLeadStatus(leadId: string, status: string, notes?: string): Promise<any> {
  return post(`/api/officer/leads/${encodeURIComponent(leadId)}/status`, { status, notes });
}

export async function approveOfficerLead(leadId: string, email?: string): Promise<any> {
  return post(`/api/officer/leads/${encodeURIComponent(leadId)}/approve`, { email });
}

export async function fetchOfficerCustomers(): Promise<{ customers: any[] }> {
  return get('/api/officer/customers');
}

export async function wipeOfficerCustomer(customerId: string): Promise<any> {
  return del(`/api/officer/customers/${encodeURIComponent(customerId)}`);
}

export async function resendOfficerCustomerCredentials(customerId: string): Promise<any> {
  return post(`/api/officer/customers/${encodeURIComponent(customerId)}/resend-credentials`, {});
}


/** Hand the customer to the bank's video-KYC (V-CIP) provider. The provider's signed result updates KYC. */
export async function startVideoKyc(): Promise<void> {
  const session = await post<{ url: string }>('/api/portal/ekyc/sessions');
  window.location.assign(session.url);
}
