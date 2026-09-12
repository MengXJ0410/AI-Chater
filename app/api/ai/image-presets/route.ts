import { NextResponse } from "next/server";
import { routeError } from "@/server/http/route-error";
import { requireUser } from "@/server/security/auth";
import { imagePreset, listModelConfigs } from "@/server/services/model-configs";

export async function GET() {
  try {
    const user = await requireUser();
    const configs = await listModelConfigs(user.id);
    return NextResponse.json({ presets: configs.filter((config) => config.kind === "image").map(imagePreset) });
  } catch (error) {
    return routeError(error);
  }
}
