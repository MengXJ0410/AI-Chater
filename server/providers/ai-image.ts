import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { generateImage } from "ai";
import { assertSafeResolvedRequestUrl } from "@/server/services/user-ai-config";
import type { ImageConnection } from "@/server/services/image-config";

const MAX_PROVIDER_IMAGE_BYTES = 20 * 1024 * 1024;

const SIZE_BY_RATIO: Record<string, `${number}x${number}`> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
  "4:3": "1365x1024",
  "3:4": "1024x1365",
  "4:5": "1024x1280",
  "5:4": "1280x1024",
  "16:9": "1536x864",
  "9:16": "864x1536",
  "2:1": "1536x768",
  "1:2": "768x1536",
};

function outputHosts() {
  const raw = process.env.USER_IMAGE_ALLOWED_OUTPUT_HOSTS;
  if (!raw) return new Set<string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("USER_IMAGE_ALLOWED_OUTPUT_HOSTS 必须是 JSON 数组。");
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new Error("USER_IMAGE_ALLOWED_OUTPUT_HOSTS 必须是主机名字符串数组。");
  }
  return new Set(parsed.map((host) => host.toLowerCase()));
}

async function downloadOutput(url: string, baseUrl: string, signal?: AbortSignal) {
  await assertSafeResolvedRequestUrl(url);
  const target = new URL(url);
  const base = new URL(baseUrl);
  if (target.protocol !== "https:" || (target.hostname !== base.hostname && !outputHosts().has(target.hostname.toLowerCase()))) {
    throw new Error("Provider 返回了未授权的图片地址。");
  }
  const response = await fetch(target, { signal, redirect: "error" });
  if (!response.ok) throw new Error("Provider 图片下载失败。");
  const announced = Number(response.headers.get("content-length") ?? 0);
  if (announced > MAX_PROVIDER_IMAGE_BYTES) throw new Error("Provider 图片超过大小限制。");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_PROVIDER_IMAGE_BYTES) throw new Error("Provider 图片大小无效。");
  return Buffer.from(bytes).toString("base64");
}

function createImageFetch(baseUrl: string): typeof fetch {
  return async (input, init) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    await assertSafeResolvedRequestUrl(requestUrl);
    const response = await fetch(input, { ...init, redirect: "error" });
    const pathname = new URL(requestUrl).pathname;
    if (!response.ok || (!pathname.endsWith("/images/generations") && !pathname.endsWith("/images/edits"))) return response;

    const payload = await response.clone().json().catch(() => null) as { data?: Array<{ url?: string | null; b64_json?: string | null }> } | null;
    if (!payload?.data?.some((item) => item.url && !item.b64_json)) return response;
    const data = await Promise.all(payload.data.map(async (item) => item.b64_json
      ? item
      : item.url
        ? { ...item, b64_json: await downloadOutput(item.url, baseUrl, init?.signal ?? undefined) }
        : item));
    return new Response(JSON.stringify({ ...payload, data }), {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function getImageModel(connection: ImageConnection) {
  const providerFetch = createImageFetch(connection.baseUrl);
  if (connection.provider === "xai-compatible") {
    return createXai({ apiKey: connection.apiKey, baseURL: connection.baseUrl, fetch: providerFetch }).image(connection.model);
  }
  return createOpenAICompatible({ name: "configured-image", apiKey: connection.apiKey, baseURL: connection.baseUrl, fetch: providerFetch }).imageModel(connection.model);
}

export async function generateConfiguredImage(
  connection: ImageConnection,
  input: { prompt: string; aspectRatio: string; resolution: "1k" | "2k"; quality: "low" | "medium" | "high" },
  abortSignal: AbortSignal,
) {
  const result = await generateImage({
    model: getImageModel(connection),
    prompt: input.prompt,
    n: 1,
    maxImagesPerCall: 1,
    maxRetries: 0,
    abortSignal,
    ...(connection.provider === "xai-compatible"
      ? {
          aspectRatio: input.aspectRatio as `${number}:${number}`,
          providerOptions: { xai: { resolution: input.resolution, quality: input.quality } },
        }
      : { size: SIZE_BY_RATIO[input.aspectRatio] ?? "1024x1024" }),
  });
  if (result.images.length !== 1) throw new Error("Provider 未返回有效图片。");
  return { bytes: result.image.uint8Array, mediaType: result.image.mediaType, warnings: result.warnings.map((warning) => warning.type) };
}

export function logImageError(error: unknown, metadata: Record<string, string | undefined> = {}) {
  const statusCode = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
    ? String(error.statusCode)
    : undefined;
  console.error("AI image request failed", { ...metadata, name: error instanceof Error ? error.name : typeof error, statusCode });
}
