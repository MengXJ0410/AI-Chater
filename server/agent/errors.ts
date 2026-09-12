export type AgentErrorCode =
  | "AGENT_CONFIGURATION"
  | "AGENT_POLICY"
  | "AGENT_CANCELLED"
  | "AGENT_TIMEOUT"
  | "AGENT_EXECUTION"
  | "TOOL_INPUT_INVALID"
  | "TOOL_OUTPUT_INVALID"
  | "TOOL_RESULT_TOO_LARGE"
  | "TOOL_EXECUTION_FAILED";

export class AgentRuntimeError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentRuntimeError";
  }
}

export class AgentConfigurationError extends AgentRuntimeError {
  constructor(message: string, options?: ErrorOptions) {
    super("AGENT_CONFIGURATION", message, options);
    this.name = "AgentConfigurationError";
  }
}

export class AgentPolicyError extends AgentRuntimeError {
  constructor(message: string, options?: ErrorOptions) {
    super("AGENT_POLICY", message, options);
    this.name = "AgentPolicyError";
  }
}

export class AgentCancelledError extends AgentRuntimeError {
  constructor(message = "Agent 执行已取消。", options?: ErrorOptions) {
    super("AGENT_CANCELLED", message, options);
    this.name = "AgentCancelledError";
  }
}

export class AgentTimeoutError extends AgentRuntimeError {
  constructor(message = "Agent 执行超时。", options?: ErrorOptions) {
    super("AGENT_TIMEOUT", message, options);
    this.name = "AgentTimeoutError";
  }
}

export class AgentExecutionError extends AgentRuntimeError {
  constructor(message = "Agent 执行失败。", options?: ErrorOptions) {
    super("AGENT_EXECUTION", message, options);
    this.name = "AgentExecutionError";
  }
}

export class AgentToolValidationError extends AgentRuntimeError {
  constructor(code: "TOOL_INPUT_INVALID" | "TOOL_OUTPUT_INVALID", message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "AgentToolValidationError";
  }
}

export class AgentToolResultTooLargeError extends AgentRuntimeError {
  constructor(message: string, options?: ErrorOptions) {
    super("TOOL_RESULT_TOO_LARGE", message, options);
    this.name = "AgentToolResultTooLargeError";
  }
}

export class AgentToolExecutionError extends AgentRuntimeError {
  constructor(message: string, options?: ErrorOptions) {
    super("TOOL_EXECUTION_FAILED", message, options);
    this.name = "AgentToolExecutionError";
  }
}

export function agentErrorCode(error: unknown): AgentErrorCode {
  return error instanceof AgentRuntimeError ? error.code : "AGENT_EXECUTION";
}
