import { randomUUID } from "crypto";
import { lt } from "drizzle-orm";
import { getDb } from "@/server/db";
import { modelConfigAuditEvents } from "@/server/db/schema";

export type AuditKind = "chat" | "image";
export type AuditAction = typeof modelConfigAuditEvents.$inferInsert.action;

export async function auditModelConfig(event: Omit<typeof modelConfigAuditEvents.$inferInsert, "id">) {
  await getDb().insert(modelConfigAuditEvents).values({ id: randomUUID(), ...event });
}

export async function cleanupModelAudit(now = new Date()) {
  const days = Number(process.env.MODEL_AUDIT_RETENTION_DAYS ?? 180);
  const safeDays = Number.isSafeInteger(days) && days > 0 ? days : 180;
  const cutoff = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
  await getDb().delete(modelConfigAuditEvents).where(lt(modelConfigAuditEvents.createdAt, cutoff));
}
