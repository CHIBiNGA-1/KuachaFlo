import { ValidationError } from "@/lib/http-error";

export const MAX_MONEY = 1_000_000_000;
export function toMinorUnits(value: unknown, label = "Amount") {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_MONEY
  )
    throw new ValidationError(
      `${label} must be a non-negative amount up to ${MAX_MONEY}.`,
    );
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (
    Math.abs(scaled - rounded) >
    Math.max(1e-7, Number.EPSILON * Math.abs(scaled) * 4)
  )
    throw new ValidationError(`${label} supports at most two decimal places.`);
  return rounded;
}
export function moneyValue(value: unknown, label = "Amount") {
  return toMinorUnits(value, label) / 100;
}
export function orderAmount(items: { quantity: number; price: number }[]) {
  let total = BigInt(0);
  for (const item of items) {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100000
    )
      throw new ValidationError(
        "Order quantities must be whole units between 1 and 100,000.",
      );
    total +=
      BigInt(toMinorUnits(item.price, "Unit price")) * BigInt(item.quantity);
  }
  if (total > BigInt(MAX_MONEY) * BigInt(100))
    throw new ValidationError(
      "The order total exceeds the supported transaction limit.",
    );
  return Number(total) / 100;
}
