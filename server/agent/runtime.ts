import { InvalidToolInputError, ToolLoopAgent, isStepCount, type ToolSet } from "ai";
import {
  AgentCancelledError,
  AgentConfigurationError,
  AgentExecutionError,
  AgentRuntimeError,
  AgentTimeoutError,
  AgentToolValidationError,
  agentErrorCode,
} from "./errors";
import type { AgentToolRegistry } from "./registry";
import {
  AGENT_LIMITS,
  type AgentExecutionEvent,
  type AgentLimits,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentStepSummary,
  type AgentStreamHandle,
  type AgentToolExecutionRecord,
} from "./types";

type RuntimeState = {
  startedAt: number;
  totalTimeoutSignal: AbortSignal;
  internalController: AbortController;
  toolFailure?: AgentRuntimeError;
  toolExecutions: AgentToolExecutionRecord[];
};

function resolveLimits(input: Partial<AgentLimits> | undefined): AgentLimits {
  const limits = { ...AGENT_LIMITS, ...input };
  for (const [name, value] of Object.entries(limits)) {
    const maximum = AGENT_LIMITS[name as keyof AgentLimits];
    if (!Number.isInteger(value) || value < 1 || value > maximum) {
      throw new AgentConfigurationError(`${name} 必须是 1-${maximum} 之间的整数。`);
    }
  }
  return limits;
}

function validateOptions(options: AgentRunOptions) {
  if (!options.context.requestId.trim()) throw new AgentConfigurationError("Agent requestId 不能为空。");
  if (!options.context.userId.trim()) throw new AgentConfigurationError("Agent userId 不能为空。");
  if (!options.messages.length) throw new AgentConfigurationError("Agent 至少需要一条消息。");
  if (!Array.isArray(options.allowedToolNames)) throw new AgentConfigurationError("allowedToolNames 必须是数组。");
}

async function emit(options: AgentRunOptions, event: AgentExecutionEvent) {
  await options.onEvent?.(event);
}

function eventBase(options: AgentRunOptions) {
  return { requestId: options.context.requestId, timestamp: new Date().toISOString() };
}

function summarizeSteps(steps: Array<{ finishReason: string; toolCalls: Array<{ toolName: string }> }>): AgentStepSummary[] {
  return steps.map((step, index) => ({
    stepNumber: index,
    finishReason: step.finishReason,
    toolNames: step.toolCalls.map((call) => call.toolName),
  }));
}

function normalizeError(error: unknown, options: AgentRunOptions, state: RuntimeState) {
  if (state.toolFailure) return state.toolFailure;
  if (options.abortSignal?.aborted) return new AgentCancelledError("Agent 执行已取消。");
  if (state.totalTimeoutSignal.aborted) return new AgentTimeoutError("Agent 执行超过总时间限制。");
  if (error instanceof AgentRuntimeError) return error;
  if (InvalidToolInputError.isInstance(error)) return new AgentToolValidationError("TOOL_INPUT_INVALID", "模型生成了无效的工具输入。");
  return new AgentExecutionError("Agent 执行失败。");
}

function createAgent(
  options: AgentRunOptions,
  registry: AgentToolRegistry,
  limits: AgentLimits,
  state: RuntimeState,
  abortSignal: AbortSignal,
) {
  const tools = registry.toToolSet({
    allowedToolNames: options.allowedToolNames,
    context: options.context,
    limits,
    abortSignal,
    cancelSignal: options.abortSignal,
    totalTimeoutSignal: state.totalTimeoutSignal,
    onEvent: options.onEvent,
    onRecord: (record) => state.toolExecutions.push(record),
    onFailure: (error) => {
      if (!state.toolFailure) {
        state.toolFailure = error;
        state.internalController.abort(error);
      }
    },
  });
  return new ToolLoopAgent<never, ToolSet, typeof options.context>({
    model: options.model,
    instructions: options.instructions,
    runtimeContext: options.context,
    tools,
    maxRetries: 0,
    stopWhen: isStepCount(limits.maxSteps),
  });
}

