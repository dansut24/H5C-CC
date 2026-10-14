import { neon } from '@neondatabase/serverless';

let sql: ReturnType<typeof neon> | null = null;
function conn() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Connect Neon to this Vercel project and redeploy.');
  return (sql ??= neon(url));
}

// Parameterised query helper. Identifiers (schema names) are validated before use.
export const q = (text: string, params: unknown[] = []) =>
  conn().query(text, params as any[]) as Promise<any[]>;

export const safeSchema = (s: string) => {
  if (!/^t_[a-z0-9_]+$/.test(s)) throw new Error('bad schema name');
  return `"${s}"`;
};
