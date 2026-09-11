# KuachaFlo — fresh build

One account. Two paths. Choose once — the fork never comes back.

## Task 1: onboarding (this build)

- Welcome → sign up / log in (email + Google, via Supabase Auth)
- The Fork → pick **Personal** or **Shop**, confirmed through a
  "this is permanent" lock screen
- Locked service home → placeholder each path lands on
- The lock is enforced in Postgres RLS (`supabase/schema.sql`):
  `service_choice` can be written exactly once, then it is immutable.

## Deploy note (Vercel)

The app should live at the  `frontend/`.
