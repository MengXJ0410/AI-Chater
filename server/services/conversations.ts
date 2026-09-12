import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { attachments, conversations, messages } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";
import { removeImages } from "@/server/services/uploads";

export async function listChatConversations(userId: string) {
  return getDb().select().from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.kind, "chat")))
    .orderBy(desc(conversations.updatedAt));
}

export async function createChatConversation(userId: string, title: string) {
  const conversation = { id: randomUUID(), userId, title, kind: "chat" as const };
  await getDb().insert(conversations).values(conversation);
  return conversation;
}

export async function getChatConversation(userId: string, id: string) {
  const rows = await getDb().select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId), eq(conversations.kind, "chat"))).limit(1);
  return rows[0] ?? null;
}

export async function getChatConversationDetail(userId: string, id: string) {
  const conversation = await getChatConversation(userId, id);
  if (!conversation) throw new RequestError("会话不存在。", 404);

  const conversationMessages = await getDb().select().from(messages).where(eq(messages.conversationId, id));
  const messageIds = conversationMessages.map((message) => message.id);
  const conversationAttachments = messageIds.length
    ? await getDb().select({ id: attachments.id, messageId: attachments.messageId, mimeType: attachments.mimeType, originalName: attachments.originalName })
      .from(attachments).where(inArray(attachments.messageId, messageIds))
    : [];
  return { conversation, messages: conversationMessages, attachments: conversationAttachments };
}

export async function renameChatConversation(userId: string, id: string, title: string) {
  if (!(await getChatConversation(userId, id))) throw new RequestError("会话不存在。", 404);
  await getDb().update(conversations).set({ title }).where(eq(conversations.id, id));
  return { id, title };
}

export async function deleteChatConversation(userId: string, id: string) {
  if (!(await getChatConversation(userId, id))) throw new RequestError("会话不存在。", 404);
  const fileRows = await getDb().select({ storageKey: attachments.storageKey }).from(attachments)
    .innerJoin(messages, eq(attachments.messageId, messages.id))
    .where(eq(messages.conversationId, id));
  await getDb().delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  await removeImages(fileRows.map((row) => row.storageKey));
}
