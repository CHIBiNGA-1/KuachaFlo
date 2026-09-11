export const dynamic = "force-dynamic";

// Liveness deliberately avoids the database: a DB outage should not cause a restart storm.
export async function GET() {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
