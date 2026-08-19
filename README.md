# SnapLedger

Snap a receipt, Gemini reads it and auto-categorizes it in one call, real
accounts via Supabase Auth (email + Google), ready to deploy to Render +
Vercel for free.

## What's actually running

| Piece | Now | Notes |
|---|---|---|
| Backend | FastAPI | |
| Database | SQLite by default | Set `DATABASE_URL` to switch to Supabase Postgres |
| Image storage | Local disk (`backend/uploads/`) | Swap for Cloudinary/Supabase Storage when you outgrow this |
| OCR + categorization | Gemini API, one call | Structured JSON output, category is a schema `enum` so it can't invent one |
| Auth | Supabase Auth (email/password + Google) | Backend verifies tokens itself via JWKS — no secret key needed |
| Frontend | Next.js 14 (App Router) | |
| Reports | PDF (fpdf2, pure Python) + CSV export | Report tab, downloads directly, also saved to history |
| Payments | Admin page, manual plan flip | Move to Flutterwave/Paystack once you have real revenue |

## Security note

The backend verifies users by checking their Supabase session token's
signature against Supabase's **public** JWKS endpoint
(`/auth/v1/.well-known/jwks.json`). This only ever needs your Supabase
project URL — never the `service_role`/secret key. That key bypasses Row
Level Security entirely and isn't used anywhere in this codebase. Don't add
it later without a specific reason, and if you ever do, it must stay
server-side only, never in a `NEXT_PUBLIC_` variable.

If you're setting this up from scratch: get your keys from Supabase
dashboard → **Project Settings → API**. You want the **publishable/anon**
key, not `service_role`.

## Setup

### 1. Gemini API key

https://aistudio.google.com/apikey — free, no card. (Keys from AI Studio
normally start with `AIzaSy...`; if yours looks different, double-check
you copied it from the right place.)

### 2. Supabase project

Create one at https://supabase.com (free, no card). You need:

- **Project URL** and **publishable (anon) key** — Project Settings → API
- **Google sign-in** (optional but you asked for it) — Authentication →
  Providers → Google. You'll need a Google OAuth Client ID/Secret from
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials);
  Supabase's provider page shows you exactly which redirect URI to add
  there.
- **Site URL / Redirect URLs** — Authentication → URL Configuration. Add
  `http://localhost:3000` now, and your real deployed URL once you have one
  (see Deploy section).

### 3. Fill in `.env`

```bash
cp .env.example .env
```

Fill in `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
Leave `DATABASE_URL` unset for now — that gets you running on local
SQLite immediately.

### 4. Fire it up

```bash
docker compose up --build
```

- **App:** http://localhost:3000 — sign up or continue with Google, then snap a receipt
- **Admin:** http://localhost:8000/admin/ — see users, manually set their plan to Pro
- **API docs:** http://localhost:8000/docs

## Moving to Supabase Postgres

Local SQLite is fine for prototyping but doesn't survive a redeploy on most
hosts. To switch:

1. Supabase dashboard → **Project Settings → Database → Connection string**
   → copy the **URI** under "Transaction pooler" (this mode works better
   with serverless/free-tier hosts than the direct connection).
2. Put your DB password directly into the connection string **in your local
   `.env` file** — don't paste it into a chat, ever, even to an AI
   assistant. It's a different secret from your API keys.
3. Set it as `DATABASE_URL` in `.env`.
4. `docker compose up --build` again — tables get created automatically on
   startup (`init_db()` in `backend/app/database.py`).

## Deploying for free (Render + Vercel)

Supabase is already hosted. This gets the app itself online too.

**Backend → Render**

1. Push this repo to GitHub.
2. Render dashboard → New → Web Service → connect the repo, root directory
   `backend/`. Render detects the `Dockerfile` automatically.
3. Environment variables (Render → your service → Environment): same keys
   as your local `.env` — `GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`,
   `DATABASE_URL` (your Supabase Postgres URL — do this now, Render's free
   disk doesn't persist SQLite across deploys), `ALLOWED_ORIGINS` (leave
   room to add your Vercel URL once you have it).
4. Deploy. Note the `https://your-service.onrender.com` URL Render gives
   you.

**Frontend → Vercel**

1. Vercel dashboard → New Project → import the same repo, root directory
   `frontend/`.
2. Environment variables: `NEXT_PUBLIC_API_URL` = your Render backend URL,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Deploy. Note the `https://your-app.vercel.app` URL.

**Wire them together**

- Render → update `ALLOWED_ORIGINS` to include your real Vercel URL,
  redeploy.
- Supabase → Authentication → URL Configuration → add your Vercel URL to
  Site URL / Redirect URLs (Google sign-in will fail without this).
- If you set up Google OAuth, add the Vercel URL to the authorized
  redirect URIs in Google Cloud Console too.

Both Render's and Vercel's free tiers work with no credit card. Render's
free web services sleep after inactivity (~30-60s cold start on the first
request after a while) — fine for a prototype, worth upgrading once you
have real users.

## Known limitations (still intentional)

- **Backend runs synchronously** (upload → Gemini call → response in one
  request). Fine for prototyping traffic. Add a queue before real
  concurrent load — Gemini calls take a few seconds each.
- **A bad/blurry photo, an unreachable Gemini API, or a rate-limited key**
  all land the receipt as `needs_review` with nulled-out fields rather than
  failing the upload outright — you always get a row back to edit by hand.
- **First-time Google/email sign-in creates a local user row automatically**
  (`backend/app/deps.py`) — there's no separate "invite" step.

## Why the frontend calls the backend directly

The browser talks to the backend at `NEXT_PUBLIC_API_URL` directly — no
Next.js proxy in between. An earlier version routed requests through
`next.config.js` rewrites, which reset the connection on slow requests
("socket hang up"). Direct calls avoid that entirely.
