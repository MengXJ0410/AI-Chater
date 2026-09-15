import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { streamText } from "ai";
import { connectionFromPreset, getLanguageModel, getPreset, modelStreamErrorHandler, toModelMessages } from "@/server/providers/ai";
import { getDb } from "@/server/db";
import { attachments, conversations, messages } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";
import { chatConnectionForPreset, LEGACY_CHAT_RUNTIME_ID } from "@/server/services/model-configs";

export type ChatTurnInput = {
  userId: string;
  conversationId: string;
  presetId: string;
  text: string;
  attachmentIds: string[];
};

export async function loadConversationModelMessages(conversationId: string) {
  const history = await getDb().select().from(messages)
    .where(eq(messages.conversationId, conversationId));
  const historyMessageIds = history.map((message) => message.id);
  const historyAttachments = historyMessageIds.length
    ? await getDb().select().from(attachments).where(inArray(attachments.messageId, historyMessageIds))
    : [];
  const storageKeys = new Map(historyAttachments.map((attachment) => [attachment.id, attachment.storageKey]));
  const mimeTypes = new Map(historyAttachments.map((attachment) => [attachment.id, attachment.mimeType]));
  return toModelMessages(history.map((message) => ({
    role: message.role,
    parts: message.parts,
    storageKeys,
    mimeTypes,
  })));
}

export async function streamChatReply(input: ChatTurnInput, signal: AbortSignal) {
  const { userId, conversationId, presetId, text, attachmentIds } = input;
  const conversation = await getDb().select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId), eq(conversations.kind, "chat"))).limit(1);
  if (!conversation[0]) throw new RequestError("会话不存在。", 404);

  const systemPreset = getPreset(presetId);
  const userConfig = presetId === LEGACY_CHAT_RUNTIME_ID || presetId.startsWith("user-chat-config:") ? await chatConnectionForPreset(userId, presetId) : null;
  if (!systemPreset && !userConfig) throw new RequestError("所选模型预设不存在。", 404);
  if (attachmentIds.length && (!systemPreset || !systemPreset.supportsImages)) throw new RequestError("当前模型不支持图片输入。");
  const connection = userConfig?.connection ?? connectionFromPreset(systemPreset!);

  const uniqueAttachmentIds = [...new Set(attachmentIds)];
  const selectedAttachments = uniqueAttachmentIds.length
    ? await getDb().select().from(attachments).where(and(
      eq(attachments.userId, userId),
      isNull(attachments.messageId),
      inArray(attachments.id, uniqueAttachmentIds),
    ))
    : [];
  if (selectedAttachments.length !== uniqueAttachmentIds.length) throw new RequestError("存在无效或已使用的图片附件。", 400);

  const userMessageId = randomUUID();
  const parts = [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...uniqueAttachmentIds.map((attachmentId) => ({ type: "image" as const, attachmentId })),
  ];

  await getDb().transaction(async (tx) => {
    await tx.insert(messages).values({
      id: userMessageId,
      conversationId,
      role: "user",
      parts,
    });
    if (uniqueAttachmentIds.length) {
      await tx.update(attachments).set({ messageId: userMessageId }).where(inArray(attachments.id, uniqueAttachmentIds));
    }
    if (conversation[0].title === "新对话" && text) {
      await tx.update(conversations).set({ title: text.slice(0, 40) }).where(eq(conversations.id, conversationId));
    } else {
      await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    }
  });

  const modelMessages = await loadConversationModelMessages(conversationId);

  const result = streamText({
    model: getLanguageModel(connection),
    messages: modelMessages,
    abortSignal: signal,
    onError: modelStreamErrorHandler,
    onFinish: async ({ text: assistantText }) => {
      if (!assistantText.trim()) return;
      await getDb().insert(messages).values({
        id: randomUUID(),
        conversationId,
        role: "assistant",
        parts: [{ type: "text", text: assistantText }],
        presetId,
        model: connection.model,
      });
      await getDb().update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    },
  });

  return result.toTextStreamResponse();
}
