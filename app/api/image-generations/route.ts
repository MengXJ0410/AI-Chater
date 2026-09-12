import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { enqueueImageGeneration } from "@/server/services/image-generation";
import { assertSameOrigin } from "@/server/http/errors";
import { imageGenerationSchema } from "@/shared/validators";
import { auditModelConfig } from "@/server/services/model-audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let userId = "";
  try {
    assertSameOrigin(request);
    const user = await requireUser(); userId = user.id;
    const input = imageGenerationSchema.parse(await request.json());
    const generation = await enqueueImageGeneration(user.id, input);
    return NextResponse.json({ generation }, { status: generation?.status === "queued" || generation?.status === "running" ? 202 : 200 });
  } catch (error) {
    if (userId && error instanceof Error && "status" in error && Number(error.status) === 429) await auditModelConfig({ userId, kind: "image", action: "rate_limited", outcome: "rejected", errorCode: "RATE_LIMITED" }).catch(() => undefined);
    return routeError(error);
  }
}
