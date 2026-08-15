import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getPublicAiPresets } from "@/lib/config";
import { listModelConfigs } from "@/lib/model-configs";

export async function GET() {
  try {
    const user = await requireUser();
    const configs = await listModelConfigs(user.id);
    return NextResponse.json({ presets: [...getPublicAiPresets(), ...configs.filter((config) => config.kind === "chat").map((config) => ({ id: config.runtimePresetId, label: config.name, model: config.model, supportsImages: false }))] });
  } catch (error) {
    return routeError(error);
  }
}
