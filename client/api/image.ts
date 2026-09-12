import { jsonInit, requestJson, requestVoid } from "@/client/api/http";
import type { ImageGenerationResponse } from "@/client/image/generation-client";

export type ImageGeneration = ImageGenerationResponse["generation"];

export type CreateImageGenerationInput = {
  requestId: string;
  conversationId: string;
  imagePresetId: string;
  prompt: string;
  referenceAttachmentIds: string[];
  aspectRatio: string;
  resolution: string;
  quality: string;
  source: "image-mode";
};

export async function createImageGeneration(input: CreateImageGenerationInput, signal?: AbortSignal): Promise<ImageGeneration> {
  const data = await requestJson<ImageGenerationResponse>("/api/image-generations", { ...jsonInit(input), signal }, "生图请求失败，请稍后重试。");
  return data.generation;
}

export async function getImageGeneration(id: string, signal?: AbortSignal): Promise<ImageGeneration> {
  const data = await requestJson<ImageGenerationResponse>(`/api/image-generations/${id}`, { signal }, "生图请求失败，请稍后重试。");
  return data.generation;
}

export async function cancelImageGeneration(id: string): Promise<void> {
  await requestVoid(`/api/image-generations/${id}`, { method: "DELETE" }, "取消生图失败。");
}
