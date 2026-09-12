import { NextResponse } from "next/server";
import { createCompanionLaunch } from "@/server/security/companion-auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return NextResponse.json(await createCompanionLaunch());
  } catch (error) {
    return routeError(error);
  }
}
