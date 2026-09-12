import { ApiRequestError, requestJson } from "@/client/api/http";

export async function launchCompanion(): Promise<{ ticket: string; target: string }> {
  const data = await requestJson<{ ticket?: string; target?: string; error?: string }>("/api/companion/launch", { method: "POST" }, "Companion 启动票据创建失败。");
  if (!data.ticket) throw new ApiRequestError(data.error ?? "Companion 启动票据创建失败。", 500);
  return { ticket: data.ticket, target: data.target ?? "" };
}
