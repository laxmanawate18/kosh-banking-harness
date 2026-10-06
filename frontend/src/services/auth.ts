import { get, post, setCsrfToken } from './api';
import type { AuthContext, PublicAuthConfig } from '../types/auth';

export async function fetchPublicConfig(): Promise<PublicAuthConfig> {
  return get<PublicAuthConfig>('/api/auth/public-config');
}
export async function checkSession(): Promise<AuthContext> {
  const data = await get<AuthContext>('/api/auth/session');
  if (data.csrf_token) setCsrfToken(data.csrf_token);
  return data;
}

export async function submitConsent(accepted: boolean = true): Promise<any> {
  return post('/api/consent', { accepted });
}

export interface LogoutResponse {
  logged_out: boolean;
  idp_sign_out_url?: string | null;
}

export async function logout(): Promise<LogoutResponse> {
  const res = await post<LogoutResponse>('/api/auth/logout');
  setCsrfToken(null);
  return res;
}

export async function demoStepUp(code: string): Promise<any> {
  return post('/api/auth/firebase-step-up', { code });
}

export async function firebaseStepUp(idToken: string): Promise<any> {
  return post('/api/auth/firebase-step-up', { id_token: idToken });
}
