import { z } from "zod";
import { AgentToolValidationError } from "../errors";
import { defineAgentTool } from "../registry";

const MAX_EXPRESSION_LENGTH = 200;
const MAX_DEPTH = 32;

function invalid(message: string) {
  return new AgentToolValidationError("TOOL_INPUT_INVALID", `表达式无效：${message}`);
}

type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "identifier"; value: string };

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const FUNCTIONS: Record<string, { arity: number | "variadic"; run: (args: number[]) => number }> = {
  sqrt: { arity: 1, run: ([value]) => Math.sqrt(value) },
  abs: { arity: 1, run: ([value]) => Math.abs(value) },
  round: { arity: 1, run: ([value]) => Math.round(value) },
  floor: { arity: 1, run: ([value]) => Math.floor(value) },
  ceil: { arity: 1, run: ([value]) => Math.ceil(value) },
  pow: { arity: 2, run: ([base, exponent]) => base ** exponent },
  min: { arity: "variadic", run: (args) => Math.min(...args) },
  max: { arity: "variadic", run: (args) => Math.max(...args) },
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const character = input[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(character)) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(input.slice(index));
      if (!match) throw invalid("无法解析数字。");
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw invalid("数字超出范围。");
      tokens.push({ type: "number", value });
      index += match[0].length;
      continue;
    }
    if ("+-*/%^".includes(character)) {
      tokens.push({ type: "operator", value: character });
      index += 1;
      continue;
    }
    if (character === ",") {
      tokens.push({ type: "operator", value: "," });
      index += 1;
      continue;
    }
    if (character === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }
    if (/[a-zA-Z_]/.test(character)) {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(input.slice(index))!;
      tokens.push({ type: "identifier", value: match[0].toLowerCase() });
      index += match[0].length;
      continue;
    }
    throw invalid(`包含不支持的字符“${character}”。`);
  }
  return tokens;
}

function evaluateTokens(tokens: Token[]): number {
  let position = 0;

  function guardDepth(depth: number) {
    if (depth > MAX_DEPTH) throw invalid("嵌套层级过深。");
  }

  function parseExpression(depth: number): number {
    guardDepth(depth);
    let value = parseTerm(depth + 1);
    while (true) {
      const token = tokens[position];
      if (token?.type !== "operator" || (token.value !== "+" && token.value !== "-")) break;
      position += 1;
      const right = parseTerm(depth + 1);
      value = token.value === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(depth: number): number {
    guardDepth(depth);
    let value = parsePower(depth + 1);
    while (true) {
      const token = tokens[position];
      if (token?.type !== "operator" || (token.value !== "*" && token.value !== "/" && token.value !== "%")) break;
      position += 1;
      const right = parsePower(depth + 1);
      if ((token.value === "/" || token.value === "%") && right === 0) throw invalid("除数不能为 0。");
      value = token.value === "*" ? value * right : token.value === "/" ? value / right : value % right;
    }
    return value;
  }

  function parsePower(depth: number): number {
    guardDepth(depth);
    const base = parseUnary(depth + 1);
    const token = tokens[position];
    if (token?.type === "operator" && token.value === "^") {
      position += 1;
      return base ** parsePower(depth + 1);
    }
    return base;
  }

  function parseUnary(depth: number): number {
    guardDepth(depth);
    const token = tokens[position];
    if (token?.type === "operator" && (token.value === "-" || token.value === "+")) {
      position += 1;
      const value = parseUnary(depth + 1);
      return token.value === "-" ? -value : value;
    }
    return parsePrimary(depth + 1);
  }

  function parseFunction(name: string, depth: number): number {
    const definition = FUNCTIONS[name];
    if (!definition) throw invalid(`不支持函数“${name}”。`);
    if (tokens[position]?.type !== "lparen") throw invalid(`函数“${name}”缺少括号。`);
    position += 1;
    const args: number[] = [];
    if (tokens[position]?.type === "rparen") {
      position += 1;
    } else {
      while (true) {
        args.push(parseExpression(depth + 1));
        const separator = tokens[position];
        if (separator?.type === "operator" && separator.value === ",") {
          position += 1;
          continue;
        }
        if (separator?.type === "rparen") {
          position += 1;
          break;
        }
        throw invalid(`函数“${name}”的参数格式无效。`);
      }
    }
    if (definition.arity !== "variadic" && args.length !== definition.arity) {
      throw invalid(`函数“${name}”需要 ${definition.arity} 个参数。`);
    }
    if (definition.arity === "variadic" && args.length === 0) throw invalid(`函数“${name}”至少需要 1 个参数。`);
    return definition.run(args);
  }

  function parsePrimary(depth: number): number {
    guardDepth(depth);
    const token = tokens[position];
    if (!token) throw invalid("表达式不完整。");
    if (token.type === "number") {
      position += 1;
      return token.value;
    }
    if (token.type === "lparen") {
      position += 1;
      const value = parseExpression(depth + 1);
      if (tokens[position]?.type !== "rparen") throw invalid("括号不匹配。");
      position += 1;
      return value;
    }
    if (token.type === "identifier") {
      position += 1;
      if (token.value in FUNCTIONS) return parseFunction(token.value, depth + 1);
      if (token.value in CONSTANTS) return CONSTANTS[token.value];
      throw invalid(`未知标识符“${token.value}”。`);
    }
    throw invalid("意外的符号。");
  }

  const result = parseExpression(0);
  if (position !== tokens.length) throw invalid("包含多余的内容。");
  if (!Number.isFinite(result)) throw invalid("计算结果不是有限数值。");
  return result;
}

export function evaluateExpression(expression: string): number {
  const trimmed = expression.trim();
  if (!trimmed) throw invalid("内容为空。");
  if (trimmed.length > MAX_EXPRESSION_LENGTH) throw invalid(`长度不能超过 ${MAX_EXPRESSION_LENGTH} 个字符。`);
  return evaluateTokens(tokenize(trimmed));
}

export const calculateTool = defineAgentTool({
  name: "calculate",
  description: "计算数学表达式，支持 + - * / % ^、括号、常量 pi 和 e，以及 sqrt/abs/round/floor/ceil/pow/min/max 函数。",
  inputSchema: z.object({ expression: z.string().trim().min(1).max(MAX_EXPRESSION_LENGTH) }).strict(),
  outputSchema: z.object({ expression: z.string(), result: z.number() }).strict(),
  effect: "read",
  timeoutMs: 2_000,
  execute: ({ expression }) => ({ expression, result: evaluateExpression(expression) }),
});
