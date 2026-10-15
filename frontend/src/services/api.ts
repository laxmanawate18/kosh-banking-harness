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

async function request<T = any>(url: string, options: RequestInit = {}, retried = false): Promise<T> {
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
    if (response.status === 401 && !url.includes('/api/auth/session')) {
      window.dispatchEvent(new CustomEvent('kosh:session-expired', { detail: { url, status: 401 } }));
    }
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

export const put = <T = any>(url: string, body: any = {}, options: RequestInit = {}) =>
  request<T>(url, { method: 'PUT', body: JSON.stringify(body), ...options });

export const del = <T = any>(url: string, options: RequestInit = {}) =>
  request<T>(url, { method: 'DELETE', ...options });

export async function postStream(
  url: string,
  body: any,
  onDelta: (delta: string) => void,
  options: RequestInit = {}
): Promise<{ reply: string; tools?: string[] }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    ...(options.headers as Record<string, string> || {}),
  };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify({ ...body, stream: true }),
    ...options,
  });

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`;
    try {
      const errJson = await response.json();
      errMsg = errJson.detail || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming not supported');
  }

  const decoder = new TextDecoder('utf-8');
  let accumulated = '';
  let tools: string[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const event = JSON.parse(dataStr);
        if (event.type === 'token' && event.delta) {
          accumulated += event.delta;
          onDelta(event.delta);
        } else if (event.type === 'tool' && event.name) {
          tools.push(event.name);
        } else if (event.type === 'done' && event.reply) {
          accumulated = event.reply;
          if (event.tools) tools = event.tools;
        } else if (event.type === 'error' && event.message) {
          throw new Error(event.message);
        }
      } catch (err: any) {
        if (err.message && err.message !== 'Unexpected end of JSON input') {
          throw err;
        }
      }
    }
  }

  return { reply: accumulated, tools };
}

export const apiGet = get;
export const apiPost = post;
export const apiPatch = patch;
export const apiDelete = del;
