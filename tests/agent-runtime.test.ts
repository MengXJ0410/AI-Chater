import type {
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { simulateReadableStream, type ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AGENT_LIMITS,
  AgentConfigurationError,
  AgentPolicyError,
  AgentToolRegistry,
  agentToolRegistry,
  defineAgentTool,
  runAgent,
  streamAgent,
  type AgentExecutionEvent,
  type AgentRunOptions,
  type AgentToolDefinition,
} from "@/lib/agent";

const modelUsage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

function generateResult(
  content: LanguageModelV4Content[],
  finishReason: "stop" | "tool-calls" = "stop",
): LanguageModelV4GenerateResult {
  return {
    content,
    finishReason: { unified: finishReason, raw: undefined },
    usage: modelUsage,
    warnings: [],
  };
}

function streamResult(chunks: LanguageModelV4StreamPart[]): LanguageModelV4StreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

function echoTool() {
  return defineAgentTool({
    name: "echo_text",
    description: "Return the supplied text.",
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ echoed: z.string() }),
    effect: "read",
    execute: ({ value }) => ({ echoed: value }),
  });
}

function registryWith<INPUT, OUTPUT>(definition: AgentToolDefinition<INPUT, OUTPUT>) {
  return new AgentToolRegistry().register(definition);
}

function toolSetOptions(overrides: Partial<Parameters<AgentToolRegistry["toToolSet"]>[0]> = {}) {
  return {
    allowedToolNames: ["echo_text"],
    context: { requestId: "request-1", userId: "user-1" },
    limits: { ...AGENT_LIMITS },
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

async function executeTool(toolSet: ToolSet, name: string, input: unknown) {
  const selected = toolSet[name] as {
    execute?: (input: unknown, options: {
      toolCallId: string;
      messages: [];
      abortSignal?: AbortSignal;
      context: undefined;
    }) => unknown;
  };
  if (!selected.execute) throw new Error(`Tool ${name} is not executable.`);
  return await selected.execute(input, {
    toolCallId: "tool-call-1",
    messages: [],
    context: undefined,
  });
}

function runOptions(
  model: MockLanguageModelV4,
  registry = new AgentToolRegistry(),
  allowedToolNames: string[] = [],
  overrides: Partial<AgentRunOptions> = {},
): AgentRunOptions {
  return {
    model,
    messages: [{ role: "user", content: "Run the task." }],
    registry,
    allowedToolNames,
    context: { requestId: "request-1", userId: "user-1" },
    ...overrides,
  };
}

describe("Agent tool registry", () => {
  it("starts with an empty production registry", () => {
    expect(agentToolRegistry.list()).toEqual([]);
    expect(new AgentToolRegistry().list()).toEqual([]);
  });

  it("normalizes and registers valid tools", () => {
    const registry = new AgentToolRegistry();
    const tool = defineAgentTool({
      ...echoTool(),
      description: "  Return text.  ",
    });

    expect(registry.register(tool)).toBe(registry);
    expect(registry.get("echo_text")?.description).toBe("Return text.");
    expect(registry.list()).toHaveLength(1);
  });

  it("rejects invalid and duplicate names", () => {
    expect(() => defineAgentTool({ ...echoTool(), name: "Echo-Text" })).toThrow(AgentConfigurationError);

    const registry = registryWith(echoTool());
    expect(() => registry.register(echoTool())).toThrow(/已注册/);
  });

  it("rejects unknown tools and fails closed for side effects", () => {
    const sideEffect = defineAgentTool({
      name: "send_message",
      description: "Send a message.",
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ sent: z.boolean() }),
      effect: "side-effect",
      execute: () => ({ sent: true }),
    });
    const registry = registryWith(sideEffect);

    expect(Object.keys(registry.toToolSet(toolSetOptions({ allowedToolNames: [] })))).toEqual([]);
    expect(() => registry.toToolSet(toolSetOptions({ allowedToolNames: ["missing"] }))).toThrow(AgentConfigurationError);
    expect(() => registry.toToolSet(toolSetOptions({ allowedToolNames: ["send_message"] }))).toThrow(AgentPolicyError);
  });

  it("only accepts per-tool timeouts at or below the global ceiling", () => {
    expect(() => defineAgentTool({ ...echoTool(), timeoutMs: AGENT_LIMITS.toolTimeoutMs + 1 })).toThrow(AgentConfigurationError);
  });
});

