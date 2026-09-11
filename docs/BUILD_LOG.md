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
