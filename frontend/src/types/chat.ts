import type { Product } from './products';

export interface Attachment {
  name: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
}

export interface RPAProgressPayload {
  application_reference: string;
  customer_name?: string;
  account_scheme?: string;
  stage?: 'VERIFIED' | 'CBS_DATA_ENTRY' | 'PRE_SUBMIT_VERIFIED' | 'SUBMITTED_AS_MAKER' | 'COMPLETED' | 'UNKNOWN';
  cif_number?: string;
  account_number?: string;
  cbs_reference?: string;
  approver_officer?: string;
  maker_service_account?: string;
  read_back_matches?: number;
  error_message?: string;
}

export interface ChatPresentation {
  type?: string;
  title?: string;
  description?: string;
  html?: string;
  action?: string;
  workflow_id?: string;
  data?: any;
  job?: RPAProgressPayload | any;
  [key: string]: any;
}

export interface ExecutionStep {
  id: string;
  type: 'intent' | 'skill' | 'tool_call' | 'tool_result' | 'policy' | 'status';
  label: string;
  detail?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: number;
  args?: Record<string, any>;
  result?: any;
  duration_ms?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  attachments?: Attachment[];
  timestamp: number;
  isStreaming?: boolean;
  presentation?: ChatPresentation;
  toolResult?: any;
  salesAction?: SalesAction;
  steps?: ExecutionStep[];
  duration_ms?: number;
  /** Dictated with the mic: Mitra reads its reply aloud. */
  spoken?: boolean;
}

export interface SalesProduct extends Product {
  match_reasons?: string[];
  tradeoffs?: string[];
  disclosure?: string;
  fact_metadata?: {
    source: string;
    effective_from: string;
    last_reviewed_at: string;
    illustrative: boolean;
  };
  [key: string]: unknown;
}

export interface SalesAction {
  action: 'gather_context' | 'show_products' | 'offer_onboarding' | string;
  stage?: 'DISCOVER' | 'CLARIFY' | 'RECOMMEND' | 'EXPLAIN' | 'NEXT_ACTION';
  product_id?: string | null;
  products?: SalesProduct[];
  summary?: {
    goal?: string | null;
    preferences?: string[];
    recommended_product_id?: string | null;
  };
  follow_up_question?: string | null;
  next_action?: {
    type: 'OPEN_APPLICATION' | string;
    product_id: string;
    label: string;
  } | null;
  suggested_queries?: string[];
  disclosures?: string[];
}

export interface SessionInfo {
  id: string;
  session_id?: string;
  title: string;
  updated_at?: number;
  created_at?: string;
  message_count?: number;
}
