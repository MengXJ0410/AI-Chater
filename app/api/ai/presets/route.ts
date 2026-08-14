import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getPublicAiPresets } from "@/lib/config";
import { getPublicUserAiConfig, toUserAiPreset } from "@/lib/user-ai-config";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await getPublicUserAiConfig(user.id);
    return NextResponse.json({ presets: [...getPublicAiPresets(), ...(config ? [toUserAiPreset(config)] : [])] });
  } catch (error) {
    return routeError(error);
  }
}
