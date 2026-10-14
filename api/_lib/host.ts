export type EnvKind = 'prod' | 'uat' | 'test' | 'rmm' | 'admin';
export type Parsed =
  | { kind: 'marketing' }
  | { kind: 'unknown' }
  | { kind: 'tenant'; slug: string; env: EnvKind };

const SUFFIXES: [string, EnvKind][] = [
  ['-admin', 'admin'], ['-uat', 'uat'], ['-test', 'test'], ['-rmm', 'rmm'],
];
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'signup', 'status', 'mail', 'docs', 'support',
  'portal', 'login', 'auth', 'billing', 'static', 'cdn', 'test', 'uat', 'rmm',
]);

// hostname -> tenant slug + environment. Pattern: {slug}, {slug}-uat, -test, -rmm, -admin
export function parseHost(rawHost: string, base: string): Parsed {
  const host = rawHost.toLowerCase().split(':')[0];
  if (host === base || host === `www.${base}`) return { kind: 'marketing' };
  if (!host.endsWith('.' + base)) return { kind: 'unknown' };
  const label = host.slice(0, -(base.length + 1));
  if (label.includes('.') || !label) return { kind: 'unknown' };
  for (const [suffix, env] of SUFFIXES) {
    if (label.endsWith(suffix)) return { kind: 'tenant', slug: label.slice(0, -suffix.length), env };
  }
  if (RESERVED.has(label)) return { kind: 'marketing' };
  return { kind: 'tenant', slug: label, env: 'prod' };
}

// Returns an error message, or null if the slug is allowed.
export function validateSlug(slug: string, allowQa: boolean): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return 'Use 3-40 lowercase letters, numbers or hyphens.';
  if (slug.includes('--')) return 'Avoid double hyphens.';
  if (RESERVED.has(slug)) return 'That name is reserved.';
  if (SUFFIXES.some(([s]) => slug.endsWith(s))) return 'Names cannot end in -test, -uat, -rmm or -admin.';
  if (!allowQa && /-qa\d+$/.test(slug)) return 'That name is reserved.';
  return null;
}

export const schemaName = (slug: string, kind: string) =>
  `t_${slug.replace(/-/g, '_')}_${kind}`;

export const envUrl = (slug: string, kind: EnvKind, base: string) =>
  `https://${slug}${kind === 'prod' ? '' : '-' + kind}.${base}`;
