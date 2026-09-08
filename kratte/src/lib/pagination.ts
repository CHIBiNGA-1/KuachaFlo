import { ValidationError } from "@/lib/http-error";
import { UUID_PATTERN } from "@/lib/request";

export function pageOptions(url: URL) {
  const raw = url.searchParams.get("limit") || "50";
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 200)
    throw new ValidationError("Page size must be between 1 and 200.");
  let cursor: { id: string; date: string } | undefined;
  const encoded = url.searchParams.get("cursor");
  if (encoded) {
    try {
      if (encoded.length > 300 || !/^[a-zA-Z0-9_-]+$/.test(encoded))
        throw new Error();
      const parsed = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      );
      if (
        typeof parsed.id !== "string" ||
        !UUID_PATTERN.test(parsed.id) ||
        typeof parsed.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(parsed.date)
      )
        throw new Error();
      const date = new Date(parsed.date + "Z");
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 23) !== parsed.date.slice(0, 23)
      )
        throw new Error();
      // Keep all six fractional digits. Converting the comparison value to Date skips rows.
      cursor = { id: parsed.id, date: parsed.date };
    } catch {
      throw new ValidationError("Invalid page cursor.");
    }
  }
  return { limit: Number(raw), cursor };
}
export function nextCursor(row: { id: string; cursorDate: string }) {
  return Buffer.from(
    JSON.stringify({ id: row.id, date: row.cursorDate }),
  ).toString("base64url");
}
export function expectedVersion(
  request: Request,
  input: Record<string, unknown>,
) {
  const match = request.headers.get("if-match");
  if (!match) return input;
  if (!/^(?:[1-9]\d{0,9}|"[1-9]\d{0,9}")$/.test(match))
    throw new ValidationError("If-Match must contain a record version.");
  const version = Number(match.replaceAll('"', ""));
  if (input.expectedVersion !== undefined && input.expectedVersion !== version)
    throw new ValidationError("Conflicting record versions were supplied.");
  return { ...input, expectedVersion: version };
}
