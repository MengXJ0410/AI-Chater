import { jsonInit, requestJson } from "@/client/api/http";
import type { VideoGeneration, VideoGenerationRequest } from "@/client/video/generation-client";

export async function createVideoGeneration(input: VideoGenerationRequest): Promise<VideoGeneration> {
  const data = await requestJson<{ generation: VideoGeneration }>("/api/video-generations", jsonInit(input), "提交失败。");
  return data.generation;
}

export async function getVideoGeneration(id: string): Promise<VideoGeneration> {
  const data = await requestJson<{ generation: VideoGeneration }>(`/api/video-generations/${id}`, undefined, "读取视频任务失败。");
  return data.generation;
}

export async function cancelVideoGeneration(id: string): Promise<VideoGeneration> {
  const data = await requestJson<{ generation: VideoGeneration }>(`/api/video-generations/${id}`, { method: "DELETE" }, "取消视频任务失败。");
  return data.generation;
}
