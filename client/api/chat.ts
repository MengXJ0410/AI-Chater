import { ApiRequestError } from "@/client/api/http";
import { jsonInit } from "@/client/api/http";

export type ChatTurnRequest = {
  conversationId: string;
  presetId: string;
  text: string;
  attachmentIds: string[];
};

export async function* streamChat(input: ChatTurnRequest, signal?: AbortSignal): AsyncGenerator<string> {
  const response = await fetch("/api/chat", {
    ...jsonInit(input),
    signal,
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiRequestError(payload.error ?? "模型请求失败。", response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}
