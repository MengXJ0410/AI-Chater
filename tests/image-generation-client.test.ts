import { describe, expect, it } from "vitest";
import { getImageGenerationFailureMessage, getImageRequestError, normalizeImageCapabilities } from "@/lib/image-generation-client";

describe("image generation client", () => {
  it("normalizes server capabilities without inventing unsupported options", () => {
    expect(normalizeImageCapabilities({ aspectRatios: ["1:1", "16:9"], resolutions: ["1k"], qualities: ["high"], maxImages: 8, supportsImageEdit: true })).toEqual({
      aspectRatios: ["1:1", "16:9"], resolutions: ["1k"], qualities: ["high"], maxImages: 4, supportsImageEdit: true,
    });
    expect(normalizeImageCapabilities(undefined)).toEqual({ aspectRatios: [], resolutions: [], qualities: [], maxImages: 1, supportsImageEdit: false });
  });

  it("uses a clear unavailable message for missing backend endpoints", () => {
    expect(getImageRequestError(404)).toContain("尚未接入");
    expect(getImageRequestError(400, "提示词不能为空")).toBe("提示词不能为空");
    expect(getImageRequestError(404, "任务不存在。")).toBe("任务不存在。");
  });

  it("maps sanitized generation error codes to actionable frontend messages", () => {
    expect(getImageGenerationFailureMessage("UPSTREAM_AUTH")).toContain("API Key");
    expect(getImageGenerationFailureMessage("WORKER_INTERRUPTED")).toContain("worker");
    expect(getImageGenerationFailureMessage("UNKNOWN")).toContain("生图任务失败");
  });
});
