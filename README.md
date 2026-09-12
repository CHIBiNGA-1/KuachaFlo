# KuachaFlo — fresh build

One account. Two paths. Choose once — the fork never comes back.

## Repo layout

This is a monorepo. Each concern lives in its own directory with its
own dependencies — nothing at the repo root gets built or deployed
directly.

- `frontend/` — the Next.js app (this is what Vercel deploys). Owns
  its own `package.json`, its own `node_modules`, its own build.
  Currently talks directly to Supabase (Auth + Postgres via RLS) —
  no separate API server for Task 1.
- `supabase/` — SQL schema and RLS policies, run directly in the
  Supabase SQL Editor. Not a deployable app; source-of-truth for the
  database, versioned alongside the code that depends on it.
- `backend/` — reserved for when server-side logic that can't live in
  Supabase RLS/Postgres functions is needed (e.g. calling a paid AI
  API with a secret key, sending WhatsApp messages, anything that
  needs a server holding credentials the client must never see). Not
  created yet because Task 1 doesn't need it — added the moment a
  future task does, as its own independently deployable service with
  its own dependencies, not code bolted onto the frontend.

Nothing here shares a `node_modules`, a deploy target, or a build
step with anything else. Each directory should be deployable and
testable on its own.

## Task 1: onboarding (this build)

- Welcome → sign up / log in (email + Google, via Supabase Auth)
- The Fork → pick **Personal** or **Shop**, confirmed through a
  "this is permanent" lock screen
- Locked service home → placeholder each path lands on
- The lock is enforced in Postgres RLS (`supabase/schema.sql`):
  `service_choice` can be written exactly once, then it is immutable.

## Setup

1. Supabase Dashboard → SQL Editor → run `supabase/schema.sql` once.
2. Env (Vercel project settings, or local `frontend/.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Google sign-in (optional): Supabase → Authentication → Providers → Google.
   Add the app URL to redirect URLs or Google login will fail.
4. `cd frontend && npm install && npm run dev` → http://localhost:3000

## Deploy note (Vercel)

Set the Vercel project's **Root Directory** to `frontend`. Everything
Vercel needs (package.json, next.config.js, etc.) lives there, not at
the repo root — the repo root is a container for multiple independent
projects, not a project itself.
