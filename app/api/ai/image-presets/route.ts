import { NextResponse } from "next/server";
import { routeError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getPublicImageConfig, imageCapabilities, USER_IMAGE_PRESET_ID } from "@/lib/image-config";

export async function GET() {
  try {
    const user = await requireUser();
    const config = await getPublicImageConfig(user.id);
    return NextResponse.json({
      presets: config ? [{
        id: USER_IMAGE_PRESET_ID,
        label: config.name,
        model: config.model,
        ...imageCapabilities(config.provider),
      }] : [],
    });
  } catch (error) {
    return routeError(error);
  }
}
