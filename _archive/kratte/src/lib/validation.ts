import {
  configs,
  resources,
  type RecordData,
  type Resource,
} from "@/lib/types";
import { ValidationError } from "@/lib/http-error";
import {
  allowedKeys,
  objectInput,
  positiveInteger,
  stringValue,
  UUID_PATTERN,
} from "@/lib/request";
import { moneyValue } from "@/lib/money";

export function parseResource(value: string): Resource {
  if (!resources.includes(value as Resource))
    throw new ValidationError("Unknown resource.");
  return value as Resource;
}
export function dateValue(value: unknown, label = "Date") {
  const result = stringValue(value, label, { min: 10, max: 10 });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    throw new ValidationError(`Enter a valid ${label.toLowerCase()}.`);
  return result;
}
function choice(
  value: unknown,
  options: readonly string[],
  label: string,
  fallback?: string,
) {
  const actual = value === undefined || value === "" ? fallback : value;
  if (typeof actual !== "string" || !options.includes(actual))
    throw new ValidationError(`Choose a valid ${label.toLowerCase()}.`);
  return actual;
}
const metadataFields = [
  "id",
  "resource",
  "version",
  "expectedVersion",
  "expectedStock",
];
export function validateRecordData(
  resource: Resource,
  value: unknown,
): RecordData {
  const input = objectInput(value);
  const order = resource === "sales" || resource === "purchases";
  const orderFields = [
    "name",
    "customer",
    "supplier",
    "status",
    "channel",
    "payment",
    "date",
    "dueDate",
    "notes",
    "items",
    "amount",
  ];
  allowedKeys(input, [
    ...metadataFields,
    ...(order
      ? orderFields
      : configs[resource].fields.map((field) => field.key)),
    ...(resource === "inventory" ? ["pinned"] : []),
  ]);
  if (input.resource !== undefined && input.resource !== resource)
    throw new ValidationError("The record type does not match this request.");
  if (input.expectedVersion !== undefined)
    positiveInteger(input.expectedVersion, "Expected version", 1, 2147483647);
  if (input.expectedStock !== undefined)
    positiveInteger(input.expectedStock, "Expected stock", 0);
  const result: Record<string, unknown> = {};
  if (order) {
    result.name =
      input.name === undefined || input.name === ""
        ? "#pending"
        : stringValue(input.name, "Order number", { min: 1, max: 100 });
    result.status = choice(
      input.status,
      resource === "sales"
        ? ["Completed", "Pending", "Cancelled"]
        : ["Ordered", "Received", "Cancelled"],
      "Order status",
    );
    const party = resource === "sales" ? "customer" : "supplier";
    result[party] = stringValue(
      input[party] || (resource === "sales" ? "Walk-in customer" : ""),
      party === "customer" ? "Customer" : "Supplier",
      { min: 1, max: 200 },
    );
    result.channel = choice(
      input.channel,
      ["Retail", "Wholesale"],
      "Sales channel",
      "Retail",
    );
    result.payment = choice(
      input.payment,
      ["Paid", "Unpaid"],
      "Payment status",
      "Paid",
    );
    result.date = dateValue(
      input.date || new Date().toISOString().slice(0, 10),
    );
    if (input.dueDate)
      result.dueDate = dateValue(input.dueDate, "Expected delivery date");
    result.notes = stringValue(input.notes ?? "", "Notes", { max: 2000 });
    if (
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 100
    )
      throw new ValidationError(
        "Add between 1 and 100 products to this order.",
      );
    result.items = input.items.map((value) => {
      const item = objectInput(value, "Order item");
      allowedKeys(item, ["productId", "quantity", "name", "price", "cost"]);
      if (
        typeof item.productId !== "string" ||
        !UUID_PATTERN.test(item.productId)
      )
        throw new ValidationError(
          "Choose a valid product for every order item.",
        );
      return {
        productId: item.productId,
        quantity: positiveInteger(item.quantity, "Quantity", 1, 100000),
      };
    });
    // Client-provided totals, costs, and prices are deliberately ignored; store.ts calculates them.
  } else {
    for (const field of configs[resource].fields) {
      const raw = input[field.key];
      if (field.required && (raw === undefined || raw === null || raw === ""))
        throw new ValidationError(`${field.label} is required.`);
      if (field.type === "number") {
        const value = raw ?? field.defaultValue ?? 0;
        const number = ["stock", "reorderAt"].includes(field.key)
          ? positiveInteger(value, field.label, 0)
          : moneyValue(value, field.label);
        if (number < (field.min || 0))
          throw new ValidationError(
            `${field.label} must be at least ${field.min}.`,
          );
        result[field.key] = number;
      } else if (field.type === "select") {
        result[field.key] = choice(
          raw,
          field.options || [],
          field.label,
          field.options?.[0],
        );
      } else {
        const text = stringValue(raw ?? field.defaultValue ?? "", field.label, {
          min: field.required ? 1 : 0,
          max: field.type === "textarea" ? 2000 : 500,
        });
        if (
          field.type === "email" &&
          text &&
          (text.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
        )
          throw new ValidationError("Enter a valid email address.");
        result[field.key] =
          field.type === "date" && text ? dateValue(text, field.label) : text;
      }
    }
    if (resource === "inventory") {
      if (input.pinned !== undefined && typeof input.pinned !== "boolean")
        throw new ValidationError(
          "Saved-product preference must be true or false.",
        );
      result.pinned = input.pinned === true;
      if (result.image) {
        const image = String(result.image);
        if (
          !/^catalog:[0-5]$/.test(image) &&
          !/^\/images\/inventory\/[a-z0-9-]+\.webp$/.test(image)
        ) {
          let url: URL;
          try {
            url = new URL(image);
          } catch {
            throw new ValidationError(
              "Use a valid HTTP or HTTPS product image URL.",
            );
          }
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new ValidationError(
              "Use an HTTP or HTTPS image URL without embedded credentials.",
            );
        }
      }
    }
  }
  return result as RecordData;
}