describe("Agent tool execution", () => {
  it("validates input and output schemas", async () => {
    const inputRegistry = registryWith(echoTool());
    await expect(executeTool(inputRegistry.toToolSet(toolSetOptions()), "echo_text", { value: 1 }))
      .rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });

    const outputRegistry = registryWith(defineAgentTool({
      ...echoTool(),
      outputSchema: z.object({ echoed: z.number() }),
      execute: () => ({ echoed: "wrong" }) as unknown as { echoed: number },
    }));
    await expect(executeTool(outputRegistry.toToolSet(toolSetOptions()), "echo_text", { value: "ok" }))
      .rejects.toMatchObject({ code: "TOOL_OUTPUT_INVALID" });
  });

  it("enforces the serialized result size limit", async () => {
    const registry = registryWith(defineAgentTool({
      ...echoTool(),
      execute: () => ({ echoed: "x".repeat(100) }),
    }));
    const tools = registry.toToolSet(toolSetOptions({
      limits: { ...AGENT_LIMITS, maxToolResultBytes: 32 },
    }));

    await expect(executeTool(tools, "echo_text", { value: "ok" }))
      .rejects.toMatchObject({ code: "TOOL_RESULT_TOO_LARGE" });
  });

  it("times out a slow tool without retrying it", async () => {
    let calls = 0;
    const registry = registryWith(defineAgentTool({
      ...echoTool(),
      timeoutMs: 5,
      execute: async () => {
        calls += 1;
        await new Promise(() => undefined);
        return { echoed: "never" };
      },
    }));

    await expect(executeTool(registry.toToolSet(toolSetOptions()), "echo_text", { value: "ok" }))
      .rejects.toMatchObject({ code: "AGENT_TIMEOUT" });
    expect(calls).toBe(1);
  });

  it("propagates caller cancellation to the tool", async () => {
    const controller = new AbortController();
    const registry = registryWith(defineAgentTool({
      ...echoTool(),
      execute: async () => {
        await new Promise(() => undefined);
        return { echoed: "never" };
      },
    }));
    const pending = executeTool(registry.toToolSet(toolSetOptions({
      abortSignal: controller.signal,
      cancelSignal: controller.signal,
    })), "echo_text", { value: "ok" });

    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "AGENT_CANCELLED" });
  });

  it("emits sanitized failures and records no raw input or error", async () => {
    const events: AgentExecutionEvent[] = [];
    const registry = registryWith(defineAgentTool({
      ...echoTool(),
      execute: () => {
        throw new Error("secret-key-and-payload");
      },
    }));
    const tools = registry.toToolSet(toolSetOptions({ onEvent: (event) => { events.push(event); } }));

    const error = await executeTool(tools, "echo_text", { value: "secret-input" }).catch((caught) => caught);
    expect(error).toMatchObject({ code: "TOOL_EXECUTION_FAILED" });
    expect(String(error)).not.toContain("secret");
    expect(JSON.stringify(events)).not.toContain("secret");
    expect(events.map((event) => event.type)).toEqual(["tool.started", "tool.failed"]);
  });
});

