import { q, safeSchema } from './db';
import { schemaName } from './host';

type T = {
  id: string; slug: string; update_model: string | null; products: string[];
  admin_email: string; admin_name: string;
};

export const envKinds = (t: T): string[] => {
  const kinds: string[] = [];
  if (t.products.includes('itsm')) kinds.push('prod', 'test', ...(t.update_model === 'custom' ? ['uat'] : []));
  if (t.products.includes('rmm')) kinds.push('rmm');
  return kinds;
};

// Every step is idempotent, so a failed job can be retried safely.
const STEPS: { name: string; run: (t: T) => Promise<void> }[] = [
  {
    name: 'environments',
    run: async (t) => {
      const [{ version }] = await q('select version from releases order by released_at desc limit 1');
      for (const kind of envKinds(t)) {
        await q(
          `insert into environments (tenant_id, kind, version, schema_name)
           values ($1,$2,$3,$4) on conflict (tenant_id, kind) do nothing`,
          [t.id, kind, version, schemaName(t.slug, kind)],
        );
      }
    },
  },
  {
    name: 'schemas',
    run: async (t) => {
      for (const kind of envKinds(t)) {
        const s = safeSchema(schemaName(t.slug, kind));
        await q(`create schema if not exists ${s}`);
        if (kind === 'rmm') {
          await q(`create table if not exists ${s}.devices (id serial primary key, hostname text not null, last_seen timestamptz)`);
        } else {
          // Blank operational DB. Test is never seeded from Production.
          await q(`create table if not exists ${s}.tickets (
            id serial primary key,
            ref text generated always as ('INC-' || (1000 + id)::text) stored,
            subject text not null, status text not null default 'open',
            created_at timestamptz not null default now())`);
        }
      }
    },
  },
  {
    name: 'admin_access',
    run: async (t) => {
      const [u] = await q(
        `insert into users (tenant_id, email, name) values ($1,$2,$3)
         on conflict (tenant_id, email) do update set name = excluded.name returning id`,
        [t.id, t.admin_email, t.admin_name],
      );
      await q(
        `insert into env_access (user_id, environment_id, role)
         select $1, id, 'admin' from environments where tenant_id = $2
         on conflict do nothing`,
        [u.id, t.id],
      );
    },
  },
  {
    name: 'activate',
    run: async (t) => {
      await q(`update environments set status='active', updated_at=now() where tenant_id=$1`, [t.id]);
      await q(`update tenants set status='active' where id=$1`, [t.id]);
    },
  },
];

export async function runProvision(tenantId: string): Promise<boolean> {
  const [t] = await q('select * from tenants where id=$1', [tenantId]);
  const [job] = await q('select * from provisioning_jobs where tenant_id=$1', [tenantId]);
  if (!t || !job) return false;
  const steps: Record<string, boolean> = job.steps ?? {};
  for (const step of STEPS) {
    if (steps[step.name]) continue;
    try {
      await step.run(t);
      steps[step.name] = true;
      await q('update provisioning_jobs set steps=$2, updated_at=now() where tenant_id=$1', [tenantId, JSON.stringify(steps)]);
    } catch (e: any) {
      await q(
        `update provisioning_jobs set state='failed', attempts=attempts+1, last_error=$2, updated_at=now() where tenant_id=$1`,
        [tenantId, String(e?.message ?? e)],
      );
      return false;
    }
  }
  await q(`update provisioning_jobs set state='done', updated_at=now() where tenant_id=$1`, [tenantId]);
  return true;
}
