import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateConfiguredImage, logImageError } from "@/server/providers/ai-image";
import { routeError } from "@/server/http/route-error";
import { requireUser, UnauthorizedError } from "@/server/security/auth";
import { resolveImageConnection } from "@/server/services/image-config";
import { assertSameOrigin, errorResponse, RequestError } from "@/server/http/errors";
import { removeImages, saveGeneratedPng } from "@/server/services/uploads";
import { imageConfigSchema } from "@/shared/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let storageKey: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = imageConfigSchema.parse(await request.json());
    const connection = await resolveImageConnection(user.id, input);
    const result = await generateConfiguredImage(connection, {
      prompt: "A simple blue circle on a white background.",
      aspectRatio: "1:1",
      resolution: "1k",
      quality: "low",
    }, AbortSignal.timeout(120_000));
    const saved = await saveGeneratedPng(result.bytes);
    storageKey = saved.storageKey;
    await removeImages([saved.storageKey]);
    storageKey = undefined;
    return NextResponse.json({ ok: true, model: connection.model, chargedImageGenerated: true });
  } catch (error) {
    if (storageKey) await removeImages([storageKey]).catch(() => undefined);
    if (error instanceof UnauthorizedError || error instanceof ZodError || error instanceof RequestError) return routeError(error);
    logImageError(error, { operation: "connection-test" });
    return errorResponse("生图连接测试失败，请检查 API Key、Base URL、图片模型和协议。", 502);
  }
}
