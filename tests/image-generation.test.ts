import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateConfiguredImage, logImageError } from "@/lib/ai-image";
import { imageCapabilities, validateImageConnection } from "@/lib/image-config";
import { readImage, removeImages, saveGeneratedPng } from "@/lib/uploads";
import { imageConfigSchema, imageGenerationSchema } from "@/lib/validators";

const originalAllowedUrls = process.env.USER_AI_ALLOWED_BASE_URLS;
const originalAllowedOutputHosts = process.env.USER_IMAGE_ALLOWED_OUTPUT_HOSTS;
const originalUploadDir = process.env.UPLOAD_DIR;
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=";

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalAllowedUrls === undefined) delete process.env.USER_AI_ALLOWED_BASE_URLS;
  else process.env.USER_AI_ALLOWED_BASE_URLS = originalAllowedUrls;
  if (originalAllowedOutputHosts === undefined) delete process.env.USER_IMAGE_ALLOWED_OUTPUT_HOSTS;
  else process.env.USER_IMAGE_ALLOWED_OUTPUT_HOSTS = originalAllowedOutputHosts;
  if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = originalUploadDir;
});

describe("image configuration", () => {
  it("validates a safe allowlisted image connection", () => {
    process.env.USER_AI_ALLOWED_BASE_URLS = JSON.stringify(["https://www.yyapi.cloud/v1"]);
    expect(validateImageConnection({ provider: "xai-compatible", baseUrl: "https://www.yyapi.cloud/v1/", model: "image-model" }))
      .toEqual({ provider: "xai-compatible", baseUrl: "https://www.yyapi.cloud/v1", model: "image-model" });
    expect(() => validateImageConnection({ provider: "openai-compatible", baseUrl: "https://other.example/v1", model: "image-model" })).toThrow("未获管理员授权");
  });

  it("publishes provider-specific capabilities", () => {
    expect(imageCapabilities("xai-compatible")).toMatchObject({ resolutions: ["1k", "2k"], qualities: ["low", "medium", "high"], maxImages: 1 });
    expect(imageCapabilities("openai-compatible")).toMatchObject({ resolutions: [], qualities: [], maxImages: 1 });
    expect(imageCapabilities("xai-compatible").aspectRatios).toHaveLength(11);
  });

  it("rejects reference image editing in v1", () => {
    expect(imageConfigSchema.parse({ name: "YYAPI Image", provider: "xai-compatible", baseUrl: "https://www.yyapi.cloud/v1", model: "image-model" })).toMatchObject({ name: "YYAPI Image" });
    expect(() => imageGenerationSchema.parse({
      requestId: "1b4d6d34-7d46-4a94-a716-2d2466a9d2a9",
      conversationId: "2b4d6d34-7d46-4a94-a716-2d2466a9d2a9",
      imagePresetId: "user-image-config",
      prompt: "draw",
      referenceAttachmentIds: ["3b4d6d34-7d46-4a94-a716-2d2466a9d2a9"],
    })).toThrow("暂不支持参考图");
  });
});

describe("image provider adapters", () => {
  it("maps xAI-compatible aspect ratio, resolution, and quality", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: [{ b64_json: pngBase64 }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const result = await generateConfiguredImage({ provider: "xai-compatible", baseUrl: "http://127.0.0.1:11434/v1", model: "image-model", apiKey: "test-key" }, {
      prompt: "draw", aspectRatio: "16:9", resolution: "2k", quality: "high",
    }, AbortSignal.timeout(5_000));
    expect(body).toMatchObject({ model: "image-model", aspect_ratio: "16:9", resolution: "2k", quality: "high", n: 1, response_format: "b64_json" });
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it("maps OpenAI-compatible ratios to size", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: [{ b64_json: pngBase64 }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    await generateConfiguredImage({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:11434/v1", model: "image-model", apiKey: "test-key" }, {
      prompt: "draw", aspectRatio: "9:16", resolution: "1k", quality: "high",
    }, AbortSignal.timeout(5_000));
    expect(body).toMatchObject({ model: "image-model", size: "864x1536", n: 1 });
  });

  it("downloads allowlisted URL outputs and converts them for the SDK", async () => {
    process.env.USER_IMAGE_ALLOWED_OUTPUT_HOSTS = JSON.stringify(["example.com"]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://example.com/output.png") {
        return new Response(Buffer.from(pngBase64, "base64"), { status: 200, headers: { "Content-Type": "image/png" } });
      }
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/output.png" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateConfiguredImage({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:11434/v1", model: "image-model", apiKey: "test-key" }, {
      prompt: "draw", aspectRatio: "1:1", resolution: "1k", quality: "high",
    }, AbortSignal.timeout(5_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it("logs only sanitized image error metadata", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logImageError(Object.assign(new Error("secret-key-in-upstream-body"), { statusCode: 401 }), {
      generationId: "generation-id",
      errorCode: "UPSTREAM_AUTH",
    });
    expect(spy).toHaveBeenCalledWith("AI image request failed", {
      generationId: "generation-id",
      errorCode: "UPSTREAM_AUTH",
      name: "Error",
      statusCode: "401",
    });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret-key-in-upstream-body");
    spy.mockRestore();
  });
});

describe("generated image storage", () => {
  it("validates and normalizes generated bytes to PNG", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-chater-generated-"));
    process.env.UPLOAD_DIR = directory;
    try {
      const source = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#336699" } }).webp().toBuffer();
      const saved = await saveGeneratedPng(source);
      expect(saved).toMatchObject({ mimeType: "image/png", width: 64, height: 32 });
      expect((await sharp(await readImage(saved.storageKey)).metadata()).format).toBe("png");
      await removeImages([saved.storageKey]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects invalid and oversized generated outputs", async () => {
    await expect(saveGeneratedPng(Buffer.from("not-an-image"))).rejects.toThrow("图片格式无效");
    await expect(saveGeneratedPng(new Uint8Array(20 * 1024 * 1024 + 1))).rejects.toThrow("图片超过大小限制");
  });
});
