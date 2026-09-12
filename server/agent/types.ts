import type { FinishReason, LanguageModel, LanguageModelUsage, ModelMessage } from "ai";
import type { z } from "zod";
import type { AgentErrorCode } from "./errors";

export const AGENT_LIMITS = {
  maxSteps: 6,
  toolTimeoutMs: 10_000,
  totalTimeoutMs: 60_000,
  maxToolResultBytes: 64 * 1024,
} as const;

export type AgentLimits = {
  maxSteps: number;
  toolTimeoutMs: number;
  totalTimeoutMs: number;
  maxToolResultBytes: number;
};

export type AgentExecutionContext = {
  requestId: string;
  userId: string;
  conversationId?: string;
};

export type AgentToolEffect = "read" | "side-effect";

export type AgentToolExecutionContext = AgentExecutionContext & {
  abortSignal: AbortSignal;
  toolCallId: string;
};

export type AgentToolDefinition<INPUT = unknown, OUTPUT = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<INPUT>;
  outputSchema: z.ZodType<OUTPUT>;
  effect: AgentToolEffect;
  timeoutMs?: number;
  execute: (input: INPUT, context: AgentToolExecutionContext) => OUTPUT | PromiseLike<OUTPUT>;
};

type AgentEventBase = {
  requestId: string;
  timestamp: string;
};

export type AgentExecutionEvent =
  | AgentEventBase & { type: "agent.started" }
  | AgentEventBase & { type: "agent.completed"; steps: number; durationMs: number }
  | AgentEventBase & { type: "agent.failed"; errorCode: AgentErrorCode; durationMs: number }
  | AgentEventBase & { type: "agent.cancelled"; durationMs: number }
  | AgentEventBase & { type: "step.started"; stepNumber: number }
  | AgentEventBase & { type: "step.completed"; stepNumber: number; finishReason: string; toolNames: string[] }
  | AgentEventBase & { type: "tool.started"; toolName: string; toolCallId: string }
  | AgentEventBase & { type: "tool.completed"; toolName: string; toolCallId: string; durationMs: number; resultBytes: number }
  | AgentEventBase & { type: "tool.failed"; toolName: string; toolCallId: string; durationMs: number; errorCode: AgentErrorCode };

export type AgentToolExecutionRecord = {
  toolName: string;
  toolCallId: string;
  status: "completed" | "failed";
  durationMs: number;
  resultBytes?: number;
  errorCode?: AgentErrorCode;
};

export type AgentStepSummary = {
  stepNumber: number;
  finishReason: string;
  toolNames: string[];
};

export type AgentRunResult = {
  text: string;
  finishReason: FinishReason;
  usage: LanguageModelUsage;
  steps: AgentStepSummary[];
  toolExecutions: AgentToolExecutionRecord[];
};

export type AgentRunOptions = {
  model: LanguageModel;
  messages: ModelMessage[];
  instructions?: string;
  registry: import("./registry").AgentToolRegistry;
  allowedToolNames: string[];
  context: AgentExecutionContext;
  limits?: Partial<AgentLimits>;
  abortSignal?: AbortSignal;
  onEvent?: (event: AgentExecutionEvent) => void | Promise<void>;
};

export type AgentStreamHandle = {
  textStream: AsyncIterable<string>;
  result: Promise<AgentRunResult>;
};
