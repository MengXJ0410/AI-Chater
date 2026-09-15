import { describe, expect, it } from "vitest";
import {
  AgentToolValidationError,
  BUILT_IN_AGENT_TOOL_NAMES,
  agentToolRegistry,
  registerBuiltInAgentTools,
} from "@/server/agent";
import { calculateTool, evaluateExpression } from "@/server/agent/tools/calculate";
import { currentTimeTool } from "@/server/agent/tools/current-time";

const context = {
  requestId: "request-1",
  userId: "user-1",
  toolCallId: "tool-call-1",
  abortSignal: new AbortController().signal,
};

describe("calculate tool", () => {
  it("evaluates arithmetic with precedence and parentheses", async () => {
    await expect(Promise.resolve(calculateTool.execute({ expression: "1 + 2 * (3 ^ 2)" }, context))).resolves.toEqual({ expression: "1 + 2 * (3 ^ 2)", result: 19 });
  });

  it("supports functions and constants", () => {
    expect(evaluateExpression("max(2, sqrt(16), pi)")).toBe(4);
    expect(evaluateExpression("sqrt(16) + pi")).toBeCloseTo(4 + Math.PI);
    expect(evaluateExpression("round(2.6) + abs(-3)")).toBe(6);
    expect(evaluateExpression("min(1, 2, 3) + pow(2, 3)")).toBe(9);
  });

  it("rejects invalid expressions and division by zero", () => {
    expect(() => evaluateExpression("1 +")).toThrow(AgentToolValidationError);
    expect(() => evaluateExpression("2 / 0")).toThrow(AgentToolValidationError);
    expect(() => evaluateExpression("alert(1)")).toThrow(AgentToolValidationError);
    expect(() => evaluateExpression("1 + 2)")).toThrow(AgentToolValidationError);
  });
});

describe("current_time tool", () => {
  it("returns the requested timezone", async () => {
    const output = await currentTimeTool.execute({ timezone: "Asia/Tokyo" }, context);
    expect(output.timezone).toBe("Asia/Tokyo");
    expect(Number.isInteger(output.unixMs)).toBe(true);
    expect(Math.abs(new Date(output.iso).getTime() - output.unixMs)).toBeLessThan(5);
    expect(output.local.length).toBeGreaterThan(0);
  });

  it("falls back to the host timezone", async () => {
    const output = await currentTimeTool.execute({}, context);
    expect(output.timezone.length).toBeGreaterThan(0);
  });

  it("rejects an invalid timezone", () => {
    expect(() => currentTimeTool.execute({ timezone: "Not/AZone" }, context)).toThrow(AgentToolValidationError);
  });
});

describe("built-in registration", () => {
  it("registers all built-ins idempotently as read-only tools", () => {
    registerBuiltInAgentTools(agentToolRegistry);
    registerBuiltInAgentTools(agentToolRegistry);
    for (const name of BUILT_IN_AGENT_TOOL_NAMES) {
      expect(agentToolRegistry.get(name)?.effect).toBe("read");
    }
    expect(BUILT_IN_AGENT_TOOL_NAMES).toEqual(["current_time", "calculate"]);
  });
});
