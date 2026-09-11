# Build log — unified KuachaFlo × KraTte

Builder's running record. Each phase: what was decided, what shipped, what verified it.

## Phase 0 — Lock the contracts (IN PROGRESS)

**Founder decisions (§19 of blueprint) — proceeded on recommended defaults:**
1. Shop gating: everyone gets one shop; entry limits are the only gate. (Founder can override before Phase 6.)
2. Multi-shop: one business per user for v1. Schema allows many later.
3. Team: directory-only for v1, no separate logins.
4. Prices/limits: K150 / K450; 100 / 1,000 / ∞ ledger entries.
5. Language: English-only v1.
6. Brand: KuachaFlo everywhere; KraTte survives only as git history.

**Frozen taxonomy (v1)** — slug → name, icon, kinds (`personal` | `shop` | `expense`):
| slug | name | icon | kinds |
|---|---|---|---|
| meals | Meals & Food | 🍔 | personal, expense |
| fuel-transport | Fuel & Transport | ⛽ | personal, expense |
| supplies | Supplies | 📦 | personal, expense |
| equipment | Equipment | 🛠️ | personal, expense |
| utilities | Utilities | 💡 | personal, expense |
| rent | Rent | 🏠 | personal, expense |
| payroll | Payroll | 🧾 | expense |
| marketing | Marketing | 📣 | expense |
| shipping | Shipping | 🚚 | expense |
| software | Software & Subs | 💻 | personal, expense |
| accessories | Accessories | 🎒 | personal |
| beverages | Beverages | 🥤 | shop |
| pantry | Pantry | 🫙 | shop |
| fresh-dairy | Fresh & Dairy | 🥛 | shop |
| snacks | Snacks | 🍿 | shop |
| personal-care | Personal Care | 🧴 | shop |
| household | Household | 🧹 | shop |
| other | Other | 📎 | personal, shop, expense |

Migration map for existing rows: `accessories` → [personal]; `other` → all three; all other existing → [personal, expense]. New slugs seeded. Classifier enums filter by kind.

**Contract tests (the finish line):** `backend/tests/test_contract_*.py`
- `test_contract_ledger.py` — Phase 1 scope. Red → green in Phase 1.
- `test_contract_taxonomy.py` — Phase 1 scope. Red → green in Phase 1.
- `test_contract_ingest.py` — Phase 2 scope. Red until Phase 2.
- `test_contract_shop.py` — Phase 3 scope. Red until Phase 3.

## Phase 1 — Ledger foundation (DONE)

**Shipped:**
- `ledger_entries` table (the spine): amount/party/occurred_on/note/source/raw_extraction/
  status/confidence/order_id/line_items/memory_id + soft delete. Context derived from
  `business_id`, never stored.
- `memories` table (the nerves) + `app/memory.py` (merchant:/counterparty: keys, remember/lookup).
- `whatsapp_pending_clarifications` table (drafts for the Phase 2 question loop).
- `categories.kinds` + `seed_categories()` (frozen 18-slug taxonomy, idempotent, heals legacy rows).
- `_ensure_columns()` in `init_db` — new columns land on existing Postgres/SQLite without alembic.
- `reports.scope` + `reports.business_id` (combined/personal/business; hero = combined).
- Full ledger API: `GET /ledger` (envelope, keyset cursor, context/from/to/q/category/needs_review
  filters) · `GET /ledger/summary` (in/out/net, by_category, by_month, review count) ·
  `POST` (manual entry, 201) · `PATCH` (fields + context flip with category remap to Other +
  needs_review + memory write) · `DELETE` (soft, 204).
- `business.py` expenses migrated to ledger-backed (same response shape; timeline shows them).
- `categories?type=` filter.
- `app/ledger_backfill.py` + `scripts/backfill_ledger.py`: idempotent receipts→ledger migration
  (stable ids, source map, business-note rescue, tax preserved) + `verify()` reconciliation.
  Also fixes the historical bug where MoMo received/deposit texts were stored as direction=out.
- `tests/test_backfill_ledger.py` (5) + `tests/test_compat.py` (3) — migration + old-client guards.

**Verified:** 33 passed; ALL remaining red is Phase 2 (ingest, 4 failed + 2 errors) + Phase 3
(shop, 12 failed) scope only. Clean boot + idempotent reboot (18 categories). Old clients
(Receipts list, business expenses, /me, categories shapes) unchanged.

**Assumptions locked:** kinds NULL = personal-only (legacy truth); manual entries confidence=high;
business context without a shop = 422 "start your shop first"; order_ref resolves in Phase 3.

## Phase 2 — One ingestion (DONE)

**Shipped:**
- `app/classify.py`: ONE classify+extract call (receipt|momo_transaction|sales_sheet|
  supplier_note|not_money + direction/amount/currency/party/date/category/context_hint/
  reference/line_items/confidence/needs_question). Pure payload builders + response parser
  (golden-tested, no network); iron rule — structural doubt degrades to a QUESTION, never
  to not_money. Only explicit not_money means "nothing to file."
- `tests/test_classify_golden.py` (12): receipt/MoMo-thin/airtime/sales-sheet/chit-chat
  goldens + adversarial (unknown kind, garbage amount/date, off-taxonomy category,
  unusable envelope).
- `app/memory.py` wired in: `ingestion._memory_boost` fills category/context gaps and floors
  confidence to medium for known parties → second identical forward files silently.
- `app/ingestion.py`: limit→storage→classify→commit/question/not-money; sales_sheet without
  a shop returns needs_shop (no ghost shops); photo+dead-scanner still yields a fillable
  needs_review row (never 500s); clarification protocol (2 attempts max, cancel kills,
  expiry kills, answers write memory).
- `app/routers/ingest.py`: POST photo/text (201 filed / 202 question / 200 nothing),
  POST clarify (201 / 202 follow-up / 204 cancel), GET drafts. Injectable `get_classifier`.
- `routers/receipts.py` repointed at the pipeline (ReceiptOut adapter; thin photos file as
  needs_review for the old client). `init_db` auto-backfills receipts→ledger on every boot.
- `routers/whatsapp.py` rewritten content-first: single 6-digit link path, classify-then-
  file for text/images, clarification answers in-thread, confirm lines with category +
  shop tag + review hint. ZERO `shop_users`/KraTte references.
- Deleted `gemini_ocr.py`, `receipt_service.py`.
- `CameraUpload.tsx` → /ingest/photo with inline question UI (answer/cancel), LedgerEntry
  → ReceiptResult mapping for current screens. `tsc --noEmit` clean.

**Verified:** 54 passed; only Phase 3 shop tests red (12). Golden 12/12. Boot + backfill
idempotent. Live-Gemini behavior untested here by design (stubbed seam) — soak-test with
real forwards before production cutover.

**Handed to Phase 3:** `sales_sheet` entries land as business income with `line_items`
preserved + needs_review ("stock sync arrives with the shop") — Phase 3 MUST sweep these
into real orders with stock effects (sweep job + test) or income double-counts.
