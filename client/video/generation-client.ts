import type { VideoMode } from "@/shared/video";

export type { VideoMode } from "@/shared/video";
export type VideoGenerationRequest = { requestId: string; conversationId: string; videoPresetId: string; mode: VideoMode; prompt: string; referenceAttachmentIds: string[]; width: number; height: number; frames: number; fps: number; steps: number; source: "video-mode" };
export type VideoAttachment = { id: string; url: string; mimeType: string; size?: number; duration?: number };
export type VideoGeneration = { id: string; status: "queued" | "running" | "completed" | "failed" | "cancel_requested" | "cancelled"; prompt?: string; rewrittenPrompt?: string | null; negativePrompt?: string | null; shotPlan?: string | null; errorCode?: string | null; attachments?: VideoAttachment[] };
export type VideoGenerationResponse = { generation: VideoGeneration };

export function videoErrorMessage(code?: string | null) {
  const map: Record<string, string> = {
    CONFIG_MISSING: "请先配置 ComfyUI 视频服务。",
    COMFY_UNAVAILABLE: "ComfyUI 服务不可用，请确认已启动。",
    COMFY_TIMEOUT: "视频生成超时，请降低分辨率或帧数。",
    H3_UNAVAILABLE: "MiniMax-H3 提示词服务不可用。",
    OUTPUT_INVALID: "ComfyUI 未返回有效视频。",
    WORKER_INTERRUPTED: "视频 worker 已中断，请重试。",
  };
  return code && map[code] ? map[code] : "视频任务失败，请稍后重试。";
}
