# KraTte

Run your shop with clarity — inventory, orders, and daily operations in one calm workspace.

KraTte is a shop-management app built for small retailers. One account, one
shop, no setup wizard: you sign in and you're on the shelf.

- **Inventory** — a visual shelf. Products as photo cards on a staggered board,
  with stock state, quick edit, and one-tap "sell" or "reorder" without leaving
  the page. A table view is one click away when you want density instead.
- **Sales & purchases** — orders with line items, server-computed totals,
  per-shop reference numbers (`#SW-1`, `#PO-1`), and automatic stock movement.
- **People** — customers, suppliers, and staff, kept separate but in one place.
- **Expenses** — running costs, paid or unpaid, filed against the shop.
- **Reports** — trends, margins, and customer insight, on purpose rather than
  in your face.
- **WhatsApp capture** *(optional)* — text a day-sales tally or photograph a
  till roll and it rings up into Sales.

---

## Why the overview is inventory-first

The dashboard shows stock health, not revenue. That's deliberate. This screen is
most often open on a counter with customers standing beside it, and "what do I
need to reorder" is both the more actionable question and the one you don't mind
a stranger glancing at. Money analysis lives in **Reports**, where you go when
you mean to.

---

## Architecture

```
frontend/   Next.js 14 (App Router) + Tailwind. Talks to Supabase for auth
            and to the API for everything else.
backend/    FastAPI + SQLAlchemy. Verifies Supabase JWTs, owns all business
            logic, and is the only thing that touches shop tables.
supabase/   SQL to run once in your Supabase project.
```

Shop tables have **RLS enabled with no policies**. No browser client can read or
write them, ever. The backend reaches them with the service role and enforces
ownership itself: every request resolves to exactly one `business_id`, and a
shop is auto-provisioned on first touch, so there's no "pick a mode" gate and no
dead end for a brand-new account.

---

## Getting started

### 1. Supabase

Create a project, then in **SQL Editor** run, in order:

```
supabase/001_core.sql
supabase/002_shop.sql
```

From **Settings → API**, copy the project URL and the publishable (anon) key.

### 2. Backend

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL, SUPABASE_URL, ADMIN_API_KEY
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is on `http://localhost:8000`; `GET /healthz` should return `{"ok": true}`.

`DATABASE_URL` is your Supabase connection string in production. Locally you can
leave the SQLite default — the app creates its tables on boot.

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local    # fill in the two Supabase values + API URL
npm install
npm run dev
```

Open `http://localhost:3000`. Sign up, and you're on the shelf.

### Or: Docker

```bash
cp backend/.env.example backend/.env
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
  docker compose up --build
```

---

## Optional integrations

Everything below is off by default. The app works fully without any of it —
blank keys just mean the feature stays dormant rather than breaking.

| Feature | Needs | What it does |
|---|---|---|
| WhatsApp capture | `WHATSAPP_*` + `GEMINI_API_KEY` | Text or photograph sales into the shop |
| Billing alerts | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Pings you when someone submits a MoMo payment |
| Admin API | `ADMIN_API_KEY` | Grant plans, review payment claims |

### Billing

There's no payment gateway. A shop owner pays via Airtel or MTN MoMo off-app and
submits the transaction reference; you verify it in your MoMo app and confirm it:

```bash
curl -X PATCH localhost:8000/api/v1/admin/payment-requests/<id> \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "confirm"}'
```

Confirming sets the plan. The admin API has no UI on purpose — it's three
endpoints, driven by the Telegram pings.

Plan limits (ledger entries): free 100, pro 1,000, business unlimited.

---

## Tests

```bash
cd backend && pytest        # 56 tests
cd frontend && npm run build
```

Backend coverage is on the parts where a bug costs money: order totals and stock
movement, idempotency, the capture pipeline, expenses, and the billing/admin
flow.

---

## Notes for whoever picks this up next

- **Money is decimal, everywhere.** `app/shop/money.py` exists so that no float
  ever touches a total. Keep it that way.
- **Idempotency is real.** Order and expense writes accept an `Idempotency-Key`
  and replay the stored response on a repeat. The WhatsApp webhook claims a
  `message_id` before doing any work, because Meta retries anything slow.
- **The audit trail is append-only.** Every stock or money mutation writes a
  `shop_audit_events` row with the request id.
- **Product images are optional and always will be.** Most shop owners never
  upload one. The board derives a stable tone and aspect ratio from the product
  name so a photo-less shelf still looks deliberate — don't replace that with a
  broken-image icon.
