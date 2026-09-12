import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";
import { deleteUserAiConfig, getPublicUserAiConfig, getPublicUserAiConnectionPresets, saveUserAiConfig } from "@/server/services/user-ai-config";
import { userAiConfigSchema } from "@/shared/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await getPublicUserAiConfig(user.id);
    return NextResponse.json({ config, presets: getPublicUserAiConnectionPresets(config) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = userAiConfigSchema.parse(await request.json());
    return NextResponse.json({ config: await saveUserAiConfig(user.id, input) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await deleteUserAiConfig(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
