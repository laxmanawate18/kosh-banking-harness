export interface Account {
  id: string;
  customer_id?: string;
  account_number: string;
  account_number_masked?: string;
  name?: string;
  type?: string;
  account_type: string;
  currency?: string;
  available_balance_minor?: number;
  balance_paise: number;
  ledger_balance_minor?: number;
  ifsc_code?: string;
  branch?: string;
  status: string;
}

export interface Transaction {
  id: string;
  account_id?: string;
  reference?: string;
  reference_number: string;
  description: string;
  category?: string;
  direction?: 'CREDIT' | 'DEBIT';
  type?: 'CREDIT' | 'DEBIT';
  amount_minor?: number;
  amount_paise: number;
  posted_at?: string;
  created_at: string;
  balance_after_minor?: number;
  status: string;
}

export interface Beneficiary {
  id: string;
  name: string;
  account_number: string;
  account_number_masked?: string;
  ifsc?: string;
  ifsc_code: string;
  bank_name: string;
  transfer_limit_paise?: number;
  status: string;
  nickname?: string;
  created_at?: string;
}

export interface Bill {
  id: string;
  biller_name: string;
  biller_id?: string;
  consumer_number?: string;
  category: string;
  amount_minor?: number;
  amount_paise: number;
  due_date: string;
  status: 'PENDING' | 'DUE' | 'PAID' | 'OVERDUE';
}

export interface Card {
  id: string;
  account_id?: string;
  card_number: string;
  card_number_masked?: string;
  card_type: string;
  card_network?: string;
  cardholder_name: string;
  expiry?: string;
  expiry_month?: string;
  expiry_year?: string;
  cvv?: string;
  status: 'ACTIVE' | 'FROZEN' | 'BLOCKED';
  is_frozen?: boolean;
  daily_limit_minor?: number;
  daily_limit_paise?: number;
  international_enabled?: boolean;
}

export interface CustomerKYC {
  status: 'NOT_DONE' | 'PENDING_RE_KYC' | 'VERIFIED' | 'IN_REVIEW' | 'SUBMITTED_FOR_REVIEW' | string;
  due_date?: string;
  discrepancy_flags?: string[];
  account_restrictions?: string[];
  pending_requirements?: string[];
  risk_category?: string;
  pan_masked?: string;
  aadhaar_masked?: string;
}

export interface CustomerProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  display_name?: string;
  email: string;
  phone: string;
  phone_number?: string;
  tier?: string;
  city?: string;
  kyc?: CustomerKYC;
}

export interface PortalOverview {
  customer?: CustomerProfile;
  accounts: Account[];
  transactions: Transaction[];
  bills: Bill[];
  cards: Card[];
  beneficiaries: Beneficiary[];
  requests?: ServiceRequestItem[];
  kyc?: CustomerKYC;
  total_available_minor: number;
  security_score?: number;
  pending_challenges?: Challenge[];
  pending_actions?: any[];
}

export interface Challenge {
  id: string;
  payment_intent_id?: string;
  action?: string;
  action_type?: string;
  prompt?: string;
  user_id?: string;
  challenge_type?: string;
  source_account_id?: string;
  source_account_name?: string;
  source_account_masked?: string;
  destination_masked?: string;
  payee_name?: string;
  amount_minor?: number;
  amount_paise?: number;
  expires_at?: string;
  transaction_digest?: string;
  request_digest?: string;
  status: string;
  attempts_remaining?: number;
  created_at?: string;
}

export interface ServiceRequestItem {
  id: string;
  service_id?: string;
  request_type: string;
  service_name?: string;
  status: 'SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'IN_REVIEW' | 'PENDING';
  created_at: string;
  updated_at?: string;
  details?: string;
  data?: Record<string, any>;
  dossier_id?: string;
  discrepancy_flags?: string[];
  decision_notes?: string;
}

export interface AuditEvent {
  id?: string;
  sequence?: number;
  event_id?: string;
  event_type?: string;
  action: string;
  actor?: string;
  actor_id: string;
  resource: string;
  severity?: string;
  status: string;
  summary?: string;
  details?: Record<string, any>;
  integrity_hash?: string;
  created_at: string;
}
