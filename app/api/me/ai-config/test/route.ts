import { NextResponse } from "next/server";
import { testModelConnection, logModelError } from "@/lib/ai";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { assertSameOrigin, errorResponse, RequestError } from "@/lib/http";
import { resolveUserAiModelConfig } from "@/lib/user-ai-config";
import { userAiConfigSchema } from "@/lib/validators";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = userAiConfigSchema.parse(await request.json());
    const connection = await resolveUserAiModelConfig(user.id, input);
    await testModelConnection(connection, AbortSignal.timeout(20_000));
    return NextResponse.json({ ok: true, model: connection.model });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ZodError || error instanceof RequestError) return routeError(error);
    logModelError(error);
    return errorResponse("连接测试失败，请检查 API Key、Base URL 和 Model。", 502);
  }
}
