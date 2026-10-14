# Hi5Central starter (phase 1)

Hono API + React/Vite on Vercel, Neon Postgres. Untested build: run `npm install && npm run typecheck` first.

## What works
Signup -> emailed single-use link -> onboarding wizard (Managed/Custom) -> idempotent provisioning
(Prod + Test, + UAT for Custom, RMM Prod only) -> host-based routing for
`{slug}`, `-uat`, `-test`, `-rmm`, `-admin` -> tabbed ITSM workspace (each tab has its own URL)
-> read-only Admin Portal. Test starts blank; UAT/Test/Prod have separate schemas.

## NOT built yet (do not use with real data)
- **No sign-in.** ITSM and admin endpoints are open. Admin is gated only by `ADMIN_PREVIEW=true`.
- Per-environment access grants are stored (`env_access`) but not enforced.
- No Stripe, promotion, maintenance windows, version-pinned routing, or RMM agents.

## Deploy
1. Push to GitHub, import into Vercel. Add Neon from the Marketplace (sets `DATABASE_URL`).
2. Run `db/schema.sql` in the Neon SQL editor.
3. Copy `.env.example` values into Vercel env vars. Set `BASE_DOMAIN` to your test domain.
4. Add the apex and `*.yourdomain` to the Vercel project (wildcard needs Vercel nameservers).
5. Without a domain: open the vercel.app URL, sign up, then simulate tenants with
   `?host=h5c-custom-qa26-uat.yourdomain` (needs `ALLOW_DEV_HOST=true`).
6. Email: set `RESEND_API_KEY` and remove `EMAIL_MODE`.

Reserved: `qa26`-style slugs are blocked unless `ALLOW_QA_SLUGS=true` (keep it off in production).
