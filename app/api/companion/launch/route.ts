import { NextResponse } from "next/server";
import { createCompanionLaunch } from "@/lib/companion-auth";
import { routeError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return NextResponse.json(await createCompanionLaunch());
  } catch (error) {
    return routeError(error);
  }
}
