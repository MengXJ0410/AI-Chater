import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { deleteImageConfig, getPublicImageConfig, imageCapabilities } from "@/server/services/image-config";
import { assertSameOrigin } from "@/server/http/errors";
import { imageConfigSchema } from "@/shared/validators";
import { saveImageConfig } from "@/server/services/image-config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await getPublicImageConfig(user.id);
    return NextResponse.json({
      config,
      providers: [
        { id: "xai-compatible", label: "xAI Compatible", capabilities: imageCapabilities("xai-compatible") },
        { id: "openai-compatible", label: "OpenAI Compatible", capabilities: imageCapabilities("openai-compatible") },
      ],
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = imageConfigSchema.parse(await request.json());
    return NextResponse.json({ config: await saveImageConfig(user.id, input) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await deleteImageConfig(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
