import { z } from "zod";
import { AgentToolValidationError } from "../errors";
import { defineAgentTool } from "../registry";

export const currentTimeTool = defineAgentTool({
  name: "current_time",
  description: "获取当前时间，可指定 IANA 时区（例如 Asia/Shanghai）。返回 ISO 时间、本地化文本与 Unix 毫秒。",
  inputSchema: z.object({ timezone: z.string().trim().min(1).max(64).optional() }).strict(),
  outputSchema: z.object({
    timezone: z.string(),
    iso: z.string(),
    local: z.string(),
    unixMs: z.number().int(),
  }).strict(),
  effect: "read",
  timeoutMs: 2_000,
  execute: ({ timezone }) => {
    const resolved = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    const now = new Date();
    let local: string;
    try {
      local = new Intl.DateTimeFormat("zh-CN", { timeZone: resolved, dateStyle: "full", timeStyle: "long" }).format(now);
    } catch {
      throw new AgentToolValidationError("TOOL_INPUT_INVALID", `无效的时区：${resolved}`);
    }
    return { timezone: resolved, iso: now.toISOString(), local, unixMs: now.getTime() };
  },
});
