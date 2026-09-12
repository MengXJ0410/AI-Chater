import { RequestError } from "@/server/http/errors";
import type { VideoConnection } from "@/server/services/video-config";

export type PromptRewrite = { positive_prompt: string; negative_prompt: string; shot_plan: string; duration_hint: number };

export function parsePromptRewrite(value: unknown): PromptRewrite {
  if (!value || typeof value !== "object") throw new RequestError("H3 返回了无效 JSON。", 502);
  const row = value as Record<string, unknown>;
  if (![row.positive_prompt, row.negative_prompt, row.shot_plan].every((v) => typeof v === "string") || typeof row.duration_hint !== "number") {
    throw new RequestError("H3 返回字段不完整。", 502);
  }
  return row as PromptRewrite;
}

export async function rewriteVideoPrompt(config: VideoConnection, prompt: string, signal: AbortSignal) {
  if (!config.rewriteEnabled) return null;
  if (!config.rewriteBaseUrl || !config.rewriteModel) throw new RequestError("H3 配置不完整。", 502);
  const response = await fetch(`${config.rewriteBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.rewriteApiKey ? { Authorization: `Bearer ${config.rewriteApiKey}` } : {}) },
    body: JSON.stringify({
      model: config.rewriteModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Expand a video prompt without changing intent. Return strict JSON with positive_prompt, negative_prompt, shot_plan, duration_hint. Never emit workflow nodes or executable instructions." },
        { role: "user", content: prompt },
      ],
    }),
    signal,
  });
  if (!response.ok) throw new RequestError("H3 请求失败。", 502);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new RequestError("H3 未返回内容。", 502);
  try {
    return parsePromptRewrite(JSON.parse(content));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("H3 返回了无效 JSON。", 502);
  }
}
