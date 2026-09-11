"""Minor-units money math (exact port of KraTte lib/money.ts).

Totals are integers of tambala/cents throughout; floats appear only at
the API boundary. No float drift in stock valuation or order totals, ever.
"""

from app.shop.errors import ShopError

MAX_MONEY = 1_000_000_000


def to_minor_units(value, label="Amount") -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ShopError(f"{label} must be a non-negative amount up to {MAX_MONEY}.")
    if value != value or value in (float("inf"), float("-inf")):
        raise ShopError(f"{label} must be a non-negative amount up to {MAX_MONEY}.")
    if value < 0 or value > MAX_MONEY:
        raise ShopError(f"{label} must be a non-negative amount up to {MAX_MONEY}.")
    scaled = value * 100
    rounded = round(scaled)
    if abs(scaled - rounded) > max(1e-7, 2.220446049250313e-16 * abs(scaled) * 4):
        raise ShopError(f"{label} supports at most two decimal places.")
    return rounded


def money_value(value, label="Amount") -> float:
    return to_minor_units(value, label) / 100


def order_amount(items: list[dict]) -> float:
    """items: [{quantity, price}] with price in MAJOR units. Exact."""
    total = 0
    for item in items:
        qty = item["quantity"]
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 1 or qty > 100000:
            raise ShopError("Order quantities must be whole units between 1 and 100,000.")
        total += to_minor_units(item["price"], "Unit price") * qty
    if total > MAX_MONEY * 100:
        raise ShopError("The order total exceeds the supported transaction limit.")
    return total / 100
