import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { cancelImageGeneration, publicGeneration } from "@/server/services/image-generation";
import { assertSameOrigin, errorResponse } from "@/server/http/errors";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const generation = await publicGeneration(user.id, id);
    return generation ? NextResponse.json({ generation }) : errorResponse("生图任务不存在。", 404);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    return NextResponse.json({ generation: await cancelImageGeneration(user.id, id) });
  } catch (error) {
    return routeError(error);
  }
}
