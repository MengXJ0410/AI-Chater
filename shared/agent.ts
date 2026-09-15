export type AgentRunEvent = {
  type: string;
  requestId: string;
  timestamp: string;
  stepNumber?: number;
  toolName?: string;
  toolCallId?: string;
  durationMs?: number;
  finishReason?: string;
  toolNames?: string[];
  errorCode?: string;
};

export type AgentStreamChunk =
  | { type: "event"; event: AgentRunEvent }
  | { type: "text"; text: string }
  | { type: "done"; steps: number; finishReason: string }
  | { type: "error"; code: string; message: string };
