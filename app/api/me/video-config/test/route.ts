import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { assertSameOrigin } from "@/server/http/errors";
import { resolveVideoConfig } from "@/server/services/video-config";
import { testComfy } from "@/server/providers/comfyui";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const config = await resolveVideoConfig(user.id);
    await testComfy(config);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
