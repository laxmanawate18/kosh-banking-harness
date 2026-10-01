import { get, post, patch, del } from './api';
import type { BankingWorkflow, WorkflowServicesResponse } from '../types/workflows';

export async function fetchServices(): Promise<WorkflowServicesResponse> {
  return get<WorkflowServicesResponse>('/api/ai/services');
}

export async function startWorkflow(skillId: string): Promise<BankingWorkflow> {
  return post<BankingWorkflow>('/api/ai/workflows', { skill_id: skillId });
}

export async function getWorkflow(workflowId: string): Promise<BankingWorkflow> {
  return get<BankingWorkflow>(`/api/ai/workflows/${encodeURIComponent(workflowId)}`);
}

export async function saveWorkflow(
  workflowId: string,
  revision: number,
  fields: Record<string, string>
): Promise<BankingWorkflow> {
  return patch<BankingWorkflow>(`/api/ai/workflows/${encodeURIComponent(workflowId)}`, {
    revision,
    fields,
  });
}

export async function uploadWorkflowDocument(
  workflowId: string,
  payload: {
    revision: number;
    document_type: string;
    name: string;
    mime_type: string;
    data_base64: string;
    consent: boolean;
  }
): Promise<BankingWorkflow> {
  return post<BankingWorkflow>(`/api/ai/workflows/${encodeURIComponent(workflowId)}/documents`, payload);
}

export async function deleteWorkflowDocument(workflowId: string, documentId: string): Promise<BankingWorkflow> {
  return del<BankingWorkflow>(`/api/ai/workflows/${encodeURIComponent(workflowId)}/documents/${encodeURIComponent(documentId)}`);
}

export async function reviewWorkflow(
  workflowId: string,
  revision: number,
  fields: Record<string, string> = {}
): Promise<BankingWorkflow> {
  return post<BankingWorkflow>(`/api/ai/workflows/${encodeURIComponent(workflowId)}/review`, {
    revision,
    fields,
  });
}

export async function submitWorkflow(
  workflowId: string,
  payload: {
    revision: number;
    review_digest: string;
    confirmed: boolean;
  }
): Promise<BankingWorkflow> {
  return post<BankingWorkflow>(`/api/ai/workflows/${encodeURIComponent(workflowId)}/submit`, payload);
}
