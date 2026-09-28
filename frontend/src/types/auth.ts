export type UserRole = 'CUSTOMER' | 'OFFICER';

export interface User {
  id: string;
  username: string;
  display_name: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: UserRole;
  customer_id?: string | null;
  phone_number?: string | null;
}

export interface AuthContext {
  authenticated: boolean;
  session_id: string;
  user: User;
  assurance_level: string;
  auth_source?: 'oidc';
  client_id?: string | null;
  scopes?: string[];
  csrf_token: string;
  consent?: {
    id: string;
    accepted: boolean;
    granted_at: string;
    scopes: string[];
  } | null;
}

export interface PublicAuthConfig {
  gcp_project_id: string;
  firebase_api_key: string;
  recaptcha_site_key: string;
  firebase_auth_domain: string;
  firebase_test_phone: string;
  firebase_test_code: string;
  is_local?: boolean;
  oauth_start_url: string;
}
