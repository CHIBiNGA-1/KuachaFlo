import "server-only";
import type { Transaction } from "@/db";
import { auditEvents, type AuditMetadata } from "@/db/schema";

export async function appendAudit(
  tx: Transaction,
  event: {
    userId: string;
    action: string;
    resource: string;
    requestId: string;
    recordId?: string;
    metadata?: AuditMetadata;
  },
) {
  // Only field names, versions, and inventory deltas are retained—not passwords, customer details, or notes.
  await tx
    .insert(auditEvents)
    .values({ ...event, metadata: event.metadata || {} });
}
