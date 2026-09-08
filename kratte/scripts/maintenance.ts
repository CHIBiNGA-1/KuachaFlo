import "dotenv/config";
import { and, eq, gt, inArray, lt, notExists, sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("@/db");
  const { sessions, rateLimits, users } = await import("@/db/schema");
  try {
    const counts = await db.transaction(async (tx) => {
      const [locked] = (
        await tx.execute<{ acquired: boolean }>(
          sql`SELECT pg_try_advisory_xact_lock(1936224119, 2) AS acquired`,
        )
      ).rows;
      if (!locked.acquired) return { skipped: true };
      const now = new Date();
      const expiredSessions = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(lt(sessions.expiresAt, now))
        .limit(1000);
      if (expiredSessions.length)
        await tx.delete(sessions).where(
          inArray(
            sessions.id,
            expiredSessions.map((row) => row.id),
          ),
        );
      const staleBuckets = await tx
        .select({ key: rateLimits.key })
        .from(rateLimits)
        .where(lt(rateLimits.resetAt, new Date(Date.now() - 86400000)))
        .limit(1000);
      if (staleBuckets.length)
        await tx.delete(rateLimits).where(
          inArray(
            rateLimits.key,
            staleBuckets.map((row) => row.key),
          ),
        );
      let demos = 0;
      // Destructive demo pruning is explicit and never targets a registered account.
      if (process.argv.includes("--prune-expired-demos")) {
        const liveSessions = tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(eq(sessions.userId, users.id), gt(sessions.expiresAt, now)),
          );
        const candidates = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.isDemo, true),
              lt(users.createdAt, new Date(Date.now() - 30 * 86400000)),
              notExists(liveSessions),
            ),
          )
          .limit(20)
          .for("update", { skipLocked: true });
        for (const user of candidates) {
          await tx
            .delete(users)
            .where(and(eq(users.id, user.id), eq(users.isDemo, true)));
          demos++;
        }
      }
      return {
        expiredSessions: expiredSessions.length,
        expiredRateBuckets: staleBuckets.length,
        prunedDemos: demos,
      };
    });
    console.info(JSON.stringify({ operation: "maintenance", ...counts }));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("Maintenance failed; no partial transaction was committed.");
  process.exitCode = 1;
});
