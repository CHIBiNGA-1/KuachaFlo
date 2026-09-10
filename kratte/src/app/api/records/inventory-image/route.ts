import { NextResponse } from "next/server";
import { currentUser, checkOrigin } from "@/lib/auth";
import { withApi, HttpError, ValidationError } from "@/lib/http-error";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function POST(request: Request) {
  return withApi(request, "records.inventory-image", async () => {
    checkOrigin(request);
    const user = await currentUser();
    if (!user)
      throw new HttpError("Your session has ended. Sign in again to continue.", 401, "SESSION_EXPIRED");
    await consumeRateLimit("records.inventory-image", user.id, 30, 60);

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey)
      throw new HttpError("Image uploads aren't configured yet.", 503, "NOT_CONFIGURED");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("No file was uploaded.");
    if (!ALLOWED_TYPES.has(file.type))
      throw new ValidationError("Use a JPEG, PNG, WEBP, or HEIC image.");
    if (file.size > MAX_BYTES) throw new ValidationError("Image must be under 8MB.");

    const bytes = await file.arrayBuffer();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/kratte-products/${key}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": file.type,
        },
        body: bytes,
      },
    );
    if (!uploadRes.ok) {
      throw new HttpError("Couldn't save the image right now — try again.", 502, "UPLOAD_FAILED");
    }

    return NextResponse.json({
      url: `${supabaseUrl}/storage/v1/object/public/kratte-products/${key}`,
    });
  });
}
