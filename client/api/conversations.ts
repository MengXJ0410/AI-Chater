import type { GenerationStatus } from "@/client/chat-message";
import { jsonInit, requestJson, requestVoid } from "@/client/api/http";
import type { MessagePart } from "@/shared/messages";

export type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  presetId: string | null;
  model: string | null;
  createdAt: string;
  status?: GenerationStatus;
};
export type ConversationDetail = { conversation: Conversation; messages: ChatMessage[] };

export async function listConversations(): Promise<Conversation[]> {
  const data = await requestJson<{ conversations: Conversation[] }>("/api/conversations", undefined, "读取会话失败。");
  return data.conversations;
}

export async function createConversation(title = "新对话"): Promise<Conversation> {
  const data = await requestJson<{ conversation: Conversation }>("/api/conversations", jsonInit({ title }), "新建会话失败。");
  return data.conversation;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return requestJson<ConversationDetail>(`/api/conversations/${id}`, undefined, "加载会话失败。");
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await requestJson(`/api/conversations/${id}`, jsonInit({ title }, "PATCH"), "重命名失败。");
}

export async function deleteConversation(id: string): Promise<void> {
  await requestVoid(`/api/conversations/${id}`, { method: "DELETE" }, "删除失败。");
}
