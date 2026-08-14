import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth";

const integration = process.env.AUTH_TEST_DATABASE_URL ? it : it.skip;

describe("MySQL user isolation (optional integration)", () => {
  integration("does not expose another user's conversations or attachments", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    const [{ getDb }, { attachments, conversations, sessions, users }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/db/schema"),
    ]);
    const db = getDb();
    const userA = { id: randomUUID(), username: `isolation_a_${randomUUID().slice(0, 8)}`, passwordHash: await hashPassword("password123") };
    const userB = { id: randomUUID(), username: `isolation_b_${randomUUID().slice(0, 8)}`, passwordHash: await hashPassword("password123") };
    const conversationB = { id: randomUUID(), userId: userB.id, title: "private" };
    const attachmentB = { id: randomUUID(), userId: userB.id, storageKey: `${randomUUID()}.png`, mimeType: "image/png", size: 1, originalName: "private.png" };
    const sessionB = { id: randomUUID(), userId: userB.id, tokenHash: "b".repeat(64), expiresAt: new Date(Date.now() + 60_000) };

    try {
      await db.insert(users).values([userA, userB]);
      await db.insert(conversations).values(conversationB);
      await db.insert(attachments).values(attachmentB);
      await db.insert(sessions).values(sessionB);

      const foreignConversation = await db.select({ id: conversations.id }).from(conversations).where(and(
        eq(conversations.id, conversationB.id),
        eq(conversations.userId, userA.id),
      )).limit(1);
      const foreignAttachment = await db.select({ id: attachments.id }).from(attachments).where(and(
        eq(attachments.id, attachmentB.id),
        eq(attachments.userId, userA.id),
      )).limit(1);
      await db.delete(sessions).where(and(eq(sessions.id, sessionB.id), eq(sessions.userId, userA.id)));
      const remainingSession = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionB.id)).limit(1);
      expect(foreignConversation).toEqual([]);
      expect(foreignAttachment).toEqual([]);
      expect(remainingSession).toEqual([{ id: sessionB.id }]);
    } finally {
      await db.delete(users).where(inArray(users.id, [userA.id, userB.id]));
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });
});
