export interface Product {
  id: string;
  category: 'savings' | 'cards' | 'deposits' | 'loans' | 'wealth';
  category_label: string;
  title: string;
  tagline: string;
  headline_rate: string;
  badge?: string;
  featured?: boolean;
  features: string[];
  min_balance?: string;
  interest_payout?: string;
  welcome_bonus?: string;
  initial_deposit?: number;
  joining_fee?: string;
  credit_limit?: string;
  tenure_range?: string;
  fact_metadata?: {
    source: string;
    effective_from: string;
    last_reviewed_at: string;
    illustrative: boolean;
  };
  disclosure?: string;
}

export interface ProductCategory {
  id: string;
  label: string;
}

interface OnboardingProfile {
  user_id: string;
  customer_id: string;
  display_name: string;
  phone_number: string;
}

export interface ProductApplyPayload {
  product_id: string;
  full_name: string;
  phone_number: string;
  email?: string;
  pan_number?: string;
  dob?: string;
  employment_type?: string;
  employer_or_college?: string;
  monthly_income?: number;
  pincode?: string;
  loan_amount?: number;
  loan_tenure_months?: number;
  loan_purpose?: string;
  existing_emi?: number;
}

export interface CrossSellOffer {
  title: string;
  headline: string;
  description: string;
  product_id: string;
}

export interface ProductApplyResponse {
  success: boolean;
  application_type?: 'credit_card' | 'loan' | 'savings_account';
  message: string;
  application_ref?: string;
  status?: string;
  status_note?: string;
  card_title?: string;
  credit_limit?: string;
  loan_title?: string;
  loan_amount?: string;
  tenure_months?: number;
  estimated_emi?: string;
  headline_rate?: string;
  purpose?: string;
  applicant_name?: string;
  phone_number?: string;
  pan_masked?: string;
  employment_type?: string;
  pincode?: string;
  next_steps?: string;
  cross_sell_offer?: CrossSellOffer;
  email?: string;
  product?: any;
  profile?: OnboardingProfile;
  account?: any;
  authentication?: string;
}
