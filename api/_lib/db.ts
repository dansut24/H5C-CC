import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
// Parameterised query helper. Identifiers (schema names) are validated before use.
export const q = (text: string, params: unknown[] = []) =>
  sql.query(text, params as any[]) as Promise<any[]>;
export const safeSchema = (s: string) => {
  if (!/^t_[a-z0-9_]+$/.test(s)) throw new Error('bad schema name');
  return `"${s}"`;
};
