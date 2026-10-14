import { useEffect, useState } from 'react';

// Dev only: simulate a tenant host with ?host=h5c-custom-qa26-uat.hi5central.com
const devHost = (): string | null => {
  if (!import.meta.env.DEV && location.hostname.endsWith('.vercel.app') === false) return null;
  const fromUrl = new URLSearchParams(location.search).get('host');
  if (fromUrl) sessionStorage.setItem('h5c.devhost', fromUrl);
  return sessionStorage.getItem('h5c.devhost');
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const h = devHost();
  const res = await fetch('/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(h ? { 'x-dev-host': h } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || 'Something went wrong. Try again.');
  return data as T;
}

export type Ctx =
  | { kind: 'marketing'; base: string }
  | { kind: 'unknown' }
  | { kind: 'admin'; tenant: Tenant }
  | { kind: 'env'; env: 'prod' | 'uat' | 'test' | 'rmm'; version: string; status: string; tenant: Tenant };
export type Tenant = { slug: string; name: string; update_model: 'managed' | 'custom' | null; products: string[] };

export function navigate(to: string) {
  if (location.pathname !== to) history.pushState({}, '', to);
  window.dispatchEvent(new Event('h5c-nav'));
}
export const openInBackground = (to: string) =>
  window.dispatchEvent(new CustomEvent('h5c-open', { detail: to }));

export function usePath() {
  const [p, setP] = useState(location.pathname);
  useEffect(() => {
    const f = () => setP(location.pathname);
    addEventListener('popstate', f);
    addEventListener('h5c-nav', f);
    return () => { removeEventListener('popstate', f); removeEventListener('h5c-nav', f); };
  }, []);
  return p;
}
