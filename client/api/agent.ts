import { ApiRequestError, jsonInit } from "@/client/api/http";
import type { AgentStreamChunk } from "@/shared/agent";

export type AgentRunRequest = {
  conversationId: string;
  presetId: string;
  text: string;
};

export async function* streamAgentRun(input: AgentRunRequest, signal?: AbortSignal): AsyncGenerator<AgentStreamChunk> {
  const response = await fetch("/api/agent/runs", {
    ...jsonInit(input),
    signal,
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiRequestError(payload.error ?? "Agent 请求失败。", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as AgentStreamChunk;
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail) yield JSON.parse(tail) as AgentStreamChunk;
}
