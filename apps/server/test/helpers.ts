import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app';

export const ADMIN_PW = process.env.SEED_ADMIN_PASSWORD || 'Admin@Solar2025';
export const DEMO_PW = 'Demo@123456';

let app: FastifyInstance | null = null;
export async function getApp() {
  if (!app) {
    app = await buildApp({ logger: false });
    await app.ready();
  }
  return app;
}

/** Minimal cookie-jar client around fastify.inject with CSRF handling. */
export class Client {
  cookies: Record<string, string> = {};
  csrf = '';
  constructor(public app: FastifyInstance) {}

  private store(res: LightMyRequestResponse) {
    for (const c of res.cookies) {
      if (c.value === '' || (c.expires && new Date(c.expires) < new Date())) delete this.cookies[c.name];
      else this.cookies[c.name] = c.value;
    }
    if (this.cookies.csrf_token) this.csrf = this.cookies.csrf_token;
  }

  async req(method: string, url: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extraHeaders };
    if (method !== 'GET' && this.csrf && !('x-csrf-token' in extraHeaders)) headers['x-csrf-token'] = this.csrf;
    const res = await this.app.inject({
      method: method as 'GET',
      url,
      payload: body as object,
      headers,
      cookies: this.cookies,
    });
    this.store(res);
    return res;
  }
  get(url: string) { return this.req('GET', url); }
  post(url: string, body?: unknown, h?: Record<string, string>) { return this.req('POST', url, body ?? {}, h); }
  put(url: string, body?: unknown) { return this.req('PUT', url, body ?? {}); }
  patch(url: string, body?: unknown) { return this.req('PATCH', url, body ?? {}); }
  del(url: string) { return this.req('DELETE', url); }

  async login(username: string, password: string) {
    const res = await this.post('/api/auth/login', { username, password });
    if (res.statusCode !== 200) throw new Error(`login ${username} failed: ${res.statusCode} ${res.body}`);
    return this;
  }
}

export async function loginAs(username: string, password = username === 'admin' ? ADMIN_PW : DEMO_PW) {
  return new Client(await getApp()).login(username, password);
}

/** Build a multipart/form-data payload for fastify.inject. */
export function multipart(fields: Record<string, string>, file?: { name: string; filename: string; content: Buffer; type: string }) {
  const boundary = '----solarTestBoundary' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields))
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(file.content, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export async function upload(c: Client, url: string, file: { filename: string; content: Buffer; type: string }) {
  const mp = multipart({}, { name: 'file', ...file });
  return c.app.inject({ method: 'POST', url, payload: mp.payload, headers: { ...mp.headers, 'x-csrf-token': c.csrf }, cookies: c.cookies });
}
