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
