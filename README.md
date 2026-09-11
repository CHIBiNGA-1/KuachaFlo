# KuachaFlo — fresh build

One account. Two paths. Choose once — the fork never comes back.

## Task 1: onboarding (this build)

- Welcome → sign up / log in (email + Google, via Supabase Auth)
- The Fork → pick **Personal** or **Shop**, confirmed through a
  "this is permanent" lock screen
- Locked service home → placeholder each path lands on
- The lock is enforced in Postgres RLS (`supabase/schema.sql`):
  `service_choice` can be written exactly once, then it is immutable.

## Setup

1. Supabase Dashboard → SQL Editor → run `supabase/schema.sql` once.
2. Env (Vercel project settings, or local `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Google sign-in (optional): Supabase → Authentication → Providers → Google.
   Add the app URL to redirect URLs or Google login will fail.
4. `npm install && npm run dev` → http://localhost:3000

## Deploy note (Vercel)

The app now lives at the **repo root**, not `frontend/`. Set Vercel's
Root Directory to `/` (or leave blank) or deploys will fail.

## Archive

Everything from the previous build (backend, old frontend, KraTte app,
blueprint docs) is preserved untouched under `_archive/`.
