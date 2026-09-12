import { NextResponse } from "next/server";
import { deleteSession } from "@/server/security/auth";
import { routeError } from "@/server/http/route-error";
import { assertSameOrigin } from "@/server/http/errors";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
