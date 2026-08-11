import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
