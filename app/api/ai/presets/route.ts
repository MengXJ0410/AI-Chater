import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getPublicAiPresets } from "@/lib/config";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ presets: getPublicAiPresets() });
  } catch (error) {
    return routeError(error);
  }
}
