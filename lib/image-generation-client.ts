export type ImageCapabilities = {
  aspectRatios: string[];
  resolutions: string[];
  qualities: string[];
  maxImages: number;
  supportsImageEdit: boolean;
};

export type ImagePreset = {
  id: string;
  label: string;
  provider?: string;
  model: string;
  capabilities: ImageCapabilities;
};

export type GeneratedImage = {
  attachmentId: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
};

export type ImageGenerationResponse = {
  generation: {
    id: string;
    status: "queued" | "running" | "cancel_requested" | "completed" | "failed" | "cancelled";
    model?: string;
    prompt?: string;
    errorCode?: string | null;
    images?: GeneratedImage[];
    attachments?: Array<{ id: string; url: string; mimeType: string; width?: number; height?: number }>;
    warnings?: string[];
  };
};

export type ImageGenerationDraft = {
  prompt: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  count: number;
  referenceAttachmentIds: string[];
};

export function normalizeImageCapabilities(value: Partial<ImageCapabilities> | undefined): ImageCapabilities {
  return {
    aspectRatios: Array.isArray(value?.aspectRatios) ? value!.aspectRatios.filter((item): item is string => typeof item === "string") : [],
    resolutions: Array.isArray(value?.resolutions) ? value!.resolutions.filter((item): item is string => typeof item === "string") : [],
    qualities: Array.isArray(value?.qualities) ? value!.qualities.filter((item): item is string => typeof item === "string") : [],
    maxImages: Math.min(4, Math.max(1, Number.isFinite(value?.maxImages) ? Number(value?.maxImages) : 1)),
    supportsImageEdit: value?.supportsImageEdit === true,
  };
}

export function normalizeImagePreset(value: Record<string, unknown>): ImagePreset | null {
  if (typeof value.id !== "string" || typeof value.label !== "string" || typeof value.model !== "string") return null;
  const nested = value.capabilities && typeof value.capabilities === "object" ? value.capabilities as Partial<ImageCapabilities> : value as Partial<ImageCapabilities>;
  return { id: value.id, label: value.label, model: value.model, provider: typeof value.provider === "string" ? value.provider : undefined, capabilities: normalizeImageCapabilities(nested) };
}

export function imagesFromGeneration(generation: ImageGenerationResponse["generation"]): GeneratedImage[] {
  if (Array.isArray(generation.images)) return generation.images;
  return (generation.attachments ?? []).map((item) => ({ attachmentId: item.id, url: item.url, mimeType: item.mimeType, width: item.width, height: item.height }));
}

export function getImageRequestError(status: number, message?: string) {
  if (message) return message;
  if (status === 404) return "生图服务尚未接入，请等待后端接口完成。";
  return "生图请求失败，请稍后重试。";
}

export function getImageGenerationFailureMessage(errorCode?: string | null) {
  const messages: Record<string, string> = {
    UPSTREAM_AUTH: "图片模型认证失败，请检查生图配置和 API Key。",
    UPSTREAM_RATE_LIMIT: "图片服务请求过于频繁，请稍后重试。",
    UPSTREAM_TIMEOUT: "图片服务响应超时，请稍后重试。",
    UPSTREAM_FAILED: "图片服务生成失败，请稍后重试。",
    OUTPUT_INVALID: "图片服务返回了无效结果，请检查模型是否支持生图。",
    WORKER_INTERRUPTED: "生图 worker 已中断，请稍后重新提交任务。",
    CONFIG_MISSING: "生图配置已失效，请重新保存配置。",
  };
  return errorCode && messages[errorCode] ? messages[errorCode] : "生图任务失败，请检查模型配置后重试。";
}
