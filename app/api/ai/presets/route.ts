import { NextResponse } from "next/server";
import { requireUser } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { getPublicAiPresets } from "@/server/config";
import { listModelConfigs } from "@/server/services/model-configs";

export async function GET() {
  try {
    const user = await requireUser();
    const configs = await listModelConfigs(user.id);
    return NextResponse.json({ presets: [...getPublicAiPresets(), ...configs.filter((config) => config.kind === "chat").map((config) => ({ id: config.runtimePresetId, label: config.name, model: config.model, supportsImages: false }))] });
  } catch (error) {
    return routeError(error);
  }
}
