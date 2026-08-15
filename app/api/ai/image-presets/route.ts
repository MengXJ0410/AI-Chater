import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { imagePreset, listModelConfigs } from "@/lib/model-configs";

export async function GET() {
  try {
    const user = await requireUser();
    const configs = await listModelConfigs(user.id);
    return NextResponse.json({ presets: configs.filter((config) => config.kind === "image").map(imagePreset) });
  } catch (error) {
    return routeError(error);
  }
}
