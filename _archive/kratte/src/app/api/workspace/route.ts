import { NextResponse } from "next/server";
import {
  currentUser,
  checkOrigin,
  hasSessionContext,
  maintainSession,
  requireWorkspaceUser,
} from "@/lib/auth";
import { HttpError, withApi } from "@/lib/http-error";
import { readJson, allowedKeys } from "@/lib/request";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  createDemoWorkspace,
  workspaceSnapshot,
  updateWorkspace,
} from "@/lib/workspace";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(request, "workspace.read", async ({ requestId }) => {
    const user = await currentUser();
    if (!user) {
      if (await hasSessionContext(request))
        throw new HttpError(
          "Your session has ended. Sign in again to return to your saved workspace.",
          401,
          "SESSION_EXPIRED",
        );
      checkOrigin(request);
      const demo = await createDemoWorkspace(request, requestId);
      return NextResponse.json(await workspaceSnapshot(demo.id));
    }
    const expected = request.headers.get("X-KraTte-Workspace");
    if (expected && expected !== user.id)
      throw new HttpError(
        "The active account changed in another tab. Reconnect to your original workspace before saving.",
        409,
        "WORKSPACE_CHANGED",
      );
    await consumeRateLimit("workspace.read", user.id, 300, 60);
    await maintainSession(user);
    return NextResponse.json(await workspaceSnapshot(user.id));
  });
}
export async function POST(request: Request) {
  return withApi(request, "workspace.demo", async ({ requestId }) => {
    checkOrigin(request);
    const input = await readJson(request, 4096);
    allowedKeys(input, ["action"]);
    if (input.action !== "start-demo")
      throw new HttpError(
        "Choose a valid workspace action.",
        400,
        "INVALID_ACTION",
      );
    const user = await currentUser();
    if (user) {
      await maintainSession(user);
      return NextResponse.json(await workspaceSnapshot(user.id));
    }
    const demo = await createDemoWorkspace(request, requestId);
    return NextResponse.json(await workspaceSnapshot(demo.id));
  });
}
export async function PATCH(request: Request) {
  return withApi(request, "workspace.update", async ({ requestId }) => {
    checkOrigin(request);
    const user = await requireWorkspaceUser(request);
    await consumeRateLimit("workspace.write", user.id, 120, 60);
    const input = await readJson(request, 64 * 1024);
    return NextResponse.json({
      user: await updateWorkspace(user.id, user.sessionId, input, requestId),
    });
  });
}
