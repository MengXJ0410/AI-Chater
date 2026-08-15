import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancelImageGeneration, publicGeneration } from "@/lib/image-generation";
import { assertSameOrigin, errorResponse } from "@/lib/http";

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
