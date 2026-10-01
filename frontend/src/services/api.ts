let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

async function refreshCsrfToken(): Promise<boolean> {
  // Another tab (or a session read) rotates the token; fetch the current one.
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  csrfToken = data.csrf_token || null;
  return Boolean(csrfToken);
}

export async function request<T = any>(url: string, options: RequestInit = {}, retried = false): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (!['GET', 'HEAD'].includes(method.toUpperCase()) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  let data: any = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 403 && data.detail === 'CSRF validation failed' && !retried && await refreshCsrfToken()) {
      return request<T>(url, options, true);
    }
    const detail = data.detail || {};
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
        ? detail.map((e: any) => e.msg).join('; ')
        : detail.message || detail.code || (response.status >= 500
          ? 'Our servers are having trouble right now. Please try again in a minute.'
          : `Request failed (${response.status})`);
    const error = new Error(message) as Error & { status: number; detail: any };
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  return data as T;
}

export const get = <T = any>(url: string, options: RequestInit = {}) =>
  request<T>(url, { method: 'GET', ...options });

export const post = <T = any>(url: string, body: any = {}, options: RequestInit = {}) =>
  request<T>(url, { method: 'POST', body: JSON.stringify(body), ...options });

export const patch = <T = any>(url: string, body: any = {}, options: RequestInit = {}) =>
  request<T>(url, { method: 'PATCH', body: JSON.stringify(body), ...options });

export const del = <T = any>(url: string, options: RequestInit = {}) =>
  request<T>(url, { method: 'DELETE', ...options });

export const apiGet = get;
export const apiPost = post;
export const apiPatch = patch;
export const apiDelete = del;
