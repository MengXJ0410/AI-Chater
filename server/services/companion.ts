import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { streamText } from "ai";
import { getLanguageModel } from "@/server/providers/ai";
import { getDb } from "@/server/db";
import { conversations, messages } from "@/server/db/schema";
import { textFromParts } from "@/shared/messages";
import { chatConnectionForPreset } from "@/server/services/model-configs";
import { auditModelConfig } from "@/server/services/model-controls";
import { RequestError } from "@/server/http/errors";

export const COMPANION_PERSONA_VERSION = "catgirl-v1";
export const COMPANION_SYSTEM_PROMPT = [
  `你是 AI Chater 中的虚拟伙伴，角色配置版本为 ${COMPANION_PERSONA_VERSION}。`,
  "你是一名温柔、活泼、尊重边界的猫娘。请自然地进行中文对话，不虚构已经发生的现实事件。",
  "首期只使用当前对话上下文，不声称拥有长期记忆、真实情感或现实世界行动能力。",
].join("\n");

function textMessages(rows: Array<typeof messages.$inferSelect>) {
  return rows.map((row) => ({
    role: row.role,
    content: textFromParts(row.parts),
  }));
}

export async function listCompanionConversations(userId: string) {
  return getDb().select().from(conversations).where(and(
    eq(conversations.userId, userId),
    eq(conversations.kind, "companion"),
  )).orderBy(desc(conversations.updatedAt));
}

export async function createCompanionConversation(userId: string, title = "猫娘陪伴") {
  const conversation = { id: randomUUID(), userId, title, kind: "companion" as const };
  await getDb().insert(conversations).values(conversation);
  return conversation;
}

export async function getCompanionConversation(userId: string, id: string) {
  const rows = await getDb().select().from(conversations).where(and(
    eq(conversations.id, id),
    eq(conversations.userId, userId),
    eq(conversations.kind, "companion"),
  )).limit(1);
  return rows[0] ?? null;
}

export async function generateCompanionReply(request: Request, input: { conversationId: string; modelConfigId: string; text: string }, userId: string) {
  const conversation = await getCompanionConversation(userId, input.conversationId);
  if (!conversation) throw new RequestError("Companion 会话不存在。", 404);

  const connection = await chatConnectionForPreset(userId, `user-chat-config:${input.modelConfigId}`);
  if (!connection) throw new RequestError("所选对话模型配置不存在。", 404);

  await auditModelConfig({
    userId,
    configId: input.modelConfigId,
    kind: "chat",
    action: "generation_requested",
    outcome: "success",
    provider: connection.connection.provider,
    model: connection.connection.model,
    runtimePresetId: connection.config.runtimePresetId,
  });

  const userMessageId = randomUUID();
  await getDb().transaction(async (tx) => {
    await tx.insert(messages).values({
      id: userMessageId,
      conversationId: conversation.id,
      role: "user",
      parts: [{ type: "text", text: input.text }],
    });
    await tx.update(conversations).set({
      title: conversation.title === "猫娘陪伴" ? input.text.slice(0, 40) : conversation.title,
      updatedAt: new Date(),
    }).where(eq(conversations.id, conversation.id));
  });

  const history = await getDb().select().from(messages).where(eq(messages.conversationId, conversation.id));
  const result = streamText({
    model: getLanguageModel(connection.connection),
    system: COMPANION_SYSTEM_PROMPT,
    messages: textMessages(history),
    abortSignal: request.signal,
    onError: (error) => {
      void auditModelConfig({
        userId,
        configId: input.modelConfigId,
        kind: "chat",
        action: "generation_failed",
        outcome: "failed",
        provider: connection.connection.provider,
        model: connection.connection.model,
        runtimePresetId: connection.config.runtimePresetId,
        errorCode: error instanceof Error ? error.name.slice(0, 64) : "MODEL_ERROR",
      }).catch(() => undefined);
    },
    onFinish: async ({ text }) => {
      if (!text.trim()) return;
      await getDb().insert(messages).values({
        id: randomUUID(),
        conversationId: conversation.id,
        role: "assistant",
        parts: [{ type: "text", text }],
        presetId: connection.config.runtimePresetId,
        model: connection.connection.model,
      });
      await getDb().update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
      await auditModelConfig({
        userId,
        configId: input.modelConfigId,
        kind: "chat",
        action: "generation_completed",
        outcome: "success",
        provider: connection.connection.provider,
        model: connection.connection.model,
        runtimePresetId: connection.config.runtimePresetId,
      }).catch(() => undefined);
    },
  });
  return result.toTextStreamResponse();
}
