import { Hono, type Context } from 'hono';
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { q, safeSchema } from './_lib/db';
import { parseHost, validateSlug, envUrl, type Parsed } from './_lib/host';
import { runProvision } from './_lib/provision';

export const config = { runtime: 'edge' };

const app = new Hono().basePath('/api');
const BASE = () => process.env.BASE_DOMAIN || 'hi5central.com';
const DEV = () => process.env.ALLOW_DEV_HOST === 'true';

// ---------- host -> tenant -> environment ----------
function resolve(c: Context): Parsed {
  const dev = DEV() ? c.req.header('x-dev-host') : undefined;
  const host = dev || c.req.header('x-forwarded-host') || c.req.header('host') || '';
  const p = parseHost(host, BASE());
  return p.kind === 'unknown' && DEV() ? { kind: 'marketing' } : p;
}

async function itsmEnv(c: Context) {
  const p = resolve(c);
  if (p.kind !== 'tenant' || !['prod', 'uat', 'test'].includes(p.env)) return null;
  const [row] = await q(
    `select e.schema_name, e.version, e.status from tenants t
     join environments e on e.tenant_id = t.id
     where t.slug = $1 and e.kind = $2 and e.status = 'active'`,
    [p.slug, p.env],
  );
  return row ?? null;
}

// ---------- context ----------
app.get('/context', async (c) => {
  const p = resolve(c);
  if (p.kind === 'marketing') return c.json({ kind: 'marketing', base: BASE() });
  if (p.kind !== 'tenant') return c.json({ kind: 'unknown' });
  const [t] = await q(
    'select id, slug, name, update_model, products, status from tenants where slug=$1',
    [p.slug],
  );
  if (!t) return c.json({ kind: 'unknown' });
  if (p.env === 'admin') return c.json({ kind: 'admin', tenant: t });
  const [e] = await q('select version, status from environments where tenant_id=$1 and kind=$2', [t.id, p.env]);
  if (!e) return c.json({ kind: 'unknown' });
  return c.json({ kind: 'env', env: p.env, version: e.version, status: e.status, tenant: t });
});

// ---------- signup + onboarding ----------
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((x) => x.toString(16).padStart(2, '0')).join('');

app.post('/signup', async (c) => {
  const body = z.object({
    email: z.string().email(),
    company: z.string().min(2).max(80),
    products: z.array(z.enum(['itsm', 'rmm'])).min(1),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Check your details and try again.' }, 400);
  const { email, company, products } = body.data;

  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await q(
    `insert into signups (email, company, products, token_hash, expires_at)
     values ($1,$2,$3,$4, now() + interval '24 hours')`,
    [email.toLowerCase(), company, products, await sha256(token)],
  );
  const link = `${process.env.APP_URL || `https://${BASE()}`}/onboarding?token=${token}`;

  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM, to: email, subject: 'Set up your Hi5Central account',
        html: `<p>Welcome to Hi5Central. This link works once and expires in 24 hours.</p><p><a href="${link}">Start setup</a></p>`,
      }),
    });
    if (!r.ok) return c.json({ error: 'We could not send the email. Try again shortly.' }, 502);
  }
  return c.json({ ok: true, devLink: process.env.EMAIL_MODE === 'console' ? link : undefined });
});

async function findSignup(token: string) {
  const [s] = await q(
    `select * from signups where token_hash=$1 and used_at is null and expires_at > now()`,
    [await sha256(token)],
  );
  return s;
}

app.get('/onboarding/:token', async (c) => {
  const s = await findSignup(c.req.param('token'));
  if (!s) return c.json({ error: 'This link has expired or was already used. Sign up again for a new one.' }, 404);
  return c.json({ email: s.email, company: s.company, products: s.products });
});

app.get('/slug/check', async (c) => {
  const slug = (c.req.query('slug') || '').toLowerCase();
  const bad = validateSlug(slug, process.env.ALLOW_QA_SLUGS === 'true');
  if (bad) return c.json({ available: false, reason: bad });
  const [x] = await q('select 1 from tenants where slug=$1', [slug]);
  return c.json({ available: !x, reason: x ? 'That name is taken.' : null });
});