describe("Agent runtime", () => {
  it("executes a model-driven tool loop and returns summaries", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        generateResult([{
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "echo_text",
          input: JSON.stringify({ value: "hello" }),
        }], "tool-calls"),
        generateResult([{ type: "text", text: "The tool returned hello." }]),
      ],
    });
    const registry = registryWith(echoTool());
    const events: AgentExecutionEvent[] = [];

    const result = await runAgent(runOptions(model, registry, ["echo_text"], {
      onEvent: (event) => { events.push(event); },
    }));

    expect(result.text).toBe("The tool returned hello.");
    expect(result.finishReason).toBe("stop");
    expect(result.steps).toEqual([
      { stepNumber: 0, finishReason: "tool-calls", toolNames: ["echo_text"] },
      { stepNumber: 1, finishReason: "stop", toolNames: [] },
    ]);
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.toolExecutions[0]).toMatchObject({ toolName: "echo_text", status: "completed" });
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain("hello");
    expect(events.map((event) => event.type)).toEqual([
      "agent.started",
      "step.started",
      "tool.started",
      "tool.completed",
      "step.completed",
      "step.started",
      "step.completed",
      "agent.completed",
    ]);
  });

  it("stops after six model steps", async () => {
    let modelCalls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        modelCalls += 1;
        return generateResult([{
          type: "tool-call",
          toolCallId: `call-${modelCalls}`,
          toolName: "echo_text",
          input: JSON.stringify({ value: String(modelCalls) }),
        }], "tool-calls");
      },
    });

    const result = await runAgent(runOptions(model, registryWith(echoTool()), ["echo_text"]));

    expect(modelCalls).toBe(AGENT_LIMITS.maxSteps);
    expect(result.steps).toHaveLength(AGENT_LIMITS.maxSteps);
    expect(result.toolExecutions).toHaveLength(AGENT_LIMITS.maxSteps);
    expect(result.finishReason).toBe("tool-calls");
  });

  it("rejects attempts to raise a runtime limit", async () => {
    const model = new MockLanguageModelV4({ doGenerate: generateResult([]) });
    await expect(runAgent(runOptions(model, undefined, [], {
      limits: { maxSteps: AGENT_LIMITS.maxSteps + 1 },
    }))).rejects.toThrow(AgentConfigurationError);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("fails the run with a sanitized tool error even if the model ignores abort", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        generateResult([{
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "echo_text",
          input: JSON.stringify({ value: "secret-input" }),
        }], "tool-calls"),
        generateResult([{ type: "text", text: "This must not become success." }]),
      ],
    });
    const registry = registryWith(defineAgentTool({
      ...echoTool(),
      execute: () => {
        throw new Error("secret-upstream-error");
      },
    }));
    const events: AgentExecutionEvent[] = [];

    const error = await runAgent(runOptions(model, registry, ["echo_text"], {
      onEvent: (event) => { events.push(event); },
    })).catch((caught) => caught);

    expect(error).toMatchObject({ code: "TOOL_EXECUTION_FAILED" });
    expect(String(error)).not.toContain("secret");
    expect(events.at(-1)).toMatchObject({ type: "agent.failed", errorCode: "TOOL_EXECUTION_FAILED" });
    expect(events.some((event) => event.type === "agent.completed")).toBe(false);
  });

  it("streams text and resolves an equivalent final result", async () => {
    const chunks: LanguageModelV4StreamPart[] = [
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Hello" },
      { type: "text-delta", id: "text-1", delta: " stream" },
      { type: "text-end", id: "text-1" },
      { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: modelUsage },
    ];
    const model = new MockLanguageModelV4({ doStream: streamResult(chunks) });
    const handle = await streamAgent(runOptions(model));
    let streamed = "";
    for await (const delta of handle.textStream) streamed += delta;
    const result = await handle.result;

    expect(streamed).toBe("Hello stream");
    expect(result.text).toBe(streamed);
    expect(result.finishReason).toBe("stop");
    expect(result.steps).toHaveLength(1);
  });

  it("propagates cancellation through streaming and emits a cancel event", async () => {
    const controller = new AbortController();
    const events: AgentExecutionEvent[] = [];
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(streamController) {
            if (abortSignal?.aborted) {
              streamController.error(abortSignal.reason);
              return;
            }
            abortSignal?.addEventListener("abort", () => streamController.error(abortSignal.reason), { once: true });
          },
        }),
      }),
    });
    const handle = await streamAgent(runOptions(model, undefined, [], {
      abortSignal: controller.signal,
      onEvent: (event) => { events.push(event); },
    }));

    controller.abort();
    await expect(handle.result).rejects.toMatchObject({ code: "AGENT_CANCELLED" });
    expect(events.at(-1)?.type).toBe("agent.cancelled");
  });
});
