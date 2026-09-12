import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { assertSameOrigin } from "@/server/http/errors";
import { videoGenerationSchema } from "@/shared/validators";
import { enqueueVideoGeneration } from "@/server/services/video-generation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = videoGenerationSchema.parse(await request.json());
    return NextResponse.json({ generation: await enqueueVideoGeneration(user.id, input) }, { status: 202 });
  } catch (error) {
    return routeError(error);
  }
}
