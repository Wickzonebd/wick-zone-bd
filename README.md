# Micro Job Community

A mobile-first bilingual (Bangla/English) micro-job and social community application built with React/TypeScript, Vinext/Vite, Tailwind-compatible CSS, Supabase, and Cloudflare Workers.

## What is implemented

- Supabase email/password authentication with registration, password recovery, session persistence, protected application routes, unique Bangladesh mobile numbers, referral codes, and secure profile/private-profile separation.
- Admin-controlled branding, theme, activation price, payout methods, support link, hero banners, announcement tickers, official links, and service/project cards.
- Micro Job previews for all signed-in users with protected job instructions and target URLs available only through a membership-gated RPC.
- Manual proof review with private proof storage and atomic/idempotent reward approval.
- Immutable wallet ledger, income summaries, withdrawal holds/reversals, and manual payout workflow.
- Real feed posts, media, likes, comments, moderation, reports, pinned content, Web Share/copy-link fallback, connections, referral network, and notifications.
- Admin dashboard for users, membership, jobs, proofs, withdrawals, feed moderation, dynamic site content, settings, and audit history.
- Payment-ready adapter and webhook boundary. The current gateway is deliberately `not_configured` and cannot create fake success or unlock a membership.

## Local configuration

1. Copy `.env.example` to `.env.local` locally (never commit it).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project API settings.
3. Run `npm install` and `npm run dev`.

Only public/publishable browser credentials belong in `NEXT_PUBLIC_*`. Never expose a service-role key or payment secret to browser JavaScript.

## Database

Apply migrations in `supabase/migrations` in filename order. The initial migration creates the full schema, RLS policies, storage buckets, storage policies, indexes, triggers, realtime publications, seed content, and security-definer RPCs.

Important guarantees are enforced in PostgreSQL, not CSS:

- Locked members can call `list_job_previews` but `get_job_details`, `start_job_submission`, and `submit_job_proof` reject them.
- Users cannot write membership status or wallet transactions directly.
- `admin_approve_job_submission` locks the submission/job rows and uses a unique reward idempotency key before changing the proof to approved.
- A withdrawal inserts an immutable negative hold transaction. Rejection adds one idempotent reversal; paid status does not debit twice.
- Job proof objects live in the private `job-proofs` bucket and can be read only by the owner or an administrator.

## Create the first administrator

There is no hard-coded administrator credential. Register a normal user first, then promote that exact user from the Supabase SQL editor using its UUID:

```sql
insert into public.user_roles (user_id, role)
values ('REGISTERED_USER_UUID', 'admin')
on conflict (user_id, role) do nothing;
```

Do this only from a trusted database/admin surface. The browser role cannot assign itself `admin` because RLS and grants block role writes.

## Payment integration contract

No live payment provider is configured. `lib/payments/gateway.ts`, the payment API route, `payment_orders`, and `supabase/functions/payment-webhook` are the integration seam.

When merchant credentials are available:

1. Keep all merchant secrets server-side.
2. Create a pending `payment_orders` record with a unique idempotency key.
3. Redirect only to the provider-hosted checkout; never collect card credentials in this application.
4. Verify the provider callback/webhook signature server-side.
5. Match amount, currency, order identity, and provider reference.
6. In one idempotent database transaction, transition the order to paid and membership to active.
7. Keep payment activation separate from any real-world identity-verification badge.

## Content and uploads

- Branding/job media: administrators only.
- Avatar/post media: owner uploads with public read.
- Job proofs: private; owner/admin read only.
- Client upload code limits supported image types and file sizes; bucket limits and RLS provide the server-side boundary.
- React renders user text as escaped text. External URLs are restricted to HTTP/HTTPS in both application validation and database checks.

## Cloudflare

The project builds to a Cloudflare Worker-compatible ESM entry at `dist/server/index.js`. `wrangler.deploy.jsonc` describes optional direct Workers deployment compatibility without interfering with the Vite preview configuration. ChatGPT Sites uses `.openai/hosting.json` for its production Cloudflare lifecycle; do not put runtime secrets into either configuration file.

## Quality gates

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Before release, test registration/recovery with an email inbox, the locked-to-admin-activated job path, proof approval twice, rejection, two-user feed interactions, connection acceptance, wallet withdrawal transitions, content updates, and the 360/390/430px responsive layouts.
