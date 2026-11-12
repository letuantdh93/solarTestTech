/** Fetch wrapper: JSON, cookies, CSRF header, Vietnamese error messages. */
import i18n from '@/i18n';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details))
      for (const d of this.details as Array<{ path: string; message: string }>) if (d.path && !out[d.path]) out[d.path] = d.message;
    return out;
  }
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

export const authEvents = new EventTarget();

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData; raw?: boolean; keepalive?: boolean } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError(0, i18n.t('common.networkError'), 'NETWORK');
  }
  if (res.status === 401 && !path.startsWith('/auth/login')) authEvents.dispatchEvent(new Event('unauthorized'));
  if (!res.ok) {
    let body: { message?: string; code?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, body.message ?? i18n.t('common.unknownError'), body.code, body.details);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download a file from an authenticated GET endpoint. */
export async function download(path: string, fallbackName: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const name = m ? decodeURIComponent(m[1]!) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
