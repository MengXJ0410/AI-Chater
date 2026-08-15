import { tool, type ToolSet } from "ai";
import {
  AgentCancelledError,
  AgentConfigurationError,
  AgentPolicyError,
  AgentRuntimeError,
  AgentTimeoutError,
  AgentToolExecutionError,
  AgentToolResultTooLargeError,
  AgentToolValidationError,
  agentErrorCode,
} from "./errors";
import {
  AGENT_LIMITS,
  type AgentExecutionContext,
  type AgentExecutionEvent,
  type AgentLimits,
  type AgentToolDefinition,
  type AgentToolExecutionRecord,
} from "./types";

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export type AgentToolSetOptions = {
  allowedToolNames: string[];
  context: AgentExecutionContext;
  limits: AgentLimits;
  abortSignal: AbortSignal;
  cancelSignal?: AbortSignal;
  totalTimeoutSignal?: AbortSignal;
  onEvent?: (event: AgentExecutionEvent) => void | Promise<void>;
  onRecord?: (record: AgentToolExecutionRecord) => void;
  onFailure?: (error: AgentRuntimeError) => void;
};

function nowEvent(context: AgentExecutionContext) {
  return { requestId: context.requestId, timestamp: new Date().toISOString() };
}

async function emit(options: AgentToolSetOptions, event: AgentExecutionEvent) {
  await options.onEvent?.(event);
}

function combineSignals(...signals: Array<AbortSignal | undefined>) {
  return AbortSignal.any(signals.filter((signal): signal is AbortSignal => signal !== undefined));
}

function executeWithSignal<T>(operation: PromiseLike<T> | T, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function serializeResult(value: unknown, toolName: string) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("undefined is not JSON serializable");
    return { serialized, bytes: Buffer.byteLength(serialized, "utf8") };
  } catch (error) {
    void error;
    throw new AgentToolValidationError("TOOL_OUTPUT_INVALID", `工具 ${toolName} 返回了不可序列化的结果。`);
  }
}

export function defineAgentTool<INPUT, OUTPUT>(definition: AgentToolDefinition<INPUT, OUTPUT>): AgentToolDefinition<INPUT, OUTPUT> {
  const name = definition.name.trim();
  const description = definition.description.trim();
  if (!TOOL_NAME_PATTERN.test(name)) throw new AgentConfigurationError("工具名称必须以小写字母开头，且只能包含小写字母、数字和下划线，最长 64 位。");
  if (!description || description.length > 512) throw new AgentConfigurationError("工具描述必须为 1-512 个字符。");
  if (definition.effect !== "read" && definition.effect !== "side-effect") throw new AgentConfigurationError(`工具 ${name} 的风险级别无效。`);
  if (definition.timeoutMs !== undefined && (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 1 || definition.timeoutMs > AGENT_LIMITS.toolTimeoutMs)) {
    throw new AgentConfigurationError(`工具 ${name} 的超时必须在 1-${AGENT_LIMITS.toolTimeoutMs} 毫秒之间。`);
  }
  return Object.freeze({ ...definition, name, description });
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition<unknown, unknown>>();

  register<INPUT, OUTPUT>(definition: AgentToolDefinition<INPUT, OUTPUT>) {
    const normalized = defineAgentTool(definition);
    if (this.tools.has(normalized.name)) throw new AgentConfigurationError(`工具 ${normalized.name} 已注册。`);
    this.tools.set(normalized.name, normalized as AgentToolDefinition<unknown, unknown>);
    return this;
  }

  get(name: string) {
    return this.tools.get(name);
  }

  list() {
    return [...this.tools.values()];
  }

  toToolSet(options: AgentToolSetOptions): ToolSet {
    const selected = [...new Set(options.allowedToolNames)];
    const definitions = selected.map((name) => {
      const definition = this.tools.get(name);
      if (!definition) throw new AgentConfigurationError(`工具 ${name} 未注册。`);
      if (definition.effect === "side-effect") throw new AgentPolicyError(`工具 ${name} 具有副作用，当前版本不允许执行。`);
      return definition;
    });

    const result: ToolSet = {};
    for (const definition of definitions) {
      result[definition.name] = tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        execute: async (input, executionOptions) => {
          const startedAt = Date.now();
          const toolTimeout = AbortSignal.timeout(Math.min(definition.timeoutMs ?? options.limits.toolTimeoutMs, options.limits.toolTimeoutMs));
          const signal = combineSignals(options.abortSignal, executionOptions.abortSignal, toolTimeout);
          await emit(options, { ...nowEvent(options.context), type: "tool.started", toolName: definition.name, toolCallId: executionOptions.toolCallId });
          try {
            const parsedInput = definition.inputSchema.safeParse(input);
            if (!parsedInput.success) throw new AgentToolValidationError("TOOL_INPUT_INVALID", `工具 ${definition.name} 的输入无效。`);
            const output = await executeWithSignal(definition.execute(parsedInput.data, {
              ...options.context,
              abortSignal: signal,
              toolCallId: executionOptions.toolCallId,
            }), signal);
            const parsedOutput = definition.outputSchema.safeParse(output);
            if (!parsedOutput.success) throw new AgentToolValidationError("TOOL_OUTPUT_INVALID", `工具 ${definition.name} 的输出无效。`);
            const { bytes } = serializeResult(parsedOutput.data, definition.name);
            if (bytes > options.limits.maxToolResultBytes) {
              throw new AgentToolResultTooLargeError(`工具 ${definition.name} 的结果超过 ${options.limits.maxToolResultBytes} 字节限制。`);
            }
            const record = { toolName: definition.name, toolCallId: executionOptions.toolCallId, status: "completed" as const, durationMs: Date.now() - startedAt, resultBytes: bytes };
            options.onRecord?.(record);
            await emit(options, { ...nowEvent(options.context), type: "tool.completed", ...record, resultBytes: bytes });
            return parsedOutput.data;
          } catch (cause) {
            const error = cause instanceof AgentRuntimeError
              ? cause
              : toolTimeout.aborted
                ? new AgentTimeoutError(`工具 ${definition.name} 执行超时。`)
                : options.totalTimeoutSignal?.aborted
                  ? new AgentTimeoutError("Agent 执行超过总时间限制。")
                  : options.cancelSignal?.aborted || options.abortSignal.aborted
                    ? new AgentCancelledError("Agent 执行已取消。")
                    : new AgentToolExecutionError(`工具 ${definition.name} 执行失败。`);
            const record = { toolName: definition.name, toolCallId: executionOptions.toolCallId, status: "failed" as const, durationMs: Date.now() - startedAt, errorCode: agentErrorCode(error) };
            options.onRecord?.(record);
            options.onFailure?.(error);
            await emit(options, { ...nowEvent(options.context), type: "tool.failed", ...record, errorCode: record.errorCode });
            throw error;
          }
        },
      });
    }
    return result;
  }
}

export const agentToolRegistry = new AgentToolRegistry();
