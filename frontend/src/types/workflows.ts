export interface WorkflowFieldDefinition {
  key: string;
  label: string;
  section: string;
  kind: 'select' | 'account' | 'beneficiary' | 'textarea' | 'date' | 'text' | 'money';
  required?: boolean;
  pattern?: string;
  choices?: [string, string][];
}

export interface ServiceSchema {
  id: string;
  name: string;
  description: string;
  level: string;
  documents: boolean;
  fields: WorkflowFieldDefinition[];
  outcome: string;
  service_id: string;
  category?: string;
  icon?: string;
}

export interface WorkflowDocument {
  id: string;
  document_type: string;
  scan_status: 'TEXT_EXTRACTED' | 'NO_TEXT_FOUND' | 'ERROR' | string;
  quality_score?: number;
  message?: string;
}

export interface WorkflowCheck {
  code: string;
  status: 'PASS' | 'OFFICER_REVIEW' | 'FAIL' | string;
  blocking: boolean;
  message: string;
}

export interface BankingWorkflow {
  id: string;
  skill_id: string;
  name: string;
  status: 'DRAFT' | 'SUBMITTED' | 'COMPLETED' | string;
  revision: number;
  fields: Record<string, string>;
  sources: Record<string, string>;
  documents: WorkflowDocument[];
  checks: WorkflowCheck[];
  request_id?: string;
  review_digest?: string;
  review_expires_at?: string;
  outcome?: string;
  download?: string;
  fulfilment_summary?: string;
  updated_at: string;
  presentation?: {
    type: string;
    workflow_id: string;
  };
}

export interface WorkflowServicesResponse {
  services: ServiceSchema[];
  document_processing: {
    processing_region: string;
    [key: string]: any;
  };
}
