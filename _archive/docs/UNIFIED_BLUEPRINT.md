# KuachaFlo × KraTte — Unified Product Blueprint

**Status:** vision locked, awaiting build go-ahead
**Audience:** a builder who has never seen this conversation. If you read only this file, you can build the whole thing in one pass.
**One-line truth:** one product that sees all your money move — personal and shop — and turns it into books you never had to keep.

---

## Table of contents

1. [The product truth (read this first)](#1-the-product-truth-read-this-first)
2. [Who it's for (everyday scenarios that must pass)](#2-who-its-for-everyday-scenarios-that-must-pass)
3. [Information architecture (the rooms)](#3-information-architecture-the-rooms)
4. [Data model (the DNA)](#4-data-model-the-dna)
5. [Backend architecture (one backend)](#5-backend-architecture-one-backend)
6. [Ingestion spec (the mouth — one pipeline)](#6-ingestion-spec-the-mouth--one-pipeline)
7. [Ledger & shop logic spec (spine + limbs)](#7-ledger--shop-logic-spec-spine--limbs)
8. [API contract (the full surface)](#8-api-contract-the-full-surface)
9. [Frontend spec (the skin)](#9-frontend-spec-the-skin)
10. [Design system (Apple touch, defined not vibed)](#10-design-system-apple-touch-defined-not-vibed)
11. [Billing spec (one plan)](#11-billing-spec-one-plan)
12. [WhatsApp spec (content-first, conversational)](#12-whatsapp-spec-content-first-conversational)
13. [Reports spec (the proof room)](#13-reports-spec-the-proof-room)
14. [Same-origin & PWA spec (kill the seam)](#14-same-origin--pwa-spec-kill-the-seam)
15. [Migration & compatibility (room-by-room demolition)](#15-migration--compatibility-room-by-room-demolition)
16. [Non-functionals (security, perf, reliability)](#16-non-functionals-security-perf-reliability)
17. [Phase-by-phase build plan](#17-phase-by-phase-build-plan)
18. [Acceptance checklist (definition of done)](#18-acceptance-checklist-definition-of-done)
19. [Open decisions for the founder](#19-open-decisions-for-the-founder)
20. [Appendix A — current-code map (where things live today)](#appendix-a--current-code-map-where-things-live-today)
21. [Appendix B — what to keep vs demolish](#appendix-b--what-to-keep-vs-demolish)

---

## 1. The product truth (read this first)

This is **one product**, not two products with a bridge. The Facebook test applies to every decision:

> Feed / Reels / Messages are not three logins and three bills. They are one identity with different rooms.

KuachaFlo (personal money: receipts, MoMo, reports) and KraTte (shop: inventory, sales, customers, suppliers, purchases, expenses, team) are **rooms in one building**. Consequences that are non-negotiable:

- **One identity.** One login (Supabase Auth, email + Google). No second password, no SSO redirect between apps. The current SSO bridge (`build_sso_url` → `/api/sso/kuachaflo`) is scaffolding to be demolished, not architecture to keep.
- **One plan.** Free / Pro / Business unlocks capability in the one product. There is no KraTte subscription. KuachaFlo billing is the source of truth today and remains the source of truth; the shop simply gates on it.
- **One money truth.** A photographed receipt, a forwarded MoMo alert, a shop sale, a supplier purchase, and a shop expense are **the same kind of object** (a ledger entry) with different tags — not five concepts in two databases.
- **One dashboard.** Home shows combined reality. Personal vs business is a lens (Everything / Personal / Shop), never a separate app to "open."
- **One capture motion.** Point the phone at money (receipt, MoMo message, tally sheet) via WhatsApp or in-app camera → it's handled. The user never declares "this is personal" or "this is business" up front; the content decides, and one tap fixes a wrong guess.

**If any design or backend decision makes it feel like two products again, that decision is wrong.** That is the whole test. Apply it ruthlessly.

---

## 2. Who it's for (everyday scenarios that must pass)

Every phase must be validated against these three people. If a phase breaks their loop, it is not done.

### Amara — solo consultant, Lusaka (personal-heavy)
- Snaps a fuel receipt → filed instantly, categorized, no questions.
- Forwards an airtime MoMo alert → self-evident, filed instantly.
- Forwards "sent K50 to 097XXXXXXX, Ref ABC" → bot asks **one** question in-thread ("What was the K50 for?"), she replies "lunch with client" → filed, and that number is remembered.
- End of month: one timeline, one PDF for tax season. She never thought about categories more than once per merchant.

### Joseph — shop owner, one phone number for everything (mixed)
- Morning: snaps supplier delivery note → business purchase, stock up.
- Midday: buys lunch, same phone, same WhatsApp → personal, filed separately. He declared nothing.
- All day: forwards customer MoMo payments → income, mostly auto-filed; thin ones get one question.
- Evening: photographs the handwritten day-sales tally → sale logged, stock decremented, income in the ledger.
- He never told the app which bucket to use. Any wrong guess is one tap to fix.
- Three months later: pulls a real income-and-expense statement for a microloan meeting. No receipts-only app, shop-only app, or bank statement could have produced it — only the thing that saw everything.

### Precious — applying for a microloan (proof-driven)
- Three months of forwarding things to WhatsApp with zero thought about bookkeeping.
- Opens Reports → pulls a loan-officer-acceptable income statement + category summary.
- The output is the product. Everything else is plumbing to make that document exist.

**Irreplaceability thesis:** not the OCR, not the WhatsApp trick — the fact that personal + business + MoMo + cash live in **one coherent ledger**, so the output (a true financial picture) is something no fragmented tool can generate.

---

## 3. Information architecture (the rooms)

One app. Five rooms. Bottom nav (thumb-reachable), always present:

| Room | Purpose | Today's equivalent |
|---|---|---|
| **Home** | Today: combined position, rhythm chart, needs-attention nudge, fast capture | KuachaFlo Overview (personal-only) + KraTte overview (shop-only) → merged |
| **Money** | The one timeline: every movement, filterable (Everything / Personal / Shop), searchable, one-tap fix | KuachaFlo Receipts + scattered KraTte sales/purchases/expenses → merged |
| **Shop** | Inventory, Sales, Customers, Suppliers, Purchases, Team. **Only visible if the user has a business.** Feels like walking into the next room, not opening another app | KraTte sections |
| **Reports** | The proof room: statements, month/category breakdowns, exports (PDF + CSV) | KuachaFlo Reports (personal-only) + KraTte reports → merged |
| **You** | Plan & billing, WhatsApp link, appearance, help, about, sign out | KuachaFlo account menu + billing page + KraTte settings → merged |

Rules:
- **Shop is a tab that appears when you create a business**, not a destination you navigate to via SSO. Creating a business = one action ("Start my shop") that provisions the `Business` row and reveals the tab. No redirect, no second login, no separate URL.
- **Personal vs business is a segmented lens** on Home and Money (`Everything | Personal | Shop`), defaulting to Everything. The default is the truth of the user's life.
- **Capture is global.** A persistent capture entry point (FAB / topbar button / mobile nav center) available from every room: take photo / choose file / (mobile) native camera. Same component everywhere.
- **Every auto-filed entry is one tap from fixed.** Category, context (personal ↔ business flip), party, amount. Undo wherever destructive. The product is confident but never arrogant with money.

---

## 4. Data model (the DNA)

This is the skeleton. Get this right and the dashboard redesign falls out naturally; get it wrong and everything built on top is reskinned duality.

### 4.1 Core principle

**Money movements are one table. Business resources are separate tables. Identity and plan are one.**

```
User (1) ────< LedgerEntry (money moves: receipts, MoMo, sales, purchases, expenses)
 │                │
 │                ├── context: personal | business  (derived from business_id)
 │                ├── direction: in | out
 │                └── source: app_photo | whatsapp_photo | whatsapp_momo_text |
 │                            whatsapp_momo_image | sales_sheet | shop_manual | ...
 │
 └──(0..1 or 1..n)── Business (the shop)
                       ├── Product (inventory)
                       ├── Order (sales + purchases) + OrderItem
                       ├── Customer, Supplier, TeamMember
                       └── LedgerEntry (business_id set → the shop's money)
```

### 4.2 Tables (authoritative shapes)

**`users`** (exists — keep, extend minimally)
- `id, supabase_uid (unique), email (unique), full_name, currency, plan (free|pro|business)`
- `whatsapp_number (unique, nullable)` — THE single link field. One number → one user. The KraTte-side `shop_users.whatsapp_number` dies in migration.
- `whatsapp_link_code, whatsapp_link_code_expires` — transient linking flow (keep pattern).
- Plan is enforced here and nowhere else.

**`businesses`** (exists as of Phase 1 — keep, grow)
- `id, owner_user_id → users.id, name (default "My Shop"), currency, created_at`
- Start with one business per user (simplest correct scope). Schema allows many later; do not build multi-shop UI in this pass.

**`ledger_entries`** (the spine — **new canonical table**; see migration §15 for the `receipts` → `ledger_entries` path)
- Identity: `id (uuid), user_id → users.id, business_id → businesses.id (nullable; null = personal)`
- Money: `direction (in|out), amount (numeric 12,2), currency (3-letter)`
- What/who/when: `party (text — merchant, person, or counterparty; replaces receipts.merchant), category_id → categories.id (nullable), occurred_on (date), note (text, nullable)`
- Provenance: `source (enum-ish text), image_path (nullable), thumbnail_path (nullable), raw_extraction (jsonb — full model output for audit/debug; replaces raw_ocr_text)`
- Confidence & review: `status (processed|needs_review), confidence (high|medium|low)`
- Shop linkage: `order_id → orders.id (nullable; set when this entry IS a sale/purchase's money side), line_items (jsonb, nullable — multi-item captures like sales sheets)`
- Memory linkage: `memory_id → memories.id (nullable; which learned rule filed this, for "why" explanations)`
- Soft delete: `is_deleted, created_at, updated_at`
- Indexes: `(user_id, occurred_on desc)`, `(business_id, occurred_on desc)`, `(user_id, is_deleted, occurred_on)`.

**`categories`** (exists — keep, unify lists)
- Today's KuachaFlo defaults (Fuel & Transport, Meals & Food, Supplies, Equipment, Accessories, Software & Subs, Other) and KraTte's inventory categories (Beverages, Pantry, Fresh & dairy, Snacks, Personal care, Household, Other) and expense categories (Rent, Utilities, Payroll, Marketing, Shipping, Supplies, Other) must converge into **one category taxonomy with type tags** (`personal`, `shop_inventory`, `shop_expense`, shared `Other`). The classifier is constrained to this list (enum pattern, already proven in `gemini_ocr.py`).

**`products`** (= inventory; port of KraTte `shop_records` resource=`inventory`)
- `id, business_id → businesses.id, sku (unique per business, case-insensitive), name, category, price, cost, stock (int ≥ 0), reorder_at, unit, supplier_id → suppliers.id (nullable), image (nullable), notes, pinned, version (optimistic locking), created_at, updated_at`
- Constraints to port from Drizzle schema: stock/cost/price numeric ranges, SKU uniqueness per business, `version > 0`.

**`orders`** (= sales + purchases in one table with `kind`)
- `id, business_id, kind (sale|purchase), reference (per-business sequence: #SW-N / #PO-N via order_sequences logic), party_name, party_id (→ customers.id or suppliers.id, nullable), status (sale: Completed|Pending|Cancelled; purchase: Ordered|Received|Cancelled), channel (Retail|Wholesale), payment (Paid|Unpaid), occurred_on, due_on (nullable), notes, amount_total (server-computed, never client-trusted), ledger_entry_id → ledger_entries.id (nullable; the money side), version, created_at, updated_at`
- Unique `(business_id, kind, reference)`.

**`order_items`**
- `id, order_id → orders.id (cascade), product_id → products.id (restrict — cannot delete a product with history), name_snapshot, quantity (1..100000), price_snapshot, cost_snapshot`

**`customers`, `suppliers`, `team_members`** (straight ports of KraTte resources)
- Customers: `business_id, name, company, email, phone, channel (Retail|Wholesale), balance_opening, address, notes`
- Suppliers: `business_id, name, contact_person, email, phone, category, status (Active|Inactive), address, notes`
- Team: `business_id, name, email, role, status (Active|Invited|Inactive), phone, notes` (directory only in this pass — no separate logins/roles engine; that is a later phase if ever)

**`memories`** (the nerves — new, small, high-leverage)
- `id, user_id, key (e.g. counterparty:<normalized> | merchant:<normalized>), category_id (nullable), context (personal|business, nullable), party_display (nullable), hits (int), updated_at`
- Written whenever a user corrects a category/context or answers a clarification question. Read by ingestion before calling the model ("this number was lunch with client last 4 times → file it, high confidence, no question"). Unique `(user_id, key)`.

**`payment_requests`** (exists — keep as-is; it is the MoMo billing flow)
**`reports`** (exists — extend: `scope (personal|business|combined)`, `business_id (nullable)`)
**`whatsapp_processed_messages`** (exists — keep exactly; dedup guard is load-bearing)
**`whatsapp_pending_clarifications`** (new, small)
- `id, user_id, chat_sender, draft_entry (jsonb — the extracted-but-uncertain ledger candidate), question (text), attempts (int, default 0), expires_at, created_at`
- Powers the "one question" loop: thin MoMo in → draft stored → question asked → reply fills the gap → entry committed. Expires in ~24h; expired drafts never become entries (no ghost money).

**To demolish after migration:** `shop_users, shop_sessions, shop_records, shop_mutation_requests (port pattern, not table), shop_rate_limits (port pattern), shop_order_sequences (port logic into orders service), shop_audit_events (port pattern as ledger/order audit)` — see §15.

### 4.3 What is deliberately NOT unified
- Products/customers/suppliers/staff are **not** ledger entries. They are things the business has/knows, not money moving. Forcing them into the ledger is how you get mush. The ledger records that stock moved and money moved; the resource tables record what remains.
- Reports are artifacts generated **from** the ledger, not ledger rows.

---

## 5. Backend architecture (one backend)

**Decision: FastAPI (Python) is the one backend.** It already owns identity (Supabase JWT verify), billing (MoMo claims + admin review), WhatsApp (webhook + dedup + linking), AI (Gemini pipelines), storage, and reports. KraTte's Next.js/Drizzle layer owns shop CRUD + stock/order invariants — portable logic, not exotic infrastructure. Port the logic; retire the layer.

Target module layout (under `backend/app/`; existing files noted):

```
backend/app/
  main.py               # wiring only (routers, CORS, mounts) — keep thin
  config.py             # settings (add: unified classifier model, clarification TTL)
  database.py           # engine/session/init (add: new tables, category reseed)
  deps.py               # get_current_user (keep), require_admin (keep)
  auth.py               # Supabase JWT verify (keep)
  models.py             # §4 tables (ledger_entries new; receipts → migrate then drop)
  schemas.py            # Pydantic I/O (grow per §8)
  storage.py            # Supabase Storage images + private report PDFs (keep)
  # --- ingestion (evolved from gemini_ocr.py + receipt_service.py) ---
  classify.py           # ONE classify+extract call (replaces 3 prompts; see §6)
  ingestion.py          # pipeline: bytes/text → classified draft → memory check →
                        #   commit or clarify (replaces receipt_service.py)
  memory.py             # memories read/write (learn from corrections/answers)
  whatsapp.py           # Meta API helpers: verify/download/send (keep, extend for replies w/ context)
  # --- shop domain (ported from KraTte store.ts/validation.ts) ---
  shop/
    __init__.py
    products.py         # CRUD + SKU uniqueness + version/stock guards
    orders.py           # sales/purchases: references, totals, stock movements (transactional)
    parties.py          # customers/suppliers/team CRUD
    sequences.py        # per-business #SW/#PO counters (port of nextOrderReference)
    idempotency.py      # Idempotency-Key store (port of mutationRequests pattern)
    audit.py            # audit events (port of appendAudit pattern)
  routers/
    ledger.py           # unified timeline + summary (exists — grow to full CRUD per §8)
    shop.py             # products/orders/parties endpoints (new; absorbs KraTte /api/records/*)
    ingest.py           # app-side capture upload (absorbs receipts.py upload; text/manual entry)
    whatsapp.py         # webhook + linking (exists — rewrite routing per §12)
    business.py         # business provisioning (exists — keep, extend w/ shop-onboarding)
    billing.py          # MoMo claims (keep)
    reports.py          # combined reports (grow per §13)
    admin.py            # users/plans/payment review (keep, extend counts to ledger)
    categories.py       # taxonomy (grow per §4.2)
    users.py            # /me (keep; DELETE /kratte/sso-url at cutover)
  pdf_report.py         # report renderer (grow: combined statements per §13)
  telegram.py           # admin ping (keep)
  # DELETE at cutover: kratte_client.py (no more service-to-service calls — it's one service)
```

Hard rules:
- **One service, one database, one auth.** No HTTP calls from the backend to itself or to a sibling. The `kratte_client.py` import path and KraTte `/api/internal/*` routes are demolished at cutover (§15).
- **Money math is server-side, transactional, and never client-trusted.** Order totals, stock movements, and ledger writes for a sale/purchase happen in **one DB transaction** (port of `mutateRecord` semantics: row locks, version checks, stock-never-negative, idempotency-key replay). Client-provided totals are ignored.
- **Every mutation that touches stock or money is idempotent** (Idempotency-Key header, fingerprint + replay of fresh snapshots — port the `mutationRequests` pattern, don't simplify it away; double-submits from flaky mobile networks are a daily occurrence in this market).
- **Every classification/extraction keeps its raw model output** in `raw_extraction` for audit and debugging. Silent AI behavior with no trail is a bug.

---

## 6. Ingestion spec (the mouth — one pipeline)

### 6.1 The core correction
Today: **three** Gemini pipelines (receipt photo, MoMo text, sales sheet) chosen by **which account the number is linked to** — before looking at the content. This is backwards and is the entire reason MoMo + sales capture feels "chunky and indecisive."

Target: **one** pipeline. Content decides what it is. Account identity decides **whose books** it lands in. Never the reverse.

### 6.2 Inputs (all land in the same funnel)
1. App camera/file upload (photo) — today `POST /api/v1/receipts` + `CameraUpload.tsx`.
2. WhatsApp photo (receipt, MoMo screenshot, tally sheet, supplier note) — today `_handle_message image branch`.
3. WhatsApp forwarded text (MoMo/bank SMS) — today `process_momo_text`.
4. Shop manual entry (typed sale/expense/purchase in-app) — skips AI, same ledger shape.
5. (Later, not this pass: voice note, document PDF.)

### 6.3 The one call: classify + extract
A single model call with a unified schema. Conceptually:

```
classify_and_extract(input: image_bytes | text, category_taxonomy) →
{
  kind: receipt | momo_transaction | sales_sheet | supplier_note | not_money,
  direction: in | out | null,          # money direction if determinable
  amount: number | null,
  currency: "ZMW" | ... ,
  party: string | null,                # merchant / counterparty / "Walk-in"
  occurred_on: "YYYY-MM-DD" | null,
  category: <enum from taxonomy> | null,
  context_hint: personal | business | null,   # model's guess, user-overridable, never forced
  reference: string | null,            # MoMo ref / receipt no if present
  line_items: [ {name, quantity, unit_price, category_guess} ] | null,  # sales sheets / itemized
  confidence: high | medium | low,
  needs_question: string | null        # the ONE question to ask if thin ("What was this for?")
}
```

Rules:
- `category` stays a schema `enum` over the real taxonomy (the existing anti-hallucination pattern — keep it).
- The model **may omit** anything genuinely undeterminable; it must **never invent** parties, amounts, or dates. Omit > guess, always.
- `context_hint` is advisory. Hard rules override it deterministically: sales sheets → business; shop-manual entries → business; everything else → model's hint, defaulting to personal when the user has no business, else decided by memory/model with user correction available.
- `not_money` (chat, jokes, questions, stickers-as-text) returns cleanly with no entry and a friendly reply. Not an error.

### 6.4 The pipeline (ingestion.py)
```
receive(input, user)
  1. dedup (WhatsApp: message_id claim FIRST, before any AI — keep existing guard)
  2. plan-limit check (ledger entries count, not receipts count — see §11)
  3. memory lookup (counterparty/merchant key → prior category/context; if strong match, pre-fill + boost confidence)
  4. ONE model call (classify.py) → draft
  5. if kind == not_money → friendly reply, no entry, done
  6. if draft complete (amount + party-or-kind-clear + confidence ≥ medium) → commit ledger entry
     (+ shop effects if sales_sheet: match/create products, decrement stock, create order — all in ONE transaction)
     → confirm briefly ("✅ Logged: ...")
  7. if thin (missing amount/category AND low confidence) → store draft in whatsapp_pending_clarifications,
     ask the ONE question in-thread, done (no entry yet — never file ghost money)
  8. clarification reply arrives → match to pending draft → merge answer (category/note/context) →
     commit entry → write memory → confirm
```

Clarification protocol (load-bearing for thin MoMo — this is the feature that makes thin data a non-issue):
- At most **2 questions** per draft (second only if the first answer is still unusable), then file as `needs_review` with what we have + note, and say so honestly.
- Questions are short, specific, and reference the money: "What was the K50 to 097XXX for?" — never "Please provide a category for this transaction."
- A reply of "cancel/ignore" kills the draft silently. Expiry (~24h) kills it silently. No nagging.
- Every answered clarification writes a `memories` row so the next identical forward files silently.

### 6.5 Shop effects from sales sheets (the Joseph-evening path)
Port of KraTte `whatsapp-import/route.ts` semantics, now in-process (no HTTP hop):
- Normalize product names; match existing products case-insensitively per business.
- Unknown product → create with `price = unit_price`, `cost = unit_price` (flagged "check cost price" in reply + needs_review marker on product), `stock = quantity` (exactly covers this sale; never fabricate extra stock), `category = category_guess or Other`.
- Create ONE `sale` order (status Completed, channel Retail, payment per hint or Cash, `occurred_on = today`) with all line items; stock decrement + ledger income entry in the **same transaction** as the order.
- Reply: items count, total, reference (#SW-N), and new-product names flagged for cost-price check.
- If the sender has no business yet → do not auto-create a shop from a photo. Reply: "This looks like a sales sheet — want to start your shop? Tap here." with a link. Auto-provisioning a business from an ambiguous image is how you get ghost shops.

---

## 7. Ledger & shop logic spec (spine + limbs)

### 7.1 Ledger rules
- Every money movement is exactly one `ledger_entries` row. Sales and purchases additionally have an `orders` row linked both ways (`orders.ledger_entry_id`, `ledger_entries.order_id`).
- `context` is derived (`business_id IS NULL → personal`), never stored. The API exposes it; the DB doesn't duplicate it.
- Personal entries: `business_id = null`. Shop entries: `business_id` set. Flipping context = setting/clearing `business_id` (+ category remap if the old category isn't valid in the new context — fall back to `Other`, mark `needs_review`, tell the user).
- Deletes are soft (`is_deleted`). Stock/order effects of deleting a sale/purchase: reverse the stock movement in the same transaction (port of `apply(old,-1)` semantics), keep the order row as Cancelled (history is sacred — never hard-delete money history).
- Edits to amount/party/category/note/context are allowed with audit trail; edits that would break stock (e.g. raising a sale's quantity beyond stock) are rejected with a human message, not a 500.

### 7.2 Shop rules (ported from KraTte `store.ts` — do not weaken)
- **Order references** are per-business sequences (`#SW-1001…`, `#PO-2001…`), allocated transactionally (port `nextOrderReference` + `orderSequences` semantics into `sequences.py`).
- **Totals are computed**: `orders.amount_total = Σ items`. Line prices snapshot from product at creation; preserved on edit (port the `previous?.price ?? product.price` semantics — editing quantity must not silently reprice history).
- **Stock moves only on terminal states**: sale Completed decrements; purchase Received increments. Pending/Ordered/Cancelled move nothing. Status transitions move deltas (port `apply(old,-1); apply(next,+1)` exactly).
- **Stock never goes negative.** Reject with "Not enough stock for X. N available." — a validation message, not a crash.
- **Optimistic locking**: `expectedVersion` on edit (409 `VERSION_CONFLICT` with "changed while editing, reload" semantics); `expectedStock` guard for quick stock edits (409 `STOCK_CHANGED`).
- **SKU uniqueness** per business (case-insensitive, trimmed). **Order reference uniqueness** per (business, kind).
- **Product deletion is blocked** when order history references it ("linked to order history… remove the linked orders first" — port message intent; offer "archive" as the humane alternative: `status`/archived flag hides it from pickers without destroying history).
- **Idempotency-Key** on all mutating shop + ledger endpoints (UUID v4; fingerprint mismatch → 409 `REQUEST_CONFLICT`; replay returns fresh snapshots, never stale ones).
- **Audit events** for record created/updated/deleted + inventory movements (port `appendAudit` fields: action, resource, recordId, requestId, metadata{fields, stock{from,to}, version}).

### 7.3 Validation (ported from KraTte `validation.ts` + `configs`)
- Same per-resource required fields, lengths (names 1–500, notes ≤2000), email regex, date `YYYY-MM-DD` real-date check, quantity 1–100000, ≤100 items per order, money ≥ 0 with caps.
- Product image: keep the allowlist semantics (`catalog:N`, `/images/inventory/*.webp`, or http(s) URL without credentials) until the unified upload path (§9) replaces pasted URLs — then accept uploaded-file references too.
- Error shape stays client-friendly: `{ error: "<human sentence>", code: "<MACHINE_CODE>" }` with 4xx statuses. No stack traces to clients, ever.

---

## 8. API contract (the full surface)

Base: same FastAPI origin as today. Auth: `Authorization: Bearer <supabase JWT>` → `get_current_user` (keep). Admin: `X-Admin-Key` (keep).

### Ledger (grow existing `routers/ledger.py`)
- `GET /api/v1/ledger?context=all|personal|business&from&to&q&category_id&min_confidence&needs_review&limit&cursor` → paginated unified timeline, newest first. Each item: `id, context, direction, party, amount, currency, occurred_on, category{id,name,slug,icon}, source, status, confidence, image/thumbnail, line_items?, order_ref?, business_id?, created_at`.
- `GET /api/v1/ledger/summary?from&to&context=` → `{ personal_in, personal_out, business_in, business_out, net, by_category[], by_month[], needs_review_count }` (powers Home cards + rhythm chart; replaces today's frontend-side aggregation over receipts).
- `POST /api/v1/ledger` (manual entry: party, amount, direction, context/business_id, occurred_on, category, note) → entry. Used by "add manually" + shop expense quick-add.
- `PATCH /api/v1/ledger/{id}` (party, amount, occurred_on, category_id, note, context flip) → entry. Writes memory on category/context change.
- `DELETE /api/v1/ledger/{id}` → 204 soft delete (+ stock reversal if linked order — order becomes Cancelled).

### Ingest (absorbs today's `routers/receipts.py`)
- `POST /api/v1/ingest/photo` (multipart image) → `{ entry }` or `{ draft_id, question }` (when clarification needed — app shows the question inline, same as WhatsApp).
- `POST /api/v1/ingest/text` (forwarded SMS body) → same shape (lets app users paste MoMo texts too).
- `POST /api/v1/ingest/clarify` ({draft_id, answer} | {cancel}) → entry or 204.
- `GET /api/v1/ingest/drafts` → pending clarifications (so the app can show "2 need your input" nudge).
- Compatibility: keep `GET/PATCH/DELETE /api/v1/receipts*` as thin aliases over ledger (personal context) until the new frontend ships; then remove. Do not build new features on them.

### Shop (new `routers/shop.py` — absorbs KraTte `/api/records/*`)
- Products: `GET /api/v1/shop/products?tab=all|in|low|out&q&limit&cursor`, `POST`, `PATCH /{id}`, `DELETE /{id}` (blocked w/ history → suggest archive), `POST /{id}/archive|unarchive`.
- Sales/purchases: `GET /api/v1/shop/sales|purchases?status&limit&cursor`, `POST` (items:[{product_id, quantity}], status, party, channel, payment, dates, notes), `PATCH /{id}`, `POST /{id}/cancel` (reverses stock, keeps history).
- Customers/suppliers/team: standard `GET/POST/PATCH/DELETE` collections.
- `GET /api/v1/shop/overview` → `{ low_stock[], out_of_stock_count, today_sales, week_sales, pending_orders, top_products[] }` (powers Shop home + low-stock alerts).
- All mutating routes accept `Idempotency-Key`. All list routes paginate (cursor; 413 `PAGINATION_REQUIRED` past snapshot cap — port KraTte semantics).

### Business, billing, reports, categories, users, admin
- `GET /api/v1/business` (provision-on-read — keep today's `_get_business` behavior), `PATCH` (name, currency).
- Billing: keep `POST /payment-request`, `GET /payment-requests` exactly; plan meaning changes per §11 (no endpoint change needed).
- Reports: `POST /api/v1/reports {scope: combined|personal|business, business_id?, from, to, format: pdf}` → PDF (per §13); `GET` history; `GET /{id}/download` (keep signed-URL/private-bucket pattern).
- Categories: `GET /api/v1/categories?type=` → unified taxonomy; admin-only create/update (classifier enum source).
- Users: `GET /api/v1/me` (keep; add `has_business, whatsapp_number, plan`); **delete** `POST /api/v1/kratte/sso-url` at cutover.
- Admin: keep users/plans/payment-review; counts become ledger counts (entries, not receipts); add `GET /admin/clarifications` (thin-input health) and `GET /admin/shop-stats` (businesses, orders, low-stock aggregates).

---

## 9. Frontend spec (the skin)

**Decision: one Next.js app (the KuachaFlo frontend, evolved).** KraTte's Next.js app is retired at cutover (§14/§15). Rationale: KuachaFlo's frontend already owns auth (Supabase), billing UI, PWA manifest, camera upload, and the warm-paper design language the founder chose. KraTte's UI contributes its shop components (resource views, record dialogs, overview, reports) as ported components, rebuilt against the design system (§10) — not pasted.

### 9.1 Structure (replace the 928-line `app/page.tsx` monolith)
```
frontend/
  app/
    layout.tsx            # auth gate + nav shell + theme + PWA (keep RegisterSW pattern)
    page.tsx              # Home room (thin: composes components/*)
    money/page.tsx        # Money room (timeline)
    shop/
      page.tsx            # Shop home (overview cards + low-stock + quick actions)
      inventory/page.tsx  # products board/table
      sales/page.tsx      # orders
      customers/page.tsx | suppliers/page.tsx | team/page.tsx
    reports/page.tsx      # proof room
    you/page.tsx          # plan/billing/whatsapp/appearance/help/about
    billing/page.tsx      # keep MoMo flow, reskinned to system (§11)
  components/
    Capture/              # global capture: CameraUpload evolved (photo/file/native camera) + manual + paste-text
    Timeline/             # unified ledger list: entry rows, context pills, inline fixers, swipe actions
    Shop/                 # ported KraTte: ProductCard, OrderDialog, PartyForms, StockBadges, LowStockAlert
    Reports/              # scope picker, statement preview, export buttons
    ui/                   # design-system primitives (§10): Button, Card, Sheet, Segmented, Input, EmptyState, ...
  lib/
    api.ts                # keep direct-call pattern (no Next proxy — the socket-hang-up lesson stands); add shop/ledger/ingest clients
    types.ts              # LedgerEntry, Product, Order, Business, Draft, Summary (mirror §8)
    money.ts              # ZMW-first formatting (K 1,234.50), multi-currency fallback
```

### 9.2 Room-by-room behavior
- **Home:** greeting + date; combined position cards (Spent, Earned, Shop profit — context-aware); 30-day rhythm chart (from `/summary`, not client aggregation); "Needs your input" nudge (drafts + needs_review count → Money filtered); fast-capture card; recent timeline (5). Context lens at top. No shop upsell spam: if no business, one quiet card ("Run a shop? Start it here →") — once dismissed, stays dismissed.
- **Money:** the timeline. Segmented lens (Everything|Personal|Shop) + search + filters (category, direction, needs-review). Rows show party, amount (signed/colored by direction), category icon, context pill, source glyph (📷 WhatsApp/camera/manual), confidence dot when low. Tap → detail sheet with inline editing (category picker, context flip, party/amount/date/note), image view, "why filed here" (memory/model reason), order link if shop-linked. Swipe: recategorize / delete (with undo).
- **Shop:** overview cards (today/week sales, low-stock count → tap filters inventory), quick actions (New sale, Add product, Record expense), then per-section lists ported from KraTte `resource-view`/`record-dialog` behavior: board+table inventory views, density toggle, quick stock edit with `expectedStock` conflict copy, order dialog with product picker (server-computed totals displayed, never editable), party forms, team directory. Product image: real upload (camera/file → storage → URL) everywhere; pasted-URL fallback retained.
- **Reports:** scope picker (Combined|Personal|Shop) + period (month presets + custom) → live summary (totals, by-category, by-month) → Download PDF / CSV. History list with re-download. Empty states that teach ("Forward 3 MoMo alerts to see your first statement").
- **You:** profile card; Plan card (usage meter: entries used/limit — see §11); WhatsApp link card (same 6-digit flow, reskinned); Appearance (theme presets — keep localStorage pattern); Help; About; Sign out. Shop settings (name, currency, low-stock alerts toggle, order notifications) live here under a Shop section when a business exists (absorbs KraTte `settings.tsx`).

### 9.3 Cross-cutting UX rules
- **Global capture** reachable in ≤1 tap from anywhere. After capture: optimistic row ("Reading…") → settles into place with motion; if a question is needed, it arrives as an inline card + (WhatsApp) message, same copy both places.
- **Empty states are onboarding.** Every empty room explains the one action that fills it, with a button that does it. No dead "No data" screens.
- **Every destructive action undoes.** Deletes, cancels, context flips — snackbar with Undo (5s), server soft-delete makes this honest.
- **Offline honesty.** Reads work from cache where feasible; writes queue visibly ("2 waiting to send") and replay with Idempotency-Key. Never silently drop a money write. Never fake success.
- **ZMW-first.** Default currency K, `en-ZM` formatting, Airtel/MTN vocabulary in billing and WhatsApp copy. USD contexts (legacy KraTte defaults like America/New_York timezone) are migrated to Africa/Lusaka / ZMW.

---

## 10. Design system (Apple touch, defined not vibed)

No more theme-override patches. Tokens defined once in `frontend/app/globals.css` (CSS variables) + Tailwind mapped to them; every component built against tokens; KraTte's `kuachaflo-theme.css` override file is deleted at cutover (its job — proving the palette — is done).

### Tokens
- **Color roles** (not hexes scattered in components): `--bg (warm paper), --surface, --surface-2, --ink (near-black warm), --muted, --line, --accent (lime), --accent-ink, --danger, --warn, --ok, --info`. Dark theme (`theme-night`) remaps roles, never component code. Keep the 4-preset switcher (Studio/Paper/Slate/Night) — it is loved; just rebase it on roles.
- **Type scale:** display (32/800/-0.04em) → h1 (26) → h2 (17) → body (13.5/1.6) → small (11.5 muted) → kicker (11/700/uppercase/0.04em). One family stack (system-first for the Apple feel + load speed; no webfont dependency for core UI).
- **Spacing scale:** 4/8/12/16/20/24/32/48. Cards pad 20. Screen gutter 20 desktop / 16 mobile.
- **Radii:** 10 inputs, 14 cards, 18 sheets, 999 pills. One value per job, everywhere.
- **Elevation + glass:** level 0 flat, 1 card (`0 1px 2px rgb(0 0 0/.05)`), 2 sheet (`0 12px 40px rgb(0 0 0/.14)` + `backdrop-blur(20px) saturate(1.4)` + `bg: color-mix(surface 78%, transparent)`). Glass only on topbars/sheets/FAB — restraint, not glitter. Fallback: solid surface when `backdrop-filter` unsupported.
- **Motion:** `--spring: cubic-bezier(.34,1.56,.64,1)` for press/confirm (120–180ms); `--ease-out` for sheets (240ms slide+fade); chart/list settle 200ms stagger ≤5 items. `prefers-reduced-motion` disables all non-essential motion. Buttons scale `.97` on active. No spinners without progress >1s (skeleton rows instead).

### Components (build once in `components/ui`, use everywhere)
Button (primary/secondary/lime/danger/ghost + loading), Card (+stat variant), Sheet (modal/drawer w/ focus trap + ESC + overlay-tap-close), Segmented (context lens, tabs), TextField/Select/Date/Money inputs (one error style), EmptyState (icon+line+action), TimelineRow, ContextPill, CategoryPicker, CaptureButton, Snackbar (undo), Meter (plan usage), Badge (stock/status), Avatar. Each with loading/disabled/empty/error states designed, not discovered.

### The feeling checklist (review every screen against this)
1. Understandable in 3 seconds at 9pm with tired eyes? 2. One primary action visible without scrolling? 3. Every number has a currency and a time frame? 4. Every AI output is one tap from corrected? 5. Does it feel like the same room as the last screen (light, air, type)?

---

## 11. Billing spec (one plan)

Keep the mechanism (it fits Zambia); fix the meaning (it must sell the one product).

- **Plans:** Free (100 ledger entries — not "receipts"; every money movement counts the same), Pro K150/mo (1,000 entries), Business K450/mo (unlimited + shop rooms unlocked… see gating note). Prices/numbers stay editable in one place (frontend constants + `config.plan_limits`).
- **Gating note (founder to confirm — see §19):** is Shop a Business-only feature, or does everyone get one shop with entry limits as the only gate? Recommendation: **everyone can start one shop; the entry limit is the gate.** Rationale: Joseph-the-shop-owner often starts poor; locking Shop behind K450/mo prices out the exact user the loan-story needs. Business plan then means unlimited + priority + advanced reports. Simpler story: "one plan covers your whole money life."
- **Enforcement:** `ingestion.py` + shop mutations count `ledger_entries` (non-deleted) per user vs `plan_limits[user.plan]`. At cap: 402 with upgrade copy in-app; WhatsApp reply with upgrade nudge (keep today's reply pattern, retarget copy to "entries").
- **MoMo claim flow:** unchanged endpoints; reskin page to §10; plan cards rewritten to describe the unified product ("1,000 money entries, personal + shop", "Shop rooms", "Loan-ready statements") instead of "receipts."
- **Admin:** keep list/review/Telegram ping; user row shows ledger-entry count + has_business + plan. Confirming a Business claim on a user with no shop changes nothing about shop access under the recommended gating (limits only) — note in admin UI copy so the operator isn't confused.
- **No second billing surface.** KraTte pricing UI is already deleted (per prior session); ensure no plan/trial purchase UI re-enters via ported components (`trialEnds`, fake tiers in `StoreSettings` — drop during port).

---

## 12. WhatsApp spec (content-first, conversational)

Rewrite of `routers/whatsapp.py` routing (the single most behavioral change in the project).

### Linking (keep mechanism, collapse duality)
- One code flow: app → code → send to the WhatsApp number → `whatsapp_number` set on `users`. Delete the KraTte-side lookup/link branches (`_find_kratte_account`, `_try_link_kratte`, `shop_users` raw SQL) at cutover. One number → one user → one ledger. Users currently linked on the KraTte side are migrated (§15) by matching verified email, then asked to relink only if unmatched.

### Message handling (content-first)
```
on_message(sender, message):
  user = users.where(whatsapp_number == sender)
  if none:
    if text is 6-digit code → try link (one path) → welcome explaining ALL THREE captures
       ("Send a receipt photo, forward a MoMo alert, or snap your sales sheet — I'll sort it.")
    else → link instructions (one copy, mentions both personal + shop — no "KuachaFlo vs KraTte" language)
    return
  draft_or_none = route by CONTENT (image → classify.py on bytes; text → 6-digit? link-confirm... no—already linked, so: MoMo? → classify.py on text; else → clarification-answer? → conversational fallback)
  → ingestion.py pipeline (§6.4) → reply (confirm | question | friendly fallback)
```

- **No more "KraTte numbers get sales sheets, KuachaFlo numbers get receipts."** A sales sheet from anyone classifies as a sales sheet. A receipt from a shop owner files personal unless context says otherwise. The model + memory decide; the account only decides whose books.
- **Clarification answers** are matched to `whatsapp_pending_clarifications` by (user, recency, non-expired) — the reply to a question is the temporally-nearest open draft. "cancel" kills it. Anything unparseable after 2 attempts → file `needs_review` + say so.
- **Reply copy rules:** confirm in one line + total ("✅ Lunch — K50 (Meals). In your Money timeline."); questions in one line referencing the money; errors honest + actionable ("Couldn't download that image — send it again as a photo, not a document."); never expose model internals, limits internals, or stack traces.
- **Rate/abuse:** keep per-sender soft throttle (port KraTte `consumeRateLimit` spirit: e.g. 60 msgs/min); dedup-first ordering stays (claim message_id before AI).

---

## 13. Reports spec (the proof room)

The output is the product. Reports must cover the unified truth or the whole project fails its thesis.

- **Scope:** every report takes `scope=combined|personal|business(+business_id)` + period. Default: combined, current month. Combined is the hero — the thing nothing else can produce.
- **Contents (PDF):** header (user, business name if in scope, period, generated-at); summary block (income, spend, net per context + combined); category table (amount + share); month table (for multi-month); entry detail (date, party, category, amount, context tag — paginated, capped with "…and N more in-app" beyond ~200 rows); footer (method note: "Includes photographed receipts, MoMo records, and shop sales." + page numbers).
- **Renderer:** grow `pdf_report.py` (fpdf2, pure Python — keep; no new deps). Fonts: embed one Unicode-capable TTF (current renderer limitation with `é`/emojis must be fixed — chart of "Meals & Food 🍔" must not render as tofu; strip-or-replace emoji deterministically in PDF, keep icons in-app).
- **CSV:** same scope/period; columns `date, party, direction, amount, currency, category, context, source, reference, note`. One timeline, honestly exported.
- **History:** keep `reports` rows + private-bucket signed downloads + list/re-download. Add scope/business columns.
- **Insights (later slice, not cutover):** top merchants/parties, run-rate ("spending 12% above last month"), shop margin (sales−COGS from cost snapshots), low-stock cost exposure. The data model supports all of it; the UI ships after core rooms stabilize.

---

## 14. Same-origin & PWA spec (kill the seam)

The PWA-address-bar symptom and the SSO-redirect seam share one root cause: two origins. Target: **one origin, one app**.

- **One deployment serves the frontend; the API lives under it.** Concretely: `app.com/*` → Next.js; `app.com/api/*` → FastAPI (reverse proxy at the host: Render rewrite / Caddy / nginx — host's mechanism, documented in deploy notes). Frontend `NEXT_PUBLIC_API_URL` becomes same-origin (`""` + `/api/...` paths) in production; keep env override for local dev (direct `localhost:8000` — the socket-hang-up lesson: dev proxy rewrites caused it; production same-origin proxying at the edge does not share that failure mode, but verify with slow-upload soak test).
- **KraTte origin retired.** `kratte.onrender.com` 301s to the one origin (path-mapped where sensible: `/` → `/shop`, `/api/*` → gone-410 with sunset note after migration window). `KRATTE_*` env, `kratte_client.py`, `/api/sso/kuachaflo`, `/api/internal/*` all deleted at cutover. Nothing in the final product knows KraTte was ever a separate deployment.
- **PWA:** single manifest + SW (keep `RegisterSW`, icon set, installability). Verify: installed PWA navigates Home→Shop→Reports with **no address-bar appearance, no origin hop, no re-login**. Shop routes work offline-shell (app shell cached; data honest about stale/queued per §9.3).
- **Cutover safety:** ship same-origin behind the new frontend first (API path-compatible — old app keeps working via old base URL during window), then flip DNS/proxy, then delete bridges. Never delete the bridge before the merged app is live on the one origin.

---

## 15. Migration & compatibility (room-by-room demolition)

Live data exists (real users, real receipts, real shops). Demolition is room-by-room with the house occupied. Order matters.

1. **Taxonomy converge (pre-migration):** finalize unified category list; map every KraTte inventory/expense category + KuachaFlo category to it; write the map as a data migration (idempotent script, reviewed row counts before/after).
2. **`ledger_entries` creation + backfill:** create table; copy every `receipts` row → `ledger_entries` (personal: `business_id=null, direction=out|in-from-momo-direction, party=merchant, occurred_on=purchase_date, source mapped, raw_ocr_text→raw_extraction`). Verify counts + spot-check amounts/parties. Keep `receipts` table + old endpoints as read aliases during window.
3. **Shop port (per-resource, in this order):** products → orders(+items, +ledger money-side backfill for historical sales/purchases!) → customers → suppliers → team → expenses-as-ledger (KraTte expenses become business `ledger_entries direction=out`, no order row). Each: migrate rows, verify counts/totals (shop revenue before/after must match to the tambala), flip reads, then writes.
4. **Historical money-side backfill is load-bearing:** every historical KraTte Completed sale / Received purchase MUST gain its `ledger_entries` row in migration, or Joseph's first combined report will be missing his shop's past. Script it, reconcile totals per business, and block cutover on mismatch.
5. **Identity merge:** for each `shop_users` row: match `users` by verified email (case-insensitive trim). Match → attach shop data to that user's new `businesses` row (name from `storeName`), link WhatsApp number (KuachaFlo link wins conflicts; notify + ask relink otherwise), copy settings (currency/timezone/alerts → business + user prefs). No match → create user? **No** — stage as `pending_shop_claims` (email, shop data ref) and email/WhatsApp the owner to sign in and claim ("Your shop is waiting — sign in with this email to connect it."). Never fabricate user accounts.
6. **WhatsApp relink for orphans:** numbers linked only on the KraTte side with no email match get one message: "KuachaFlo and your shop are now one app — open the app, get a code, send it here to relink." Old link codes invalidated.
7. **Frontend cutover:** new rooms read new endpoints; old pages/bridge code deleted; SSO route returns 410-gone page ("You're already home — this door is closed.") for bookmarked flows during window, then removed.
8. **DNS/proxy flip (§14)** → verify PWA + uploads + webhook → **demolish:** `receipts` table (after 30-day shadow), `shop_*` tables (after 30-day shadow), `kratte/` directory, `kratte_client.py`, SSO + internal routes, `KRATTE_*` env, theme-override CSS.
9. **Shadow period:** 30 days where demolished tables exist but are unwritten; a nightly job diffs "old read vs new read" for sampled users and alerts on divergence. Then drop.

Rollback per step: each migration step ships with its reverse (down migration + endpoint toggle) tested on staging before production. No step without a reverse.

---

## 16. Non-functionals (security, perf, reliability)

- **Auth:** Supabase JWT verify via JWKS stays (never service_role in app paths). Admin stays shared-secret-gated, fail-closed. Shop has no separate auth (team = directory, not logins, this pass).
- **Secrets:** Gemini key, Supabase service_role (storage only, server-side), admin key, WhatsApp app secret, Telegram token — env only, never `NEXT_PUBLIC_*`, never logged, never in errors.
- **Uploads:** 10MB cap (keep), Pillow-decode-or-400 (keep), HEIC support (keep), JPEG normalize + 400px thumb (keep), Supabase Storage durable path (keep) with local-disk dev fallback (keep). Product images join the same pipeline (new).
- **AI:** single-model dependency stays Gemini flash (env-overridable model name — keep; Google renames these); timeout 30s (keep); unreachable → `needs_review`/friendly-degraded, never 500-to-user, always logged with raw payloads server-side.
- **Webhooks:** Meta signature verify required (keep); 200 fast + dedup-first (keep); slow-AI retries must not double-file (keep `whatsapp_processed_messages` claim-before-work + idempotent shop mutations).
- **Perf budgets:** API p95 < 400ms excluding AI calls; AI capture end-to-end < 20s p95 (upload→filed, incl. Gemini); Home interactive < 2s on mid-range Android / 3G; timeline scroll 60fps (virtualize past 100 rows).
- **Data integrity:** money/stock mutations transactional (keep ported semantics); nightly reconcile job in shadow period; weekly full-ledger checksum per user (sum hash) to detect drift; backups before each migration step.
- **Privacy:** report PDFs private-bucket + signed URLs (keep); images in `receipts` bucket stay non-listable (per-user prefixes + app-level checks — document the threat model: URLs are capability-ish; acceptable for v1, revisit with signed image URLs post-cutover); raw extractions visible only to owner + admin-debug.
- **Observability:** structured logs per request (requestId from KraTte `withApi` pattern — port it); audit events for money/stock (port); admin dashboard gains ingestion health (classify latency, thin-rate, clarification answer rate) + shop health.

---

## 17. Phase-by-phase build plan

Each phase: goal → steps → done-when. **Do not start phase N+1 until phase N's done-when holds on production.** Sizes assume one focused builder: S ≈ 1–3 days, M ≈ 3–7 days, L ≈ 1–2 weeks.

### Phase 0 — Lock the contracts (S, no production code)
1. Founder reviews this blueprint; resolves §19 decisions.
2. Freeze: unified category taxonomy, ledger field list, API endpoint list (§8), plan/gating rule (§11).
3. Write API contract tests (httpx-level, against FastAPI test client) for §8 endpoints as **failing tests first** — they become the build's finish line.
4. Done-when: §19 answered in writing; contract tests committed and red.

### Phase 1 — Ledger foundation (M)
1. Create `ledger_entries`, `memories`, `whatsapp_pending_clarifications` tables; extend `reports` (scope/business_id).
2. Reseed/unify categories per taxonomy map (idempotent script + row-count verification).
3. Backfill `receipts` → `ledger_entries` on staging; reconcile (counts, sums per user, spot-checks); run on production.
4. Grow `routers/ledger.py` to full CRUD + summary (§8); `POST /ledger` manual entry; `PATCH` with memory-write + context-flip; `DELETE` soft.
5. Point nothing user-facing at it yet except a feature-flagged Money-timeline prototype for the founder. Old receipts endpoints untouched.
6. Done-when: all production receipts exist identically in `ledger_entries` (Joseph's history intact); ledger CRUD + summary green incl. contract tests; Amara's personal timeline renders from ledger on staging.

### Phase 2 — One ingestion (M–L, the heart transplant)
1. Build `classify.py` (unified schema §6.3) with golden tests: 30+ real-world fixtures (receipt photos, MoMo texts incl. Airtel/MTN/Zamtel phrasings, tally photos, supplier notes, chit-chat) — assert kind/amount/party/category/confidence, and **assert never-invents** on adversarial fixtures.
2. Build `memory.py` + `ingestion.py` pipeline (§6.4) incl. plan-limit counting on ledger entries.
3. Build `routers/ingest.py` (photo/text/clarify/drafts) for app-side capture.
4. Rewrite WhatsApp routing content-first (§12); keep linking flow; add clarification loop + `pending_clarifications` expiry worker.
5. Migrate app `CameraUpload` to `/ingest/photo` with draft-question inline UI.
6. Done-when: Amara's three forwards (receipt/airtime/thin-MoMo) all file correctly on staging with ≤1 question on the thin one; golden suite green; old `receipt_service`/`gemini_ocr` 3-prompt paths deleted; WhatsApp contains zero `shop_users` references.

### Phase 3 — Shop port (L, the limbs — in this order, each shippable)
1. `shop/products.py` + endpoints + migration `shop_records(inventory)` → `products` (per-user→per-business mapping via identity-merge staging table; SKU-uniqueness conflicts resolved by suffix + `needs_review` flag, reported to owner).
2. `shop/orders.py` + `sequences.py` + `idempotency.py` + `audit.py` (port `mutateRecord` semantics incl. stock deltas, snapshots, locks, replays) + endpoints; migrate sales/purchases + items; **backfill historical money-side ledger rows**; reconcile revenue/COGS per business to the tambala.
3. `shop/parties.py` + endpoints; migrate customers/suppliers/team.
4. KraTte expenses → business ledger entries (`direction=out`, category-mapped, `source=shop_import`, note preserved).
5. Done-when (per resource): counts match, money reconciles, contract tests green, old KraTte reads/writes for that resource flipped to new endpoints behind flag with zero user-visible change; Joseph's evening tally files end-to-end (photo → products matched/created → order #SW-N → stock dropped → income in ledger → WhatsApp confirm) on staging.

### Phase 4 — Same-origin merge (S–M)
1. Stand up edge proxy: `/api/*` → FastAPI, rest → Next.js; frontend API base same-origin in production; soak-test slow uploads (the old socket-hang-up lesson) + webhook deliveries through the proxy.
2. Retire KraTte origin: 301s, 410 sunset for internal/SSO paths, delete `kratte_client.py`, SSO + internal routes, `KRATTE_*` env.
3. Single PWA verification: install → navigate all rooms → capture → no address bar, no re-login, no origin hop.
4. Done-when: one origin serves everything; KraTte deployment decommissioned; PWA install test passes on Android + iOS; old bookmarks redirect sensibly.

### Phase 5 — Frontend rebuild (L, the skin)
1. Tokens + `components/ui` primitives (§10) with all states (loading/empty/error/disabled) + reduced-motion + theme presets rebased on roles.
2. Rooms in order: Money (timeline + fixers) → Home (summary-powered) → You (incl. billing reskin) → Shop (ported components rebuilt on primitives) → Reports (scope picker + live summary + exports).
3. Global capture + offline queue + undo snackbars + empty-state onboarding copy.
4. Delete: 928-line monolith page, theme-override CSS, KraTte frontend (`kratte/` dir) after parity checklist passes.
5. Done-when: §10 feeling checklist passes on all five rooms (founder review on a real mid-range Android); Amara/Joseph/Precious loops completable start-to-finish in-app; Lighthouse PWA + perf budgets (§16) met.

### Phase 6 — Billing unification (S)
1. Rewrite plan copy/limits to ledger entries + recommended gating (§11); enforcement counts ledger entries everywhere (ingest + shop).
2. Admin dashboard: ledger counts, has-business, ingestion/shop health panels.
3. Done-when: free user hitting 100 entries gets the same honest 402/nudge whether the 100th entry is a receipt, a MoMo, or a sale; MoMo claim→confirm activates the one plan; no purchasable thing besides the one plan exists anywhere in UI or API.

### Phase 7 — Reports worthy of the thesis (M)
1. Combined/personal/business scopes + period engine; category/month/entry sections; Unicode-safe PDF renderer (no tofu); CSV parity; history with scope labels.
2. Loan-packet preset: one tap → combined 3-month statement + category summary (Precious's meeting, in 30 seconds).
3. Done-when: Precious's 3-month packet generates from mixed personal+shop+MoMo data and reads correctly to a non-technical reviewer (founder + one real loan-officer-adjacent human if possible).

### Phase 8 — Harden, shadow, demolish (M)
1. Shadow diffs (old-vs-new reads) nightly; reconcile job; checksum job; fix divergences.
2. Rollback drills: each migration's reverse tested on staging.
3. 30-day shadow → drop `receipts`, `shop_*`; remove aliases/flags/sunset routes; final secrets/env audit; docs + runbook (deploy, proxy, webhook setup, admin ops, incident playbook for double-files/misclassifications).
4. Done-when: §18 checklist fully green; repo contains one backend, one frontend, zero `kratte` references outside git history; founder demo: Joseph's full day (delivery note → lunch → MoMo forwards → tally → combined report) live, start to finish.

---

## 18. Acceptance checklist (definition of done)

- [ ] One login, one origin, one plan — no SSO redirect, no second bill, no second URL anywhere.
- [ ] Amara, Joseph, and Precious loops (§2) pass end-to-end on production.
- [ ] Every money input (receipt, MoMo text/image, tally, manual, shop order) lands in one timeline with correct context/direction/category or an honest question/review state.
- [ ] Stock invariants hold under concurrency + retry (no negative stock, no double-decrement, idempotent replays return fresh data).
- [ ] Historical data intact: every old receipt and every old sale/purchase visible in the unified timeline with money reconciled.
- [ ] Combined report generates (PDF + CSV) and is credible to a non-technical reviewer.
- [ ] PWA installs; all rooms work without origin hops; offline writes queue and replay without loss or duplication.
- [ ] Plan limits enforced uniformly; billing sells exactly one plan via MoMo claims.
- [ ] Perf budgets (§16) met; no 500s on AI/WhatsApp degradation paths (graceful always).
- [ ] Shadow dropped; dead code/tables/env deleted; runbook written; founder sign-off.

---

## 19. Open decisions for the founder

1. **Shop gating:** everyone gets one shop with entry limits as the only gate (recommended, §11) — or Shop locked behind Business K450/mo? This changes onboarding copy + enforcement + admin UI. Decide before Phase 1.
2. **Multi-shop:** one business per user for v1 (recommended) — or do you need two shops day one? Schema allows many; UI builds one.
3. **Team logins:** directory-only for v1 (recommended) — or must a shop assistant log in separately this pass? (True multi-user roles is a whole phase by itself; do not smuggle it in.)
4. **Prices:** keep K150 / K450? Entry limits 100 / 1,000 / ∞?
5. **Languages:** English-only v1 (recommended) — or Nyanja/Bemba reply templates for WhatsApp at launch? (Cheap to add later via copy table; expensive to retrofit tone.)
6. **Brand:** the merged product is called…? (KuachaFlo everywhere recommended; KraTte becomes the Shop room's internal name at most. Decide before Phase 5 copy lock.)

---

## 20. Appendix A — current-code map (where things live today)

**KuachaFlo backend (`backend/app/`):** `main.py` wiring · `config.py` settings+plan_limits · `database.py` engine+category seed · `deps.py` auth/admin guards · `auth.py` JWKS verify · `models.py` User/Category/Receipt(+direction/business_id/line_items)/Business/WhatsAppProcessedMessage/PaymentRequest/Report · `schemas.py` I/O · `storage.py` Supabase Storage images + private PDFs · `gemini_ocr.py` 3 prompts (receipt/momo/sales-sheet) · `receipt_service.py` photo+text pipelines · `whatsapp.py` Meta helpers · `kratte_client.py` SSO+import (to delete) · `pdf_report.py` personal-only PDF · `telegram.py` admin ping · `routers/receipts.py` upload+CRUD · `routers/ledger.py` timeline+summary (v1) · `routers/business.py` provision+manual expense · `routers/whatsapp.py` webhook+linking (dual-account branching) · `routers/billing.py` MoMo claims · `routers/reports.py` personal PDF+CSV · `routers/admin.py` users/plans/review · `routers/categories.py` · `routers/users.py` /me + SSO-url.

**KuachaFlo frontend (`frontend/`):** `app/page.tsx` 928-line monolith (Overview/Receipts/Reports/Insights + capture + settings + account + WhatsApp + help/about overlays) · `app/billing/page.tsx` MoMo plans+claim+history · `components/CameraUpload|ReceiptList|AuthGate|CategoryIcon|RegisterSW` · `lib/api.ts` direct-call client · `lib/types.ts` · PWA manifest+icons+sw.

**KraTte (`kratte/`):** `src/db/schema.ts` shop_users/sessions/records/mutation_requests/rate_limits/order_sequences/audit_events · `src/lib/store.ts` mutateRecord (stock/order/idempotency/audit — THE port target) · `src/lib/validation.ts` + `types.ts` configs (THE validation port target) · `src/lib/{auth,workspace,seed,analytics,money,…}` · `src/app/api/records/[resource]/…` CRUD · `src/app/api/internal/whatsapp-import/route.ts` sales-sheet import · `src/app/api/sso/kuachaflo/route.ts` SSO verify+provision+plan-sync · `src/components/shop-app|resource-view|record-dialog|overview*|reports|settings|…` (UI port sources) · `src/app/[section]/page.tsx` sections · `kuachaflo-theme.css` override (to delete) · `drizzle/` migrations.

---

## 21. Appendix B — what to keep vs demolish

**Keep (proven, load-bearing):** Supabase Auth + JWKS verify · MoMo-claim billing + admin review + Telegram ping · WhatsApp webhook verify + dedup-first + 6-digit linking pattern · Gemini structured-output enum pattern · Supabase Storage images + private report PDFs + signed URLs · 10MB/Pillow/HEIC upload handling · KraTte `mutateRecord` semantics (locks, deltas, snapshots, sequences, idempotency, audit) — port, don't rewrite from memory · KraTte validation rules + configs — port · direct-frontend-to-API call pattern · PWA manifest/SW/icons · theme-preset switcher pattern · ZMW/Airtel/MTN billing copy.

**Demolish (scaffolding/duality, in §15 order):** `receipts` table (after backfill+shadow) · all `shop_*` tables (after port+shadow) · `kratte/` directory · `kratte_client.py` · SSO + internal routes · `KRATTE_*` env · 3-prompt Gemini split + account-first WhatsApp branching · 928-line frontend monolith · `kuachaflo-theme.css` override · fake pricing/trial concepts anywhere they linger · second billing surface (already deleted — keep it deleted).

---

*End of blueprint. Builder: if anything here is ambiguous, stop and ask the founder — do not guess. Founder: §19 is your homework. Everything else is the builder's.*