app.post('/onboarding/:token', async (c) => {
  const token = c.req.param('token');
  const b = z.object({
    slug: z.string(), name: z.string().min(2).max(80),
    region: z.enum(['uk', 'eu', 'us']),
    updateModel: z.enum(['managed', 'custom']).optional(),
    maintenanceDay: z.number().int().min(0).max(6),
    maintenanceHour: z.number().int().min(0).max(23),
    adminName: z.string().min(2).max(80),
  }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) return c.json({ error: 'Check the highlighted details and try again.' }, 400);
  const d = b.data;

  const s = await findSignup(token);
  if (!s) return c.json({ error: 'This link has expired or was already used.' }, 404);
  const hasItsm = s.products.includes('itsm');
  if (hasItsm && !d.updateModel) return c.json({ error: 'Choose how you want to receive updates.' }, 400);
  const bad = validateSlug(d.slug, process.env.ALLOW_QA_SLUGS === 'true');
  if (bad) return c.json({ error: bad }, 400);

  // Claim the token first so a double-click cannot create two tenants.
  const claimed = await q(
    `update signups set used_at=now() where token_hash=$1 and used_at is null returning id`,
    [await sha256(token)],
  );
  if (!claimed.length) return c.json({ error: 'This link was already used.' }, 409);

  let tenant;
  try {
    [tenant] = await q(
      `insert into tenants (slug, name, region, update_model, products, maintenance_day, maintenance_hour, admin_email, admin_name)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [d.slug, d.name, d.region, hasItsm ? d.updateModel : null, s.products,
       d.maintenanceDay, d.maintenanceHour, s.email, d.adminName],
    );
  } catch {
    await q('update signups set used_at=null where token_hash=$1', [await sha256(token)]);
    return c.json({ error: 'That name is taken.' }, 409);
  }
  await q('insert into provisioning_jobs (tenant_id) values ($1)', [tenant.id]);
  const ok = await runProvision(tenant.id);

  const base = BASE();
  const urls: { label: string; url: string }[] = [{ label: 'Admin Portal', url: envUrl(d.slug, 'admin', base) }];
  if (hasItsm) {
    urls.unshift({ label: 'ITSM', url: envUrl(d.slug, 'prod', base) });
    urls.push({ label: 'Test', url: envUrl(d.slug, 'test', base) });
    if (d.updateModel === 'custom') urls.push({ label: 'UAT', url: envUrl(d.slug, 'uat', base) });
  }
  if (s.products.includes('rmm')) urls.push({ label: 'RMM', url: envUrl(d.slug, 'rmm', base) });
  return c.json({ ok, urls });
});

// ---------- admin (NO AUTH YET: gated by ADMIN_PREVIEW) ----------
app.get('/admin/overview', async (c) => {
  if (process.env.ADMIN_PREVIEW !== 'true') return c.json({ error: 'Admin sign-in is not built yet.' }, 403);
  const p = resolve(c);
  if (p.kind !== 'tenant' || p.env !== 'admin') return c.json({ error: 'Not an admin host.' }, 404);
  const [t] = await q('select * from tenants where slug=$1', [p.slug]);
  if (!t) return c.json({ error: 'Not found.' }, 404);
  const envs = await q(
    `select kind, version, status, updated_at from environments where tenant_id=$1
     order by array_position(array['prod','uat','test','rmm'], kind)`, [t.id]);
  return c.json({
    tenant: { name: t.name, slug: t.slug, updateModel: t.update_model, region: t.region,
      maintenanceDay: t.maintenance_day, maintenanceHour: t.maintenance_hour },
    environments: envs.map((e) => ({ ...e, url: envUrl(t.slug, e.kind, BASE()) })),
  });
});

// ---------- ITSM (NO AUTH YET) ----------
app.get('/itsm/tickets', async (c) => {
  const e = await itsmEnv(c);
  if (!e) return c.json({ error: 'Environment not found.' }, 404);
  return c.json(await q(`select ref, subject, status, created_at from ${safeSchema(e.schema_name)}.tickets order by id desc limit 100`));
});

app.post('/itsm/tickets', async (c) => {
  const e = await itsmEnv(c);
  if (!e) return c.json({ error: 'Environment not found.' }, 404);
  const b = z.object({ subject: z.string().min(3).max(200) }).safeParse(await c.req.json().catch(() => null));
  if (!b.success) return c.json({ error: 'Enter a subject of at least 3 characters.' }, 400);
  const [row] = await q(`insert into ${safeSchema(e.schema_name)}.tickets (subject) values ($1) returning ref, subject, status, created_at`, [b.data.subject]);
  return c.json(row, 201);
});

app.get('/itsm/tickets/:ref', async (c) => {
  const e = await itsmEnv(c);
  if (!e) return c.json({ error: 'Environment not found.' }, 404);
  const [row] = await q(`select ref, subject, status, created_at from ${safeSchema(e.schema_name)}.tickets where ref=$1`, [c.req.param('ref')]);
  return row ? c.json(row) : c.json({ error: 'Ticket not found.' }, 404);
});

// ---------- retry stuck provisioning ----------
app.get('/cron/provision', async (c) => {
  if (c.req.header('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return c.json({ error: 'Unauthorized' }, 401);
  const jobs = await q(
    `select tenant_id from provisioning_jobs
     where state in ('pending','failed') and attempts < 5 and updated_at < now() - interval '1 minute'`);
  for (const j of jobs) await runProvision(j.tenant_id);
  return c.json({ retried: jobs.length });
});

export default handle(app);
