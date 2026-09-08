import { HttpError, ValidationError } from "@/lib/http-error";

export const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function objectInput(
  value: unknown,
  label = "Details",
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new ValidationError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function inspectJson(value: unknown, depth = 0, count = { nodes: 0 }) {
  if (++count.nodes > 12000 || depth > 12)
    throw new ValidationError("The request is too complex.");
  if (Array.isArray(value)) {
    for (const child of value) inspectJson(child, depth + 1, count);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new ValidationError("The request contains an unsupported field.");
      inspectJson(child, depth + 1, count);
    }
  }
}
export async function readJson(request: Request, maxBytes = 128 * 1024) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") || "",
    )
  )
    throw new HttpError(
      "Use application/json for this request.",
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  if (
    request.headers.get("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new HttpError(
      "Compressed request bodies are not supported.",
      415,
      "UNSUPPORTED_ENCODING",
    );
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new HttpError("This request is too large.", 413, "PAYLOAD_TOO_LARGE");
  if (!request.body)
    throw new ValidationError("A JSON request body is required.");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new HttpError(
            "The request body took too long to arrive.",
            408,
            "REQUEST_TIMEOUT",
          ),
        ),
      10000,
    );
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new HttpError(
          "This request is too large.",
          413,
          "PAYLOAD_TOO_LARGE",
        );
      chunks.push(value);
    }
    let result: unknown;
    try {
      result = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      throw new ValidationError("The request body is not valid UTF-8 JSON.");
    }
    inspectJson(result);
    return objectInput(result, "The request");
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
export function stringValue(
  value: unknown,
  label: string,
  { min = 0, max = 500, trim = true } = {},
) {
  if (typeof value !== "string")
    throw new ValidationError(`${label} must be text.`);
  const result = trim ? value.trim() : value;
  if (
    result.length < min ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)
  )
    throw new ValidationError(
      `${label} must be between ${min} and ${max} characters without control characters.`,
    );
  return result;
}
export function allowedKeys(
  input: Record<string, unknown>,
  keys: readonly string[],
) {
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new ValidationError("The request contains unsupported fields.");
}
export function positiveInteger(
  value: unknown,
  label: string,
  min = 1,
  max = 1_000_000_000,
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new ValidationError(
      `${label} must be a whole number between ${min} and ${max}.`,
    );
  return value;
}
