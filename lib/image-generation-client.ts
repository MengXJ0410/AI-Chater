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
  if (status === 404) return "生图服务尚未接入，请等待后端接口完成。";
  return message || "生图请求失败，请稍后重试。";
}
