"""Field validation (port of KraTte lib/validation.ts + lib/request.ts).

Same messages' intent, same limits: names 1–500, notes ≤2000, emails
regex-checked, dates real YYYY-MM-DD, quantities 1–100000, ≤100 items
per order, strict allowed-keys (unknown fields rejected — typos must
fail loudly, not vanish silently).
"""

import re
from datetime import datetime

from app.shop.errors import ShopError
from app.shop.money import money_value

UUID_RE = re.compile(
    r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", re.IGNORECASE
)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

INVENTORY_CATEGORIES = [
    "Beverages", "Pantry", "Fresh & dairy", "Snacks",
    "Personal care", "Household", "Other",
]
SUPPLIER_CATEGORIES = [*INVENTORY_CATEGORIES, "Multiple categories"]
EXPENSE_CATEGORIES = [
    "Rent", "Utilities", "Payroll", "Marketing", "Shipping", "Supplies", "Other",
]
SALE_STATUSES = ["Completed", "Pending", "Cancelled"]
PURCHASE_STATUSES = ["Ordered", "Received", "Cancelled"]
CHANNELS = ["Retail", "Wholesale"]
PAYMENTS = ["Paid", "Unpaid"]
CUSTOMER_TYPES = ["Retail", "Wholesale"]
PARTY_STATUSES = ["Active", "Inactive"]
TEAM_STATUSES = ["Active", "Invited", "Inactive"]
TEAM_ROLES = ["Manager", "Sales associate", "Inventory manager", "Accountant"]


def text(value, label: str, *, min_len=0, max_len=500, required=False) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ShopError(f"{label} must be text.")
    result = value.strip()
    if required and not result:
        raise ShopError(f"{label} is required.")
    if len(result) < min_len or len(result) > max_len or _CONTROL_RE.search(result):
        raise ShopError(
            f"{label} must be between {min_len} and {max_len} characters without control characters."
        )
    return result


def email(value, label="Email address", *, required=False) -> str:
    result = text(value, label, max_len=254, required=required)
    if result and not _EMAIL_RE.match(result):
        raise ShopError("Enter a valid email address.")
    return result


def money(value, label: str, *, required=True, minimum=0.0) -> float:
    if value is None:
        if required:
            raise ShopError(f"{label} is required.")
        return 0.0
    result = money_value(value, label)
    if result < minimum:
        raise ShopError(f"{label} must be at least {minimum}.")
    return result


def whole(value, label: str, *, min_value=0, max_value=1_000_000_000, required=True) -> int:
    if value is None:
        if required:
            raise ShopError(f"{label} is required.")
        return 0
    if isinstance(value, bool) or not isinstance(value, int):
        raise ShopError(f"{label} must be a whole number between {min_value} and {max_value}.")
    if value < min_value or value > max_value:
        raise ShopError(f"{label} must be a whole number between {min_value} and {max_value}.")
    return value


def choice(value, options: list[str], label: str, *, fallback=None) -> str:
    actual = fallback if value is None or value == "" else value
    if not isinstance(actual, str) or actual not in options:
        raise ShopError(f"Choose a valid {label.lower()}.")
    return actual


def date_value(value, label="Date"):
    result = text(value, label, min_len=10, max_len=10)
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", result):
        raise ShopError(f"Enter a valid {label.lower()}.")
    try:
        parsed = datetime.strptime(result, "%Y-%m-%d").date()
    except ValueError:
        raise ShopError(f"Enter a valid {label.lower()}.")
    if parsed.isoformat() != result:
        raise ShopError(f"Enter a valid {label.lower()}.")
    return parsed


def uuid_value(value, label: str) -> str:
    if not isinstance(value, str) or not UUID_RE.match(value):
        raise ShopError(f"Choose a valid {label.lower()}.")
    return value


def allowed_keys(payload: dict, keys: list[str]) -> None:
    unknown = [k for k in payload if k not in keys]
    if unknown:
        raise ShopError("The request contains unsupported fields.")


def product_image(value: str) -> str:
    """Port of the inventory image allowlist: catalog refs, local inventory
    art, uploaded-file references, or credential-less http(s) URLs."""
    image = (value or "").strip()
    if not image:
        return ""
    if re.match(r"^catalog:[0-5]$", image):
        return image
    if re.match(r"^/images/inventory/[a-z0-9-]+\.webp$", image):
        return image
    if image.startswith(("http://", "https://", "/uploads/", "https://")):
        from urllib.parse import urlparse
        if image.startswith("/uploads/"):
            return image[:500]
        try:
            url = urlparse(image)
        except ValueError:
            raise ShopError("Use a valid HTTP or HTTPS product image URL.")
        if url.scheme not in ("http", "https") or url.username or url.password:
            raise ShopError("Use an HTTP or HTTPS image URL without embedded credentials.")
        return image[:500]
    raise ShopError("Use a valid HTTP or HTTPS product image URL.")
