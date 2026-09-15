import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getLanguageModel } from "@/server/providers/ai";
import {
  BUILT_IN_AGENT_TOOL_NAMES,
  agentErrorCode,
  agentToolRegistry,
  registerBuiltInAgentTools,
  streamAgent,
  type AgentExecutionEvent,
} from "@/server/agent";
import { getDb } from "@/server/db";
import { conversations, messages } from "@/server/db/schema";
import { RequestError } from "@/server/http/errors";
import { loadConversationModelMessages } from "@/server/services/chat";
import { getChatConversation } from "@/server/services/conversations";
import { chatConnectionForPreset } from "@/server/services/model-configs";
import type { AgentRunEvent, AgentStreamChunk } from "@/shared/agent";

const AGENT_INSTRUCTIONS = [
  "你是 AI Chater 的 Agent 助手，可以使用工具完成任务。",
  "需要实时时间或精确计算时必须调用工具，不要编造工具结果。",
  "工具返回错误时向用户说明原因，不要重复做无意义的调用。",
  "使用中文回答，保持简洁，并在合适时说明计算依据。",
].join("\n");

export type AgentTurnInput = {
  userId: string;
  conversationId: string;
  presetId: string;
  text: string;
};

export function toAgentRunEvent(event: AgentExecutionEvent): AgentRunEvent {
  return event;
}

export async function streamAgentReply(input: AgentTurnInput, signal: AbortSignal): Promise<Response> {
  registerBuiltInAgentTools();
  const { userId, conversationId, presetId, text } = input;

  const conversation = await getChatConversation(userId, conversationId);
  if (!conversation) throw new RequestError("会话不存在。", 404);
  const connection = await chatConnectionForPreset(userId, presetId);
  if (!connection) throw new RequestError("所选模型配置不存在。", 404);

  await getDb().transaction(async (tx) => {
    await tx.insert(messages).values({
      id: randomUUID(),
      conversationId,
      role: "user",
      parts: [{ type: "text", text }],
    });
    if (conversation.title === "新对话") {
      await tx.update(conversations).set({ title: text.slice(0, 40) }).where(eq(conversations.id, conversationId));
    } else {
      await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    }
  });

  const modelMessages = await loadConversationModelMessages(conversationId);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: AgentStreamChunk) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const handle = await streamAgent({
          model: getLanguageModel(connection.connection),
          messages: modelMessages,
          instructions: AGENT_INSTRUCTIONS,
          registry: agentToolRegistry,
          allowedToolNames: [...BUILT_IN_AGENT_TOOL_NAMES],
          context: { requestId: randomUUID(), userId, conversationId },
          abortSignal: signal,
          onEvent: (event) => { send({ type: "event", event: toAgentRunEvent(event) }); },
        });
        for await (const chunk of handle.textStream) send({ type: "text", text: chunk });
        const result = await handle.result;
        if (result.text.trim()) {
          await getDb().insert(messages).values({
            id: randomUUID(),
            conversationId,
            role: "assistant",
            parts: [{ type: "text", text: result.text }],
            presetId,
            model: connection.connection.model,
          });
          await getDb().update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
        }
        send({ type: "done", steps: result.steps.length, finishReason: result.finishReason });
      } catch (error) {
        send({ type: "error", code: agentErrorCode(error), message: error instanceof Error ? error.message : "Agent 执行失败。" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