function initialize(options: AgentRunOptions) {
  validateOptions(options);
  const limits = resolveLimits(options.limits);
  const internalController = new AbortController();
  const totalTimeoutSignal = AbortSignal.timeout(limits.totalTimeoutMs);
  const signals = [internalController.signal, totalTimeoutSignal, ...(options.abortSignal ? [options.abortSignal] : [])];
  const abortSignal = AbortSignal.any(signals);
  const state: RuntimeState = { startedAt: Date.now(), totalTimeoutSignal, internalController, toolExecutions: [] };
  const agent = createAgent(options, options.registry, limits, state, abortSignal);
  return { limits, state, abortSignal, agent };
}

function runtimeCallbacks(options: AgentRunOptions) {
  return {
    onStepStart: async ({ stepNumber }: { stepNumber: number }) => {
      await emit(options, { ...eventBase(options), type: "step.started", stepNumber });
    },
    onStepEnd: async ({ stepNumber, finishReason, toolCalls }: { stepNumber: number; finishReason: string; toolCalls: Array<{ toolName: string }> }) => {
      await emit(options, { ...eventBase(options), type: "step.completed", stepNumber, finishReason, toolNames: toolCalls.map((call) => call.toolName) });
    },
  };
}

async function completeResult(
  options: AgentRunOptions,
  state: RuntimeState,
  result: { text: string; finishReason: AgentRunResult["finishReason"]; usage: AgentRunResult["usage"]; steps: Array<{ finishReason: string; toolCalls: Array<{ toolName: string }> }> },
) {
  const completed: AgentRunResult = {
    text: result.text,
    finishReason: result.finishReason,
    usage: result.usage,
    steps: summarizeSteps(result.steps),
    toolExecutions: [...state.toolExecutions],
  };
  await emit(options, { ...eventBase(options), type: "agent.completed", steps: completed.steps.length, durationMs: Date.now() - state.startedAt });
  return completed;
}

async function fail(options: AgentRunOptions, state: RuntimeState, error: unknown): Promise<never> {
  const normalized = normalizeError(error, options, state);
  if (normalized instanceof AgentCancelledError) {
    await emit(options, { ...eventBase(options), type: "agent.cancelled", durationMs: Date.now() - state.startedAt });
  } else {
    await emit(options, { ...eventBase(options), type: "agent.failed", errorCode: agentErrorCode(normalized), durationMs: Date.now() - state.startedAt });
  }
  throw normalized;
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  let initialized: ReturnType<typeof initialize> | undefined;
  try {
    const current = initialize(options);
    initialized = current;
    await emit(options, { ...eventBase(options), type: "agent.started" });
    const result = await current.agent.generate({
      messages: options.messages,
      abortSignal: current.abortSignal,
      timeout: { totalMs: current.limits.totalTimeoutMs, toolMs: current.limits.toolTimeoutMs },
      ...runtimeCallbacks(options),
    });
    if (current.state.toolFailure) throw current.state.toolFailure;
    return completeResult(options, current.state, result);
  } catch (error) {
    if (!initialized) throw error;
    return fail(options, initialized.state, error);
  }
}

export async function streamAgent(options: AgentRunOptions): Promise<AgentStreamHandle> {
  let initialized: ReturnType<typeof initialize> | undefined;
  try {
    const current = initialize(options);
    initialized = current;
    await emit(options, { ...eventBase(options), type: "agent.started" });
    const stream = await current.agent.stream({
      messages: options.messages,
      abortSignal: current.abortSignal,
      timeout: { totalMs: current.limits.totalTimeoutMs, toolMs: current.limits.toolTimeoutMs },
      ...runtimeCallbacks(options),
    });
    const { state } = current;
    const result = Promise.all([
      Promise.resolve(stream.text),
      Promise.resolve(stream.finishReason),
      Promise.resolve(stream.usage),
      Promise.resolve(stream.steps),
    ]).then(([text, finishReason, usage, steps]) => {
      if (state.toolFailure) throw state.toolFailure;
      return completeResult(options, state, { text, finishReason, usage, steps });
    })
      .catch((error) => fail(options, state, error));
    return { textStream: stream.textStream, result };
  } catch (error) {
    if (!initialized) throw error;
    return fail(options, initialized.state, error);
  }
}
